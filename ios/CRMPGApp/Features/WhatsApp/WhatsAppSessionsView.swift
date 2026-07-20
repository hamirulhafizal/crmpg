import SwiftUI

@MainActor
@Observable
final class WhatsAppSessionsViewModel {
    var provider: WhatsAppProviderInfo?
    var sessions: [WhatsAppSession] = []
    var isLoading = false
    var isActing = false
    var errorMessage: String?
    var infoMessage: String?
    var usedSupabaseFallback = false

    func load(userId: UUID?) async {
        isLoading = true
        errorMessage = nil
        infoMessage = nil
        usedSupabaseFallback = false
        defer { isLoading = false }

        async let providerTask: Void = loadProvider()
        async let sessionsTask: Void = loadSessions(userId: userId)
        _ = await (providerTask, sessionsTask)
    }

    func loadProvider() async {
        do {
            provider = try await APIClient.shared.get(.whatsappProvider)
        } catch {
            // Optional banner — unauthorized is expected until Bearer auth is deployed.
        }
    }

    func loadSessions(userId: UUID?) async {
        do {
            let response: WhatsAppSessionsResponse = try await APIClient.shared.get(.wahaSessions)
            sessions = response.sessions ?? []
            if let err = response.error, !err.isEmpty {
                errorMessage = err
            }
            return
        } catch let error as APIError {
            if case .server(let status, let message) = error, status == 503 {
                errorMessage = message ?? "WhatsApp integration is not configured."
                sessions = []
                return
            }
            // Fall through to Supabase for 401 / network / deploy lag.
        } catch {
            // Fall through.
        }

        guard let userId else {
            errorMessage = "Sign in required to load WhatsApp sessions."
            return
        }

        do {
            sessions = try await SupabaseRepository.fetchWhatsAppSessions(userId: userId)
            usedSupabaseFallback = true
            if sessions.isEmpty {
                infoMessage = nil
            } else {
                infoMessage = "Showing saved session status. Live QR/start needs Bearer WhatsApp API deployed."
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createSession(phone: String, userId: UUID?) async -> WhatsAppSession? {
        let name = phone.filter(\.isNumber)
        guard name.count >= 8 else {
            errorMessage = "Enter a valid phone number with country code (e.g. 60123456789)."
            return nil
        }

        isActing = true
        errorMessage = nil
        defer { isActing = false }

        do {
            let created: WhatsAppSession = try await APIClient.shared.post(
                .wahaSessions,
                body: CreateWhatsAppSessionBody(name: name, start: true)
            )
            infoMessage = "Session created."
            await loadSessions(userId: userId)
            return created
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func start(_ session: WhatsAppSession, userId: UUID?) async {
        await mutate(userId: userId) {
            let _: WhatsAppSession = try await APIClient.shared.post(
                .wahaSessionStart(name: session.name),
                body: EmptyJSONBody()
            )
        }
    }

    func stop(_ session: WhatsAppSession, userId: UUID?) async {
        await mutate(userId: userId) {
            let _: WhatsAppSession = try await APIClient.shared.post(
                .wahaSessionStop(name: session.name),
                body: EmptyJSONBody()
            )
        }
    }

    func delete(_ session: WhatsAppSession, userId: UUID?) async {
        await mutate(userId: userId) {
            try await APIClient.shared.delete(.wahaSession(name: session.name))
        }
    }

    private func mutate(userId: UUID?, _ work: () async throws -> Void) async {
        isActing = true
        errorMessage = nil
        defer { isActing = false }
        do {
            try await work()
            await loadSessions(userId: userId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct EmptyJSONBody: Encodable {}

struct WhatsAppSessionsView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = WhatsAppSessionsViewModel()
    @State private var showCreate = false
    @State private var phoneDraft = ""
    @State private var sessionToDelete: WhatsAppSession?
    @State private var createdSessionName: String?

    private var userId: UUID? {
        appState.profile?.id ?? SupabaseManager.shared.currentUser?.id
    }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.sessions.isEmpty && viewModel.provider == nil {
                LoadingView(message: "Loading WhatsApp…")
            } else if viewModel.sessions.isEmpty {
                emptyContent
            } else {
                listContent
            }
        }
        .background(PGColors.background)
        .navigationTitle("WhatsApp")
        .navigationDestination(for: WhatsAppSession.self) { session in
            WhatsAppSessionDetailView(sessionName: session.name)
        }
        .navigationDestination(item: $createdSessionName) { name in
            WhatsAppSessionDetailView(sessionName: name)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showCreate = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .refreshable {
            await viewModel.load(userId: userId)
        }
        .task {
            await viewModel.load(userId: userId)
        }
        .alert("Create session", isPresented: $showCreate) {
            TextField("Phone (60123456789)", text: $phoneDraft)
                .keyboardType(.phonePad)
            Button("Cancel", role: .cancel) {
                phoneDraft = ""
            }
            Button("Create") {
                Task {
                    if let created = await viewModel.createSession(phone: phoneDraft, userId: userId) {
                        phoneDraft = ""
                        createdSessionName = created.name
                    }
                }
            }
        } message: {
            Text("Use your WhatsApp number with country code. This becomes the session name.")
        }
        .confirmationDialog(
            "Delete session?",
            isPresented: Binding(
                get: { sessionToDelete != nil },
                set: { if !$0 { sessionToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let session = sessionToDelete {
                Button("Delete \(session.name)", role: .destructive) {
                    Task { await viewModel.delete(session, userId: userId) }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .overlay(alignment: .bottom) {
            if let message = viewModel.errorMessage ?? viewModel.infoMessage {
                Text(message)
                    .font(PGTypography.caption)
                    .foregroundStyle(viewModel.errorMessage != nil ? PGColors.destructive : PGColors.primaryText)
                    .padding(12)
                    .frame(maxWidth: .infinity)
                    .background(.ultraThinMaterial)
            }
        }
    }

    private var emptyContent: some View {
        VStack(spacing: 20) {
            if let provider = viewModel.provider {
                providerBanner(provider)
                    .padding(.horizontal)
            }

            EmptyStateView(
                icon: "message.fill",
                title: "No sessions yet",
                message: viewModel.errorMessage
                    ?? "Create a session with your phone number, then scan the QR code in WhatsApp → Linked devices."
            )

            PGPrimaryButton(title: "Add session", isLoading: viewModel.isActing) {
                showCreate = true
            }
            .padding(.horizontal, 24)

            Link(destination: URL(string: "https://www.publicgolds.com/waha-integration")!) {
                Label("Open web dashboard", systemImage: "safari")
            }
            .font(PGTypography.caption)
        }
    }

    private var listContent: some View {
        List {
            if let provider = viewModel.provider {
                Section {
                    providerBanner(provider)
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                        .listRowBackground(Color.clear)
                }
            }

            Section {
                ForEach(viewModel.sessions) { session in
                    NavigationLink(value: session) {
                        WhatsAppSessionRow(session: session)
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            sessionToDelete = session
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                        if case .working = session.statusKind {
                            Button {
                                Task { await viewModel.stop(session, userId: userId) }
                            } label: {
                                Label("Stop", systemImage: "pause.fill")
                            }
                            .tint(.orange)
                        } else {
                            Button {
                                Task { await viewModel.start(session, userId: userId) }
                            } label: {
                                Label("Start", systemImage: "play.fill")
                            }
                            .tint(.green)
                        }
                    }
                }
            } header: {
                Text("Sessions")
            } footer: {
                if viewModel.usedSupabaseFallback {
                    Text("Status from saved session data. Deploy Bearer WhatsApp API for live QR and start/stop.")
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func providerBanner(_ info: WhatsAppProviderInfo) -> some View {
        PGCard {
            HStack(spacing: 12) {
                Image(systemName: "server.rack")
                    .foregroundStyle(PGColors.gold)
                VStack(alignment: .leading, spacing: 4) {
                    Text(info.displayProvider)
                        .font(PGTypography.headline)
                    if let server = info.serverName, !server.isEmpty {
                        Text(server)
                            .font(PGTypography.caption)
                            .foregroundStyle(PGColors.secondaryText)
                    } else {
                        Text(info.isProActive == true ? "Pro active" : "Check plan for provider access")
                            .font(PGTypography.caption)
                            .foregroundStyle(PGColors.secondaryText)
                    }
                }
                Spacer()
                if info.isProActive == true {
                    Image(systemName: "crown.fill")
                        .foregroundStyle(PGColors.gold)
                }
            }
        }
    }
}

struct WhatsAppSessionRow: View {
    let session: WhatsAppSession

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: session.statusKind.systemImage)
                .foregroundStyle(statusTint(session.statusKind))
                .font(.title3)
            VStack(alignment: .leading, spacing: 4) {
                Text(session.displayName)
                    .font(PGTypography.headline)
                Text(session.name)
                    .font(PGTypography.caption)
                    .foregroundStyle(PGColors.secondaryText)
            }
            Spacer()
            Text(session.statusKind.title)
                .font(PGTypography.caption)
                .foregroundStyle(statusTint(session.statusKind))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(statusTint(session.statusKind).opacity(0.12))
                .clipShape(Capsule())
        }
        .padding(.vertical, 4)
    }
}

func statusTint(_ status: WhatsAppSessionStatus) -> Color {
    switch status {
    case .working: PGColors.success
    case .scanQR: PGColors.gold
    case .starting: .orange
    case .stopped: PGColors.secondaryText
    case .failed: PGColors.destructive
    case .unknown: PGColors.secondaryText
    }
}

#Preview {
    NavigationStack {
        WhatsAppSessionsView()
    }
}
