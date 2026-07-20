import SwiftUI

@MainActor
@Observable
final class AuthViewModel {
    var email = ""
    var password = ""
    var isLoading = false
    var errorMessage: String?
    var savedAccounts: [SavedAccount] = SavedAccountsStore.load()

    func selectAccount(_ account: SavedAccount) {
        email = account.email
        password = ""
    }

    func removeAccount(_ account: SavedAccount) {
        SavedAccountsStore.remove(id: account.id)
        savedAccounts = SavedAccountsStore.load()
    }

    func signIn(appState: AppState) async {
        guard !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "Enter your email address."
            return
        }
        guard !password.isEmpty else {
            errorMessage = "Enter your password."
            return
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await appState.signIn(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                password: password
            )
            savedAccounts = SavedAccountsStore.load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct LoginView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = AuthViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    VStack(spacing: 8) {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(PGColors.gold)
                            .symbolEffect(.pulse, options: .repeating)

                        Text("Public Gold CRM")
                            .font(PGTypography.largeTitle)
                            .multilineTextAlignment(.center)

                        Text("Manage customers, WhatsApp, and campaigns on the go.")
                            .font(PGTypography.body)
                            .foregroundStyle(PGColors.secondaryText)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 24)

                    if !viewModel.savedAccounts.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Saved accounts")
                                .font(PGTypography.caption)
                                .foregroundStyle(PGColors.secondaryText)

                            ForEach(viewModel.savedAccounts) { account in
                                SavedAccountRow(
                                    account: account,
                                    onSelect: { viewModel.selectAccount(account) },
                                    onRemove: { viewModel.removeAccount(account) }
                                )
                            }
                        }
                    }

                    VStack(spacing: 16) {
                        PGTextField(
                            title: "Email",
                            text: $viewModel.email,
                            keyboard: .emailAddress,
                            textContentType: .username
                        )
                        PGTextField(
                            title: "Password",
                            text: $viewModel.password,
                            isSecure: true,
                            textContentType: .password
                        )
                    }

                    if let error = viewModel.errorMessage ?? appState.errorMessage {
                        ErrorBanner(message: error) {
                            viewModel.errorMessage = nil
                            appState.errorMessage = nil
                        }
                    }

                    PGPrimaryButton(title: "Sign In", isLoading: viewModel.isLoading) {
                        Task { await viewModel.signIn(appState: appState) }
                    }

                    Link("Forgot password?", destination: URL(string: "https://www.publicgolds.com/forgot-password")!)
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.goldDark)
                }
                .padding(24)
            }
            .background(PGColors.background)
            .navigationBarHidden(true)
        }
    }
}

private struct SavedAccountRow: View {
    let account: SavedAccount
    let onSelect: () -> Void
    let onRemove: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 12) {
                Circle()
                    .fill(PGColors.gold.opacity(0.2))
                    .frame(width: 40, height: 40)
                    .overlay {
                        Text(String(account.displayName.prefix(1)).uppercased())
                            .font(PGTypography.headline)
                            .foregroundStyle(PGColors.goldDark)
                    }

                VStack(alignment: .leading, spacing: 2) {
                    Text(account.displayName)
                        .font(PGTypography.headline)
                        .foregroundStyle(PGColors.primaryText)
                    HStack(spacing: 6) {
                        if let pgcode = account.pgcode, !pgcode.isEmpty {
                            Text(pgcode)
                                .foregroundStyle(PGColors.goldDark)
                        }
                        Text(account.email)
                            .foregroundStyle(PGColors.secondaryText)
                    }
                    .font(PGTypography.caption)
                    .lineLimit(1)
                }

                Spacer(minLength: 0)

                Button(role: .destructive, action: onRemove) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(PGColors.secondaryText)
                }
                .buttonStyle(.plain)
            }
            .padding(12)
            .background(PGColors.card)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    LoginView()
        .environment(AppState())
}
