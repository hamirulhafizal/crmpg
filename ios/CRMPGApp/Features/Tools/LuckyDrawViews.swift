import SwiftUI

@MainActor
@Observable
final class LuckyDrawViewModel {
    var pages: [LuckyDrawPage] = []
    var dealerSlug: String?
    var isLoading = false
    var errorMessage: String?
    var usedSupabaseFallback = false

    func load(userId: UUID?) async {
        isLoading = true
        errorMessage = nil
        usedSupabaseFallback = false
        defer { isLoading = false }

        do {
            let response: LuckyDrawListResponse = try await APIClient.shared.get(.luckyDrawPages)
            pages = response.pages
            dealerSlug = response.dealerSlug
            return
        } catch {
            // Fall back until Bearer lucky-draw API is deployed.
        }

        guard let userId else {
            errorMessage = "Sign in required."
            return
        }

        do {
            var fetched = try await SupabaseRepository.fetchLuckyDrawPages(userId: userId)
            dealerSlug = try await SupabaseRepository.fetchDealerSlug(userId: userId)
                ?? appStateUsernameFallback(userId: userId)
            // Enrich entry counts one by one (small lists).
            for index in fetched.indices {
                let count = try await SupabaseRepository.fetchLuckyDrawEntryCount(pageId: fetched[index].id)
                // Reconstruct with entry count via re-decode isn't possible; store separately by mutating a copy pattern.
                // LuckyDrawPage has var entryCount — need a way to set it. It's a var on the struct.
                fetched[index].entryCount = count
            }
            pages = fetched
            usedSupabaseFallback = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func appStateUsernameFallback(userId: UUID) -> String {
        let compact = userId.uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        return String(compact.suffix(4))
    }
}

struct LuckyDrawListView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = LuckyDrawViewModel()
    @State private var showWebEditor = false

    private var userId: UUID? {
        appState.profile?.id ?? SupabaseManager.shared.currentUser?.id
    }

    private var editorURL: URL {
        URL(string: "/dashboard/lucky-draw", relativeTo: AppConfig.apiBaseURL)!.absoluteURL
    }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.pages.isEmpty {
                LoadingView(message: "Loading lucky draws…")
            } else if viewModel.pages.isEmpty {
                EmptyStateView(
                    icon: "gift.fill",
                    title: "No lucky draw pages",
                    message: viewModel.errorMessage
                        ?? "Create a page on the web builder, then share it from here."
                )
            } else {
                List {
                    if viewModel.usedSupabaseFallback {
                        Section {
                            Text("Loaded via Supabase. Deploy Bearer `/api/lucky-draw` for full stats.")
                                .font(PGTypography.caption)
                                .foregroundStyle(PGColors.secondaryText)
                        }
                    }
                    Section {
                        ForEach(viewModel.pages) { page in
                            NavigationLink {
                                LuckyDrawDetailView(page: page, dealerSlug: viewModel.dealerSlug)
                            } label: {
                                LuckyDrawRow(page: page)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Lucky draw")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showWebEditor = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .refreshable { await viewModel.load(userId: userId) }
        .task { await viewModel.load(userId: userId) }
        .sheet(isPresented: $showWebEditor) {
            CampaignWebEditorSheet(title: "Lucky draw editor", url: editorURL)
        }
    }
}

struct LuckyDrawRow: View {
    let page: LuckyDrawPage

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "gift.fill")
                .foregroundStyle(PGColors.goldDark)
                .font(.title3)
            VStack(alignment: .leading, spacing: 4) {
                Text(page.title)
                    .font(PGTypography.headline)
                    .lineLimit(1)
                Text("/\(page.pageSlug)")
                    .font(PGTypography.caption)
                    .foregroundStyle(PGColors.secondaryText)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text(page.statusTitle)
                    .font(PGTypography.caption)
                    .foregroundStyle(statusColor)
                if let count = page.entryCount {
                    Text("\(count) entries")
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.secondaryText)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var statusColor: Color {
        switch page.status.lowercased() {
        case "active": PGColors.success
        case "closed": .orange
        default: PGColors.secondaryText
        }
    }
}

struct LuckyDrawDetailView: View {
    let page: LuckyDrawPage
    let dealerSlug: String?

    private var shareURL: URL? {
        guard let dealerSlug, !dealerSlug.isEmpty else { return nil }
        return page.publicURL(dealerSlug: dealerSlug, apiBase: AppConfig.apiBaseURL)
    }

    var body: some View {
        List {
            Section("Page") {
                LabeledContent("Title", value: page.title)
                LabeledContent("Slug", value: page.pageSlug)
                LabeledContent("Status", value: page.statusTitle)
                LabeledContent("Entries", value: "\(page.entryCount ?? 0)")
            }

            if let shareURL {
                Section("Public link") {
                    Text(shareURL.absoluteString)
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.secondaryText)
                        .textSelection(.enabled)
                    ShareLink(item: shareURL) {
                        Label("Share link", systemImage: "square.and.arrow.up")
                    }
                    Link(destination: shareURL) {
                        Label("Open page", systemImage: "safari")
                    }
                }
            } else {
                Section {
                    Text("Dealer slug unavailable. Open the web lucky draw settings once to create it.")
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.secondaryText)
                }
            }
        }
        .navigationTitle(page.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        LuckyDrawListView()
            .environment(AppState())
    }
}
