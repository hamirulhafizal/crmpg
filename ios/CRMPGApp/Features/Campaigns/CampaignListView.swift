import SwiftUI
import SafariServices

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
                LoadingView(message: "Loading campaigns…")
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
                            NavigationLink(value: campaign) {
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
        .navigationDestination(for: Campaign.self) { campaign in
            CampaignDetailView(campaignId: campaign.id, seed: campaign)
        }
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
