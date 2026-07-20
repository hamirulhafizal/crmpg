import SwiftUI

@MainActor
@Observable
final class PGSyncViewModel {
    var status: PgSyncStatusResponse?
    var recentJobs: [PgSyncJobRecord] = []
    var pgPassword = ""
    var crmpgPassword = ""
    var tacCode = ""
    var isLoading = false
    var isStarting = false
    var isSubmittingTac = false
    var errorMessage: String?
    var infoMessage: String?
    var usedSupabaseFallback = false
    var needsWebFallback = false

    private var pollTask: Task<Void, Never>?
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
    private var lastJobStatus: String?
    private var scenePhase: ScenePhase = .active

    var activeJobId: String? {
        status?.activeJobId ?? status?.activeJob?.id ?? status?.dbJob?.workerJobId
    }

    var activeJobStatus: String? {
        status?.activeJob?.status ?? status?.dbJob?.status
    }

    var isAwaitingTac: Bool {
        (activeJobStatus ?? "").lowercased().contains("awaiting_tac")
            || (activeJobStatus ?? "").lowercased() == "awaiting tac"
    }

    var isAwaitingCaptcha: Bool {
        (activeJobStatus ?? "").lowercased().contains("captcha")
    }

    var hasActiveJob: Bool {
        guard let status = activeJobStatus else { return false }
        return activeStatus(status)
    }

    func updateScenePhase(_ phase: ScenePhase) {
        scenePhase = phase
        if phase == .background, hasActiveJob {
            beginBackgroundPolling()
            if isAwaitingTac, let jobId = activeJobId {
                Task {
                    await PGSyncLocalNotifier.notifyAwaitingTac(
                        jobId: jobId,
                        pgCode: status?.pgCode
                    )
                }
            }
        } else if phase == .active {
            endBackgroundPolling()
        }
    }

    func load(userId: UUID?) async {
        isLoading = true
        errorMessage = nil
        usedSupabaseFallback = false
        defer { isLoading = false }

        do {
            let previous = lastJobStatus
            status = try await APIClient.shared.get(.pgSyncStatus)
            await handleStatusTransition(previous: previous)
            startPolling(userId: userId)
            if let userId {
                recentJobs = (try? await SupabaseRepository.fetchPgSyncJobs(userId: userId)) ?? []
            }
            if let message = status?.queueInfo?.displayMessage, !message.isEmpty {
                infoMessage = message
            }
            return
        } catch {
            // Fall back until Bearer pg-sync is deployed.
        }

        guard let userId else {
            errorMessage = "Sign in required."
            return
        }

        do {
            recentJobs = try await SupabaseRepository.fetchPgSyncJobs(userId: userId)
            usedSupabaseFallback = true
            if let active = recentJobs.first(where: \.isActive) {
                status = PgSyncStatusResponse(
                    ok: true,
                    pgCode: active.pgCode,
                    activeJobId: active.workerJobId,
                    activeJob: PgSyncActiveJob(
                        id: active.workerJobId,
                        status: active.status,
                        pgCode: active.pgCode,
                        queuePosition: active.queuePosition,
                        error: active.errorMessage,
                        syncProgress: nil
                    ),
                    dbJob: active,
                    queueInfo: nil,
                    isMyTurn: nil,
                    error: nil
                )
                lastJobStatus = active.status
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func startSync(userId: UUID?) async {
        isStarting = true
        errorMessage = nil
        infoMessage = nil
        needsWebFallback = false
        defer { isStarting = false }

        let pg = pgPassword.trimmingCharacters(in: .whitespacesAndNewlines)
        let crm = crmpgPassword.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !pg.isEmpty, !crm.isEmpty else {
            errorMessage = "Enter both PG Business Center and CRMPG passwords."
            return
        }

        await SupabaseManager.shared.refreshSessionIfNeeded()
        await PGSyncLocalNotifier.prepareForActiveSync()

        do {
            let response: PgSyncCreateJobResponse = try await APIClient.shared.post(
                .pgSyncJobs,
                body: PgSyncCreateJobBody(pgPassword: pg, crmpgPassword: crm)
            )
            pgPassword = ""
            crmpgPassword = ""
            infoMessage = response.job?.message ?? "Sync job queued."
            await load(userId: userId)
        } catch let error as APIError {
            switch error {
            case .unauthorized:
                errorMessage =
                    "Unauthorized — production API still rejects mobile Bearer tokens for PG Sync. Deploy the latest `/api/pg-sync` auth changes, or start sync from the web app."
                needsWebFallback = true
            case .server(let status, let message):
                if status == 401 {
                    errorMessage =
                        "Unauthorized — production API still rejects mobile Bearer tokens for PG Sync. Deploy the latest `/api/pg-sync` auth changes, or start sync from the web app."
                    needsWebFallback = true
                } else {
                    errorMessage = message ?? error.localizedDescription
                }
            default:
                errorMessage = error.localizedDescription
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func submitTac(userId: UUID?) async {
        let code = tacCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty else {
            errorMessage = "Enter the SMS TAC code."
            return
        }
        guard let jobId = activeJobId, !jobId.isEmpty else {
            errorMessage = "No active sync job found."
            return
        }

        isSubmittingTac = true
        errorMessage = nil
        defer { isSubmittingTac = false }

        await SupabaseManager.shared.refreshSessionIfNeeded()

        do {
            let _: PgSyncTacResponse = try await APIClient.shared.post(
                .pgSyncJobTac(jobId: jobId),
                body: PgSyncTacBody(tac: code)
            )
            tacCode = ""
            infoMessage = "TAC submitted. Continuing sync…"
            PGSyncLocalNotifier.clearTacNotification(jobId: jobId)
            await load(userId: userId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
        endBackgroundPolling()
    }

    private func startPolling(userId: UUID?) {
        pollTask?.cancel()
        pollTask = Task {
            while !Task.isCancelled {
                let interval: Duration = isAwaitingTac ? .seconds(2) : .seconds(5)
                try? await Task.sleep(for: interval)
                guard !Task.isCancelled else { break }
                do {
                    let previous = lastJobStatus
                    status = try await APIClient.shared.get(.pgSyncStatus)
                    await handleStatusTransition(previous: previous)
                    if let userId {
                        recentJobs = (try? await SupabaseRepository.fetchPgSyncJobs(userId: userId)) ?? recentJobs
                    }
                    if let message = status?.queueInfo?.displayMessage, !message.isEmpty {
                        infoMessage = message
                    }
                } catch {
                    break
                }
            }
        }
    }

    private func handleStatusTransition(previous: String?) async {
        let next = activeJobStatus
        lastJobStatus = next
        guard let next, let jobId = activeJobId else { return }

        let prevNorm = (previous ?? "").lowercased()
        let nextNorm = next.lowercased()
        let becameTac = nextNorm.contains("awaiting_tac") && !prevNorm.contains("awaiting_tac")

        guard becameTac else { return }

        infoMessage = "SMS TAC required — enter the code below to continue."

        // Notify when app is not actively on screen, or always schedule so lock-screen sees it.
        if scenePhase != .active {
            await PGSyncLocalNotifier.notifyAwaitingTac(jobId: jobId, pgCode: status?.pgCode)
        } else {
            // Still notify so user gets a banner if they navigated away from this screen.
            await PGSyncLocalNotifier.notifyAwaitingTac(jobId: jobId, pgCode: status?.pgCode)
        }
    }

    private func beginBackgroundPolling() {
        guard backgroundTask == .invalid else { return }
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "pg-sync-poll") { [weak self] in
            Task { @MainActor in
                self?.endBackgroundPolling()
            }
        }
    }

    private func endBackgroundPolling() {
        guard backgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTask)
        backgroundTask = .invalid
    }

    private func activeStatus(_ status: String) -> Bool {
        switch status.lowercased() {
        case "completed", "failed", "cancelled": false
        default: true
        }
    }
}

struct PGSyncView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.scenePhase) private var scenePhase
    @State private var viewModel = PGSyncViewModel()
    @State private var showPgPassword = false
    @State private var showCrmpgPassword = false
    @State private var showWebSync = false

    private var userId: UUID? {
        appState.profile?.id ?? SupabaseManager.shared.currentUser?.id
    }

    private var webSyncURL: URL {
        URL(string: "/customers", relativeTo: AppConfig.apiBaseURL)!.absoluteURL
    }

    var body: some View {
        Form {
            if let error = viewModel.errorMessage {
                Section {
                    Text(error)
                        .font(PGTypography.caption)
                        .foregroundStyle(.red)
                    if viewModel.needsWebFallback {
                        Button {
                            showWebSync = true
                        } label: {
                            Label("Open sync on web", systemImage: "safari")
                        }
                    }
                }
            }
            if let info = viewModel.infoMessage {
                Section {
                    Text(info)
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.success)
                }
            }

            if viewModel.isAwaitingTac {
                Section {
                    Text("Enter the SMS TAC sent to your registered phone for PG Mall login.")
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.secondaryText)
                    TextField("TAC code", text: $viewModel.tacCode)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    Button {
                        Task { await viewModel.submitTac(userId: userId) }
                    } label: {
                        if viewModel.isSubmittingTac {
                            ProgressView()
                        } else {
                            Label("Submit TAC", systemImage: "checkmark.shield.fill")
                        }
                    }
                    .disabled(viewModel.isSubmittingTac || viewModel.tacCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } header: {
                    Text("TAC required")
                } footer: {
                    Text("The sync pauses until this code is submitted.")
                }
            }

            if viewModel.isAwaitingCaptcha {
                Section {
                    Text("Complete the CAPTCHA in the sync browser session, then continue from the web if needed.")
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.secondaryText)
                    Button {
                        showWebSync = true
                    } label: {
                        Label("Open sync on web", systemImage: "safari")
                    }
                } header: {
                    Text("CAPTCHA required")
                }
            }

            Section("Status") {
                if viewModel.isLoading && viewModel.status == nil && viewModel.recentJobs.isEmpty {
                    ProgressView("Checking sync…")
                } else if let status = viewModel.status {
                    LabeledContent("PG code", value: status.pgCode ?? appState.profile?.pgcode ?? "—")
                    if let job = status.activeJob {
                        LabeledContent("Job", value: job.status?.replacingOccurrences(of: "_", with: " ").capitalized ?? "—")
                        if let pos = job.queuePosition {
                            LabeledContent("Queue", value: "#\(pos)")
                        }
                        if let pct = job.syncProgress?.pct {
                            ProgressView(value: min(max(pct / 100, 0), 1)) {
                                Text(job.syncProgress?.message ?? "Syncing…")
                                    .font(PGTypography.caption)
                            }
                        } else if let message = job.syncProgress?.message ?? job.error {
                            Text(message)
                                .font(PGTypography.caption)
                                .foregroundStyle(PGColors.secondaryText)
                        }
                    } else if let db = status.dbJob {
                        LabeledContent("Last job", value: db.statusTitle)
                    } else {
                        Text("No active sync")
                            .foregroundStyle(PGColors.secondaryText)
                    }
                    if viewModel.usedSupabaseFallback {
                        Text("Showing job history from Supabase. Deploy Bearer `/api/pg-sync` for live queue status.")
                            .font(PGTypography.caption)
                            .foregroundStyle(PGColors.secondaryText)
                    }
                } else {
                    Text(appState.profile?.pgcode?.isEmpty == false
                        ? "Ready to sync"
                        : "Add your PG code in Profile before syncing.")
                        .foregroundStyle(PGColors.secondaryText)
                }
            }

            if !viewModel.hasActiveJob {
                Section {
                    PasswordRevealField(
                        title: "PG Business Center password",
                        text: $viewModel.pgPassword,
                        isVisible: $showPgPassword
                    )
                    PasswordRevealField(
                        title: "CRMPG account password",
                        text: $viewModel.crmpgPassword,
                        isVisible: $showCrmpgPassword
                    )
                    Button {
                        Task { await viewModel.startSync(userId: userId) }
                    } label: {
                        if viewModel.isStarting {
                            ProgressView()
                        } else {
                            Label("Start sync", systemImage: "play.fill")
                        }
                    }
                    .disabled(viewModel.isStarting || (appState.profile?.pgcode?.isEmpty ?? true))
                } header: {
                    Text("Start job")
                } footer: {
                    Text("Passwords are sent securely to start the job and are never stored. You’ll get a notification if TAC is required while the app is in the background.")
                }
            }

            if !viewModel.recentJobs.isEmpty {
                Section("Recent jobs") {
                    ForEach(viewModel.recentJobs) { job in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(job.statusTitle)
                                    .font(PGTypography.headline)
                                Spacer()
                                if job.isActive {
                                    Text("Active")
                                        .font(PGTypography.caption)
                                        .foregroundStyle(PGColors.goldDark)
                                }
                            }
                            Text(job.workerJobId)
                                .font(PGTypography.caption)
                                .foregroundStyle(PGColors.secondaryText)
                                .lineLimit(1)
                            if let error = job.errorMessage, !error.isEmpty {
                                Text(error)
                                    .font(PGTypography.caption)
                                    .foregroundStyle(.red)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
        .navigationTitle("PG Sync")
        .refreshable { await viewModel.load(userId: userId) }
        .task { await viewModel.load(userId: userId) }
        .onChange(of: scenePhase) { _, phase in
            viewModel.updateScenePhase(phase)
        }
        .onDisappear { viewModel.stopPolling() }
        .sheet(isPresented: $showWebSync) {
            CampaignWebEditorSheet(title: "PG Sync (web)", url: webSyncURL)
        }
    }
}

private struct PasswordRevealField: View {
    let title: String
    @Binding var text: String
    @Binding var isVisible: Bool

    var body: some View {
        HStack(spacing: 10) {
            Group {
                if isVisible {
                    TextField(title, text: $text)
                        .textContentType(.password)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } else {
                    SecureField(title, text: $text)
                        .textContentType(.password)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                isVisible.toggle()
            } label: {
                Image(systemName: isVisible ? "eye.slash.fill" : "eye.fill")
                    .foregroundStyle(PGColors.secondaryText)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isVisible ? "Hide password" : "Show password")
        }
    }
}

#Preview {
    NavigationStack {
        PGSyncView()
            .environment(AppState())
    }
}
