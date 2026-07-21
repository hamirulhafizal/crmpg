import SwiftUI
import SafariServices
import WebKit

@MainActor
@Observable
final class CampaignsViewModel {
    var campaigns: [Campaign] = []
    var filter: CampaignFilter = .all
    var isLoading = false
    var isActing = false
    var errorMessage: String?
    var infoMessage: String?
    var usedSupabaseFallback = false

    enum CampaignFilter: String, CaseIterable, Identifiable {
        case all, active, paused, draft, archived
        var id: String { rawValue }
        var title: String { rawValue.capitalized }
    }

    var filtered: [Campaign] {
        switch filter {
        case .all:
            campaigns.filter { $0.statusKind != .archived }
        case .active:
            campaigns.filter { $0.statusKind == .active }
        case .paused:
            campaigns.filter { $0.statusKind == .paused }
        case .draft:
            campaigns.filter { $0.statusKind == .draft }
        case .archived:
            campaigns.filter { $0.statusKind == .archived }
        }
    }

    var activeCount: Int {
        campaigns.filter { $0.statusKind == .active }.count
    }

    func load(userId: UUID?) async {
        isLoading = true
        errorMessage = nil
        usedSupabaseFallback = false
        defer { isLoading = false }

        do {
            let response: CampaignsListResponse = try await APIClient.shared.get(.campaigns)
            campaigns = response.items
            return
        } catch {
            // Fall back until Bearer campaigns API is deployed.
        }

        guard let userId else {
            errorMessage = "Sign in required."
            return
        }

        do {
            campaigns = try await SupabaseRepository.fetchCampaigns(userId: userId)
            usedSupabaseFallback = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setStatus(_ campaign: Campaign, status: String, userId: UUID?) async {
        isActing = true
        errorMessage = nil
        defer { isActing = false }

        do {
            let envelope: CampaignPatchEnvelope = try await APIClient.shared.patch(
                .campaign(id: campaign.id),
                body: CampaignStatusPatch(status: status)
            )
            if let updated = envelope.data {
                if let idx = campaigns.firstIndex(where: { $0.id == updated.id }) {
                    campaigns[idx] = updated
                }
            } else {
                await load(userId: userId)
            }
            infoMessage = "Campaign \(status)."
        } catch {
            // Supabase fallback for pause/resume/archive
            do {
                try await SupabaseRepository.updateCampaignStatus(id: campaign.id, status: status)
                await load(userId: userId)
                infoMessage = "Campaign \(status)."
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

struct CampaignListView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = CampaignsViewModel()
    @State private var showCreateWeb = false

    private var userId: UUID? {
        appState.profile?.id ?? SupabaseManager.shared.currentUser?.id
    }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.campaigns.isEmpty {
                CampaignListSkeletonView()
            } else if viewModel.filtered.isEmpty {
                EmptyStateView(
                    icon: "megaphone.fill",
                    title: viewModel.filter == .all ? "No campaigns yet" : "No \(viewModel.filter.title.lowercased()) campaigns",
                    message: viewModel.errorMessage
                        ?? "Create workflows on the web builder, then monitor status and analytics here."
                )
            } else {
                List {
                    Section {
                        Picker("Filter", selection: $viewModel.filter) {
                            ForEach(CampaignsViewModel.CampaignFilter.allCases) { filter in
                                Text(filter.title).tag(filter)
                            }
                        }
                        .pickerStyle(.segmented)
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                        .listRowBackground(Color.clear)
                    }

                    Section {
                        ForEach(viewModel.filtered) { campaign in
                            NavigationLink {
                                CampaignWebDetailView(campaign: campaign)
                            } label: {
                                CampaignRow(campaign: campaign)
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                statusSwipeActions(for: campaign)
                            }
                        }
                    } footer: {
                        if viewModel.usedSupabaseFallback {
                            Text("Loaded via Supabase. Deploy Bearer `/api/campaigns` for full analytics.")
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .background(PGColors.background)
        .navigationTitle("Campaigns")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showCreateWeb = true
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
        .sheet(isPresented: $showCreateWeb) {
            CampaignWebEditorSheet(
                title: "New campaign",
                url: URL(string: "https://www.publicgolds.com/dashboard/campaigns/new")!
            )
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
        .onChange(of: showCreateWeb) { _, isPresented in
            if !isPresented {
                Task { await viewModel.load(userId: userId) }
            }
        }
    }

    @ViewBuilder
    private func statusSwipeActions(for campaign: Campaign) -> some View {
        switch campaign.statusKind {
        case .active:
            Button {
                Task { await viewModel.setStatus(campaign, status: "paused", userId: userId) }
            } label: {
                Label("Pause", systemImage: "pause.fill")
            }
            .tint(.orange)
        case .paused, .draft:
            Button {
                Task { await viewModel.setStatus(campaign, status: "active", userId: userId) }
            } label: {
                Label("Activate", systemImage: "play.fill")
            }
            .tint(.green)
        default:
            EmptyView()
        }

        if campaign.statusKind != .archived {
            Button {
                Task { await viewModel.setStatus(campaign, status: "archived", userId: userId) }
            } label: {
                Label("Archive", systemImage: "archivebox")
            }
            .tint(.gray)
        }
    }
}

private struct CampaignListSkeletonView: View {
    private let rowCount = 7

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                HStack(spacing: 1) {
                    ForEach(0..<5, id: \.self) { index in
                        SkeletonBlock(
                            height: 34,
                            cornerRadius: index == 0 ? 9 : 4
                        )
                    }
                }
                .padding(3)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(spacing: 0) {
                    ForEach(0..<rowCount, id: \.self) { index in
                        HStack(spacing: 12) {
                            SkeletonCircle(size: 22)

                            VStack(alignment: .leading, spacing: 7) {
                                SkeletonBlock(
                                    height: 17,
                                    width: index.isMultiple(of: 3) ? 140 : 116,
                                    cornerRadius: 6
                                )
                                SkeletonBlock(
                                    height: 12,
                                    width: index.isMultiple(of: 2) ? 102 : 82,
                                    cornerRadius: 5
                                )
                            }

                            Spacer(minLength: 8)

                            SkeletonBlock(
                                height: 26,
                                width: 58,
                                cornerRadius: 13
                            )
                        }
                        .frame(height: 79)
                        .padding(.horizontal, 20)

                        if index < rowCount - 1 {
                            Divider()
                                .padding(.leading, 62)
                        }
                    }
                }
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .padding(.horizontal, 22)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .scrollDisabled(true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading campaigns")
    }
}

/// Displays the full responsive web campaign details inside the native navigation stack.
/// Falls back to the native detail view if the web session can't authenticate the frame.
private struct CampaignWebDetailView: View {
    let campaign: Campaign

    @State private var resolvedURL: URL?
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var showNativeFallback = false

    var body: some View {
        Group {
            if showNativeFallback {
                CampaignDetailView(campaignId: campaign.id, seed: campaign)
            } else {
                webFrame
            }
        }
        .navigationTitle(campaign.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !showNativeFallback {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            resolvedURL = nil
                            Task { await resolveAuthenticatedURL() }
                        } label: {
                            Label("Reload", systemImage: "arrow.clockwise")
                        }
                        Button {
                            showNativeFallback = true
                        } label: {
                            Label("Show summary view", systemImage: "list.bullet.rectangle")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
        .task(id: campaign.id) {
            await resolveAuthenticatedURL()
        }
    }

    private var webFrame: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()

            if let resolvedURL {
                EmbeddedCampaignWebView(
                    url: resolvedURL,
                    isLoading: $isLoading,
                    errorMessage: $loadError,
                    onAuthBounce: { showNativeFallback = true }
                )
                .ignoresSafeArea(edges: .bottom)
                .opacity(isLoading ? 0 : 1)
            }

            if isLoading, loadError == nil {
                VStack(spacing: 14) {
                    ProgressView().controlSize(.large)
                    Text("Loading campaign…")
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.secondaryText)
                }
                .transition(.opacity)
            }

            if let loadError, !isLoading {
                ContentUnavailableView {
                    Label("Couldn’t load campaign", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Try Again") {
                        resolvedURL = nil
                        Task { await resolveAuthenticatedURL() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(PGColors.brandPurple)

                    Button("Show summary view") {
                        showNativeFallback = true
                    }
                }
            }
        }
        .background(PGColors.background)
        .animation(.easeInOut(duration: 0.25), value: isLoading)
    }

    private func resolveAuthenticatedURL() async {
        isLoading = true
        loadError = nil
        resolvedURL = await AuthenticatedWebSession.url(
            opening: "/dashboard/campaigns?view=\(campaign.id.uuidString)&embedded=ios"
        )
    }
}

private struct EmbeddedCampaignWebView: UIViewRepresentable {
    let url: URL
    @Binding var isLoading: Bool
    @Binding var errorMessage: String?
    var onAuthBounce: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: """
                (() => {
                  const hideEmbeddedClose = () => {
                    const params = new URLSearchParams(window.location.search);
                    if (params.get('embedded') !== 'ios') return;
                    document
                      .querySelectorAll('header button[aria-label="Close"]')
                      .forEach((button) => { button.style.display = 'none'; });
                  };
                  hideEmbeddedClose();
                  new MutationObserver(hideEmbeddedClose).observe(
                    document.documentElement,
                    { childList: true, subtree: true }
                  );
                })();
                """,
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: true
            )
        )

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.isOpaque = true
        webView.backgroundColor = .systemBackground
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.parent = self
        if webView.url == nil, !context.coordinator.hasLoaded {
            webView.load(URLRequest(url: url))
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var parent: EmbeddedCampaignWebView
        var hasLoaded = false

        init(parent: EmbeddedCampaignWebView) {
            self.parent = parent
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            hasLoaded = true

            // A redirect to /login means the frame couldn't authenticate — use native details instead.
            if let path = webView.url?.path, path.hasPrefix("/login") || path.hasPrefix("/auth/login") {
                parent.isLoading = false
                parent.onAuthBounce()
                return
            }

            parent.isLoading = false
            parent.errorMessage = nil
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            if (error as NSError).code == NSURLErrorCancelled { return }
            parent.isLoading = false
            parent.errorMessage = error.localizedDescription
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            if (error as NSError).code == NSURLErrorCancelled { return }
            parent.isLoading = false
            parent.errorMessage = error.localizedDescription
        }
    }
}

struct CampaignRow: View {
    let campaign: Campaign

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: campaign.statusKind.systemImage)
                .foregroundStyle(campaignStatusTint(campaign.statusKind))
                .font(.title3)
            VStack(alignment: .leading, spacing: 4) {
                Text(campaign.name)
                    .font(PGTypography.headline)
                    .lineLimit(1)
                HStack(spacing: 8) {
                    Text(campaign.triggerLabel)
                    if let enrolled = campaign.enrolledCount {
                        Text("· \(enrolled) enrolled")
                    }
                }
                .font(PGTypography.caption)
                .foregroundStyle(PGColors.secondaryText)
            }
            Spacer()
            Text(campaign.statusKind.title)
                .font(PGTypography.caption)
                .foregroundStyle(campaignStatusTint(campaign.statusKind))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(campaignStatusTint(campaign.statusKind).opacity(0.12))
                .clipShape(Capsule())
        }
        .padding(.vertical, 4)
    }
}

func campaignStatusTint(_ status: CampaignStatusKind) -> Color {
    switch status {
    case .draft: PGColors.secondaryText
    case .active: PGColors.success
    case .paused: .orange
    case .completed: .blue
    case .archived: PGColors.secondaryText
    case .unknown: PGColors.secondaryText
    }
}

/// Opens a web CRM page in Safari, signing the native session into web cookies first.
struct CampaignWebEditorSheet: View {
    let title: String
    /// Absolute URL or site path (e.g. `/excel-processor`). Prefer path so handoff can attach session.
    let url: URL
    @Environment(\.dismiss) private var dismiss
    @State private var resolvedURL: URL?
    @State private var loadError: String?

    var body: some View {
        NavigationStack {
            Group {
                if let resolvedURL {
                    SafariView(url: resolvedURL)
                        .ignoresSafeArea()
                } else if let loadError {
                    ContentUnavailableView(
                        "Couldn’t open page",
                        systemImage: "safari",
                        description: Text(loadError)
                    )
                } else {
                    ProgressView("Signing you into the web app…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task {
                await resolveHandoff()
            }
        }
    }

    private func resolveHandoff() async {
        loadError = nil
        let path: String = {
            if let comps = URLComponents(url: url, resolvingAgainstBaseURL: false) {
                let pathPart = comps.path.isEmpty ? "/" : comps.path
                if let query = comps.query, !query.isEmpty {
                    return "\(pathPart)?\(query)"
                }
                return pathPart
            }
            return url.path
        }()

        let handoff = await AuthenticatedWebSession.url(opening: path)
        resolvedURL = handoff
    }
}

struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: url)
        controller.preferredControlTintColor = UIColor(PGColors.gold)
        return controller
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}

#Preview {
    NavigationStack {
        CampaignListView()
            .environment(AppState())
    }
}
