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
        password = account.password ?? ""
    }

    func removeAccount(_ account: SavedAccount) {
        SavedAccountsStore.remove(id: account.id)
        savedAccounts = SavedAccountsStore.load()
    }

    func reloadAccounts() {
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
            appState.prefersAccountPicker = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct LoginView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = AuthViewModel()

    private var showPicker: Bool {
        appState.prefersAccountPicker && !viewModel.savedAccounts.isEmpty
    }

    var body: some View {
        Group {
            if showPicker {
                AccountPickerView(mode: .login)
            } else {
                loginForm
            }
        }
        .animation(.easeInOut(duration: 0.2), value: showPicker)
        .onAppear {
            viewModel.reloadAccounts()
        }
    }

    private var loginForm: some View {
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
                        Button {
                            appState.prefersAccountPicker = true
                        } label: {
                            Label("Choose saved account", systemImage: "person.2.fill")
                                .font(PGTypography.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(PGColors.card)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .buttonStyle(.plain)
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

#Preview {
    LoginView()
        .environment(AppState())
}

/// Modes for the Choose Account screen (login vs in-app switch).
enum AccountPickerMode: Equatable {
    case login
    case switchAccount
}

struct AccountPickerView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    var mode: AccountPickerMode = .login
    var onAddAccount: (() -> Void)?
    var onNeedCredentials: ((SavedAccount) -> Void)?

    @State private var accounts: [SavedAccount] = SavedAccountsStore.load()
    @State private var switchingUserId: UUID?
    @State private var errorMessage: String?
    @State private var passwordPromptAccount: SavedAccount?
    @State private var passwordDraft = ""
    @State private var isPasswordPromptLoading = false

    private var currentUserId: UUID? {
        SupabaseManager.shared.currentUser?.id
    }

    private var canAdd: Bool {
        SavedAccountsStore.canAddMore(excludingCurrent: currentUserId)
    }

    var body: some View {
        Group {
            if mode == .switchAccount {
                switchAccountLayout
            } else {
                loginLayout
            }
        }
        .sheet(item: $passwordPromptAccount) { account in
            NavigationStack {
                VStack(spacing: 20) {
                    Text("Enter password for \(account.pickerLabel)")
                        .font(PGTypography.headline)
                        .multilineTextAlignment(.center)

                    Text(account.email)
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.secondaryText)

                    SecureField("Password", text: $passwordDraft)
                        .textContentType(.password)
                        .padding(14)
                        .background(PGColors.card)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                    if let errorMessage {
                        Text(errorMessage)
                            .font(PGTypography.caption)
                            .foregroundStyle(PGColors.destructive)
                            .multilineTextAlignment(.center)
                    }

                    PGPrimaryButton(
                        title: "Switch account",
                        isLoading: isPasswordPromptLoading
                    ) {
                        Task { await switchTo(account, password: passwordDraft) }
                    }
                    .disabled(passwordDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    Text("Password is saved on this device only for next time.")
                        .font(.system(size: 12))
                        .foregroundStyle(PGColors.secondaryText)
                        .multilineTextAlignment(.center)

                    Spacer()
                }
                .padding(24)
                .navigationTitle("Confirm account")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            passwordPromptAccount = nil
                            passwordDraft = ""
                            errorMessage = nil
                        }
                    }
                }
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .onAppear {
            // Snapshot active session tokens so this dealer can be switched back to later.
            if mode == .switchAccount {
                SavedAccountsStore.captureCurrentSession(profile: appState.profile)
            }
            accounts = SavedAccountsStore.load()
            errorMessage = nil
        }
    }

    /// Full-screen login Choose Account (matches web).
    private var loginLayout: some View {
        ScrollView {
            VStack(spacing: 28) {
                header(showTitle: true)
                accountCard
                loginFooter
            }
            .padding(.horizontal, 20)
            .padding(.top, 32)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.96, green: 0.97, blue: 0.98))
    }

    /// Sheet layout — title lives in the nav bar; no overlapping Close.
    private var switchAccountLayout: some View {
        ScrollView {
            VStack(spacing: 20) {
                Text("Switch to another saved dealer on this device.")
                    .font(.system(size: 15))
                    .foregroundStyle(Color(red: 0.45, green: 0.50, blue: 0.58))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)

                accountCard
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .background(Color(red: 0.96, green: 0.97, blue: 0.98))
        .navigationTitle("Choose Account")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func header(showTitle: Bool) -> some View {
        VStack(spacing: 8) {
            if showTitle {
                Text("Choose Account")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(Color(red: 0.08, green: 0.12, blue: 0.22))
            }

            Text("Pick a saved account or add another account on this device.")
                .font(.system(size: 15))
                .foregroundStyle(Color(red: 0.45, green: 0.50, blue: 0.58))
                .multilineTextAlignment(.center)
        }
    }

    private var accountCard: some View {
        VStack(spacing: 20) {
            if let errorMessage {
                ErrorBanner(message: errorMessage) {
                    self.errorMessage = nil
                }
            }

            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: 12),
                    GridItem(.flexible(), spacing: 12),
                    GridItem(.flexible(), spacing: 12),
                ],
                spacing: 16
            ) {
                ForEach(accounts) { account in
                    AccountPickerCell(
                        account: account,
                        isCurrent: account.id == currentUserId,
                        isSwitching: switchingUserId == account.id,
                        isDisabled: switchingUserId != nil
                    ) {
                        Task { await handleSelect(account) }
                    }
                    .contextMenu {
                        Button("Remove from this device", role: .destructive) {
                            SavedAccountsStore.remove(id: account.id)
                            accounts = SavedAccountsStore.load()
                        }
                    }
                }

                if canAdd {
                    AddAccountCell(isDisabled: switchingUserId != nil) {
                        handleAdd()
                    }
                }
            }

            Text(
                canAdd
                    ? "SAVED ON THIS DEVICE ONLY — UP TO \(SavedAccountsStore.maxAccounts) DEALERS."
                    : "MAXIMUM OF \(SavedAccountsStore.maxAccounts) SAVED DEALERS ON THIS DEVICE."
            )
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(Color(red: 0.55, green: 0.58, blue: 0.64))
            .multilineTextAlignment(.center)
            .padding(.top, 4)
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color.white)
                .shadow(color: .black.opacity(0.06), radius: 16, y: 6)
        )
    }

    private var loginFooter: some View {
        VStack(spacing: 16) {
            Text("By signing in, you agree to our Terms of Service and Privacy Policy")
                .font(.system(size: 12))
                .foregroundStyle(Color(red: 0.55, green: 0.58, blue: 0.64))
                .multilineTextAlignment(.center)

            if !accounts.isEmpty {
                Button("Sign in with email instead") {
                    appState.prefersAccountPicker = false
                    onAddAccount?()
                }
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(PGColors.goldDark)
            }
        }
    }

    private func handleAdd() {
        if mode == .switchAccount {
            Task {
                await appState.prepareAddAccount()
                dismiss()
            }
        } else {
            appState.prefersAccountPicker = false
            onAddAccount?()
        }
    }

    private func handleSelect(_ account: SavedAccount) async {
        if mode == .switchAccount, account.id == currentUserId {
            dismiss()
            return
        }

        // Prefer freshly loaded credentials from Keychain.
        let latest = SavedAccountsStore.account(id: account.id) ?? account

        if latest.hasSwitchCredentials {
            await switchTo(latest, password: latest.password)
            return
        }

        if let onNeedCredentials {
            onNeedCredentials(latest)
            return
        }

        passwordPromptAccount = latest
        passwordDraft = ""
    }

    private func switchTo(_ account: SavedAccount, password: String?) async {
        switchingUserId = account.id
        errorMessage = nil
        isPasswordPromptLoading = true
        defer {
            switchingUserId = nil
            isPasswordPromptLoading = false
        }

        do {
            try await appState.switchToAccount(account, password: password)
            passwordPromptAccount = nil
            passwordDraft = ""
            accounts = SavedAccountsStore.load()
            if mode == .switchAccount {
                dismiss()
            }
        } catch {
            let message = error.localizedDescription
            errorMessage = message
            // Always offer password entry so the dealer can be saved for next switch.
            passwordPromptAccount = account
            passwordDraft = ""
            accounts = SavedAccountsStore.load()
        }
    }
}

private struct AccountPickerCell: View {
    let account: SavedAccount
    let isCurrent: Bool
    let isSwitching: Bool
    let isDisabled: Bool
    let action: () -> Void

    private let avatarSize: CGFloat = 72

    var body: some View {
        Button(action: action) {
            VStack(spacing: 10) {
                ZStack {
                    AccountAvatarView(account: account, size: avatarSize)
                        .opacity(isSwitching ? 0.55 : 1)

                    if isSwitching {
                        ProgressView()
                            .tint(Color(red: 0.48, green: 0.28, blue: 0.85))
                    }

                    if isCurrent, !isSwitching {
                        RoundedRectangle(cornerRadius: avatarSize * 0.22, style: .continuous)
                            .stroke(PGColors.gold, lineWidth: 3)
                            .frame(width: avatarSize + 6, height: avatarSize + 6)
                    }
                }
                .frame(height: avatarSize + 6)

                Text(account.pickerLabel)
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Color(red: 0.28, green: 0.33, blue: 0.40))
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .opacity(isDisabled && !isSwitching ? 0.55 : 1)
        .accessibilityLabel(account.pickerLabel)
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
    }
}

private struct AddAccountCell: View {
    let isDisabled: Bool
    let action: () -> Void

    private let size: CGFloat = 72

    var body: some View {
        Button(action: action) {
            VStack(spacing: 10) {
                RoundedRectangle(cornerRadius: size * 0.2, style: .continuous)
                    .strokeBorder(
                        style: StrokeStyle(lineWidth: 2, dash: [6, 4])
                    )
                    .foregroundStyle(Color(red: 0.78, green: 0.80, blue: 0.84))
                    .background(
                        RoundedRectangle(cornerRadius: size * 0.2, style: .continuous)
                            .fill(Color(red: 0.97, green: 0.97, blue: 0.98))
                    )
                    .frame(width: size, height: size)
                    .overlay {
                        Image(systemName: "plus")
                            .font(.system(size: 26, weight: .medium))
                            .foregroundStyle(Color(red: 0.65, green: 0.68, blue: 0.74))
                    }
                    .frame(height: size + 6)

                Text("ADD ACCOUNT")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Color(red: 0.40, green: 0.44, blue: 0.50))
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.55 : 1)
        .accessibilityLabel("Add account")
    }
}

struct AccountAvatarView: View {
    let account: SavedAccount
    var size: CGFloat = 80

    private var cornerRadius: CGFloat { size * 0.2 }

    var body: some View {
        Group {
            if let urlString = account.avatarURL, let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        initialsAvatar
                    }
                }
            } else {
                initialsAvatar
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .stroke(Color.white, lineWidth: 2)
        }
        .shadow(color: .black.opacity(0.08), radius: 4, y: 2)
    }

    private var initialsAvatar: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color(red: 0.48, green: 0.28, blue: 0.85))
            .overlay {
                Text(account.initials)
                    .font(.system(size: size * 0.28, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
            }
    }
}

#Preview("Login picker") {
    AccountPickerView(mode: .login)
        .environment(AppState())
}

#Preview("Switch picker") {
    AccountPickerView(mode: .switchAccount)
        .environment(AppState())
}
