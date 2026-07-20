import SwiftUI

@MainActor
@Observable
final class BillingViewModel {
    var subscription: SubscriptionSummary?
    var saasMe: SaasMeResponse?
    var isLoading = false
    var isActing = false
    var errorMessage: String?
    var infoMessage: String?
    var checkoutURL: URL?

    func load(userId: UUID?) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let me: SaasMeResponse = try await APIClient.shared.get(.saasMe)
            saasMe = me
            subscription = me.toSummary
            return
        } catch {
            // Fall back to Supabase until production Bearer deploy.
        }

        guard let userId else { return }
        do {
            subscription = try await SupabaseRepository.fetchSubscriptionSummary(userId: userId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func startTrial() async {
        isActing = true
        errorMessage = nil
        infoMessage = nil
        defer { isActing = false }

        do {
            try await APIClient.shared.postEmptyOk(.startTrial, body: EmptyBody())
            infoMessage = "Pro trial started."
            await load(userId: SupabaseManager.shared.currentUser?.id)
        } catch let error as APIError {
            errorMessage = error.localizedDescription
            if case .unauthorized = error {
                infoMessage = "Start trial needs the API with Bearer auth deployed. You can also start from the web dashboard."
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func startCheckout() async {
        isActing = true
        errorMessage = nil
        infoMessage = nil
        defer { isActing = false }

        do {
            let response: CheckoutResponse = try await APIClient.shared.post(.saasCheckout, body: EmptyBody())
            if let urlString = response.checkoutUrl, let url = URL(string: urlString) {
                checkoutURL = url
            } else {
                errorMessage = "Checkout URL missing from server."
            }
        } catch let error as APIError {
            errorMessage = error.localizedDescription
            // Fallback: open web billing page
            checkoutURL = URL(string: "https://www.publicgolds.com/dashboard/billing")
            infoMessage = "Opening web billing — native checkout needs the API deployed."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    var writeAccessLabel: String {
        if let me = saasMe {
            return me.hasWriteAccess ? "Write access on" : "Read-only"
        }
        return subscription?.isActive == true ? "Active" : "Check on web"
    }
}

private struct EmptyBody: Encodable {}

struct BillingView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.openURL) private var openURL
    @State private var viewModel = BillingViewModel()
    @State private var confirmTrial = false

    var body: some View {
        List {
            Section("Current plan") {
                LabeledContent("Plan", value: viewModel.subscription?.planName ?? "—")
                LabeledContent("Status", value: (viewModel.subscription?.status ?? "—").capitalized)
                LabeledContent("Access", value: viewModel.writeAccessLabel)
                if let trial = viewModel.subscription?.trialEndsAt {
                    LabeledContent("Trial ends", value: formatDate(trial))
                }
                if let periodEnd = viewModel.subscription?.currentPeriodEnd {
                    LabeledContent("Period ends", value: formatDate(periodEnd))
                }
            }

            if let banner = viewModel.subscription?.expiryBanner {
                Section {
                    Text(banner)
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.goldDark)
                }
            }

            Section("Actions") {
                Button {
                    confirmTrial = true
                } label: {
                    Label("Start Pro trial", systemImage: "gift")
                }
                .disabled(viewModel.isActing)

                Button {
                    Task {
                        await viewModel.startCheckout()
                        if let url = viewModel.checkoutURL {
                            openURL(url)
                        }
                    }
                } label: {
                    Label("Upgrade / renew (Bayarcash)", systemImage: "creditcard")
                }
                .disabled(viewModel.isActing)

                Link(destination: URL(string: "https://www.publicgolds.com/dashboard/billing")!) {
                    Label("Open billing on web", systemImage: "safari")
                }
            }

            if let info = viewModel.infoMessage {
                Section {
                    Text(info)
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.secondaryText)
                }
            }

            if let error = viewModel.errorMessage {
                Section {
                    ErrorBanner(message: error) { viewModel.errorMessage = nil }
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
            }
        }
        .navigationTitle("Billing")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await viewModel.load(userId: appState.profile?.id ?? SupabaseManager.shared.currentUser?.id)
        }
        .task {
            await viewModel.load(userId: appState.profile?.id ?? SupabaseManager.shared.currentUser?.id)
        }
        .overlay {
            if viewModel.isLoading && viewModel.subscription == nil {
                LoadingView()
            }
        }
        .alert("Start Pro trial?", isPresented: $confirmTrial) {
            Button("Start trial") {
                Task { await viewModel.startTrial() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This uses your one-time Pro trial if available.")
        }
    }

    private func formatDate(_ raw: String) -> String {
        guard let date = JSONDate.parse(raw) else { return raw }
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}

#Preview {
    NavigationStack {
        BillingView()
            .environment(AppState())
    }
}
