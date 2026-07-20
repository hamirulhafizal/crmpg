import SwiftUI

@MainActor
@Observable
final class DashboardViewModel {
    var subscription: SubscriptionSummary?
    var customerCount: Int = 0
    var isLoading = false
    var errorMessage: String?
    var billingSource: BillingSource = .none

    enum BillingSource {
        case none
        case api
        case supabase
    }

    func load(userId: UUID?) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        async let customersTask: Void = loadCustomerCount()
        async let billingTask: Void = loadBilling(userId: userId)
        _ = await (customersTask, billingTask)
    }

    private func loadCustomerCount() async {
        do {
            customerCount = try await SupabaseRepository.fetchCustomerCount()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadBilling(userId: UUID?) async {
        // Prefer REST when Bearer auth is live on the server; fall back to Supabase RLS.
        do {
            let me: SaasMeResponse = try await APIClient.shared.get(.saasMe)
            subscription = me.toSummary
            billingSource = .api
            return
        } catch {
            // Expected until production deploy includes requireUserApi.
        }

        guard let userId else {
            billingSource = .none
            return
        }

        do {
            subscription = try await SupabaseRepository.fetchSubscriptionSummary(userId: userId)
            billingSource = subscription == nil ? .none : .supabase
        } catch {
            billingSource = .none
            if errorMessage == nil {
                errorMessage = error.localizedDescription
            }
        }
    }
}

struct DashboardView: View {
    @Environment(AppState.self) private var appState
    @Binding var selectedTab: Int
    @State private var viewModel = DashboardViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header

                if let banner = viewModel.subscription?.expiryBanner {
                    TrialBanner(message: banner) {
                        selectedTab = 3
                    }
                }

                if let error = viewModel.errorMessage {
                    ErrorBanner(message: error) {
                        viewModel.errorMessage = nil
                    }
                }

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    Button {
                        selectedTab = 1
                    } label: {
                        ServiceTile(
                            title: "Customers",
                            value: "\(viewModel.customerCount)",
                            icon: "person.2.fill",
                            tint: PGColors.gold
                        )
                    }
                    .buttonStyle(.plain)

                    Button {
                        selectedTab = 3
                    } label: {
                        ServiceTile(
                            title: "Plan",
                            value: viewModel.subscription?.planName ?? "—",
                            icon: "creditcard.fill",
                            tint: .blue
                        )
                    }
                    .buttonStyle(.plain)

                    Button {
                        selectedTab = 2
                    } label: {
                        ServiceTile(
                            title: "WhatsApp",
                            value: "Sessions",
                            icon: "message.fill",
                            tint: .green
                        )
                    }
                    .buttonStyle(.plain)

                    NavigationLink {
                        CampaignListView()
                    } label: {
                        ServiceTile(
                            title: "Campaigns",
                            value: campaignValue,
                            icon: "megaphone.fill",
                            tint: .purple
                        )
                    }
                    .buttonStyle(.plain)

                    NavigationLink {
                        ToolsHubView()
                    } label: {
                        ServiceTile(
                            title: "Tools",
                            value: "Sync & more",
                            icon: "wrench.and.screwdriver.fill",
                            tint: .orange
                        )
                    }
                    .buttonStyle(.plain)
                }

                if viewModel.billingSource == .supabase {
                    Text("Plan loaded via Supabase. Deploy Bearer API for full billing entitlements.")
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.secondaryText)
                }
            }
            .padding(20)
        }
        .background(PGColors.background)
        .navigationTitle("Dashboard")
        .refreshable {
            await viewModel.load(userId: appState.profile?.id ?? SupabaseManager.shared.currentUser?.id)
            await appState.refreshProfile()
        }
        .overlay {
            if viewModel.isLoading && viewModel.customerCount == 0 && viewModel.subscription == nil {
                LoadingView()
            }
        }
        .task {
            await viewModel.load(userId: appState.profile?.id ?? SupabaseManager.shared.currentUser?.id)
        }
    }

    private var campaignValue: String {
        guard let sub = viewModel.subscription else { return "—" }
        return sub.isActive ? "Active" : "Locked"
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Welcome back")
                .font(PGTypography.caption)
                .foregroundStyle(PGColors.secondaryText)
            Text(appState.profile?.displayName ?? "Dealer")
                .font(PGTypography.title)

            if let pgcode = appState.profile?.pgcode, !pgcode.isEmpty {
                Text(pgcode)
                    .font(PGTypography.caption)
                    .foregroundStyle(PGColors.goldDark)
            }

            if let status = viewModel.subscription?.status {
                Text(status.capitalized)
                    .font(PGTypography.caption)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(PGColors.gold.opacity(0.15))
                    .foregroundStyle(PGColors.goldDark)
                    .clipShape(Capsule())
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct TrialBanner: View {
    let message: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "clock.badge.exclamationmark.fill")
                    .foregroundStyle(PGColors.goldDark)
                Text(message)
                    .font(PGTypography.caption)
                    .foregroundStyle(PGColors.primaryText)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(PGColors.secondaryText)
            }
            .padding(12)
            .background(PGColors.gold.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct ServiceTile: View {
    let title: String
    let value: String
    let icon: String
    let tint: Color

    var body: some View {
        PGCard {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(tint)
                Text(value)
                    .font(PGTypography.headline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .foregroundStyle(PGColors.primaryText)
                Text(title)
                    .font(PGTypography.caption)
                    .foregroundStyle(PGColors.secondaryText)
            }
        }
    }
}

#Preview {
    NavigationStack {
        DashboardView(selectedTab: .constant(0))
            .environment(AppState())
    }
}
