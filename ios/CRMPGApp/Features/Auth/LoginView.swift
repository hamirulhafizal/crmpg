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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var viewModel = AuthViewModel()
    @State private var isPasswordVisible = false
    @State private var hasAppeared = false
    @FocusState private var focusedField: LoginField?

    private enum LoginField {
        case email
        case password
    }

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
            ZStack {
                loginBackground

                ScrollView {
                    VStack(spacing: 24) {
                        premiumHeader
                            .padding(.top, 28)
                            .opacity(hasAppeared ? 1 : 0)
                            .offset(y: hasAppeared ? 0 : -18)

                        VStack(spacing: 20) {
                            if !viewModel.savedAccounts.isEmpty {
                                savedAccountButton
                            }

                            VStack(spacing: 14) {
                                premiumEmailField
                                premiumPasswordField
                            }

                            if let error = viewModel.errorMessage ?? appState.errorMessage {
                                ErrorBanner(message: error) {
                                    viewModel.errorMessage = nil
                                    appState.errorMessage = nil
                                }
                                .transition(.move(edge: .top).combined(with: .opacity))
                            }

                            signInButton

                            Link(
                                "Forgot password?",
                                destination: URL(string: "https://www.publicgolds.com/forgot-password")!
                            )
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(PGColors.brandPurple)
                        }
                        .padding(20)
                        .background {
                            RoundedRectangle(cornerRadius: 28, style: .continuous)
                                .fill(.ultraThinMaterial)
                                .overlay {
                                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                                        .stroke(.white.opacity(0.9), lineWidth: 1)
                                }
                                .shadow(color: PGColors.brandPurple.opacity(0.13), radius: 28, y: 14)
                        }
                        .opacity(hasAppeared ? 1 : 0)
                        .offset(y: hasAppeared ? 0 : 24)

                        Text("Secure access for Public Gold dealers")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(PGColors.secondaryText)
                            .opacity(hasAppeared ? 0.8 : 0)
                            .padding(.bottom, 24)
                    }
                    .padding(.horizontal, 20)
                    .frame(maxWidth: 520)
                    .frame(maxWidth: .infinity)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationBarHidden(true)
            .onAppear {
                withAnimation(reduceMotion ? nil : .spring(response: 0.7, dampingFraction: 0.82)) {
                    hasAppeared = true
                }
            }
        }
    }

    private var loginBackground: some View {
        ZStack {
            Color(red: 0.965, green: 0.96, blue: 0.99)

            Circle()
                .fill(PGColors.brandPurple.opacity(0.16))
                .frame(width: 330, height: 330)
                .blur(radius: 8)
                .offset(x: 170, y: -330)

            Circle()
                .fill(PGColors.gold.opacity(0.12))
                .frame(width: 260, height: 260)
                .blur(radius: 12)
                .offset(x: -180, y: 360)
        }
        .ignoresSafeArea()
    }

    private var premiumHeader: some View {
        VStack(spacing: 14) {
            ZStack(alignment: .topTrailing) {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.39, green: 0.25, blue: 0.86),
                                PGColors.brandPurple
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 104, height: 104)
                    .overlay {
                        Text("CRMPG")
                            .font(.system(size: 21, weight: .heavy, design: .rounded))
                            .tracking(-0.8)
                            .foregroundStyle(.white)
                    }
                    .overlay {
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(.white.opacity(0.35), lineWidth: 1)
                    }
                    .shadow(color: PGColors.brandPurple.opacity(0.35), radius: 22, y: 12)

                Image(systemName: "crown.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(8)
                    .background(PGColors.gold.gradient, in: Circle())
                    .overlay { Circle().stroke(.white, lineWidth: 2) }
                    .offset(x: 8, y: -8)
                    .accessibilityHidden(true)
            }

            VStack(spacing: 6) {
                Text("Welcome back")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(Color(red: 0.10, green: 0.08, blue: 0.17))

                Text("Sign in to Public Gold CRM")
                    .font(.system(size: 16))
                    .foregroundStyle(PGColors.secondaryText)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var savedAccountButton: some View {
        Button {
            appState.prefersAccountPicker = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "person.2.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(PGColors.brandPurple)
                    .frame(width: 34, height: 34)
                    .background(PGColors.brandPurple.opacity(0.1), in: Circle())

                Text("Choose saved account")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(PGColors.primaryText)

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(PGColors.secondaryText)
            }
            .padding(12)
            .background(Color.white.opacity(0.72))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(PGColors.brandPurple.opacity(0.12), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }

    private var premiumEmailField: some View {
        PremiumFieldContainer(
            title: "Email address",
            icon: "envelope.fill",
            isFocused: focusedField == .email
        ) {
            TextField("name@example.com", text: $viewModel.email)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focusedField, equals: .email)
                .submitLabel(.next)
                .onSubmit { focusedField = .password }
        }
    }

    private var premiumPasswordField: some View {
        PremiumFieldContainer(
            title: "Password",
            icon: "lock.fill",
            isFocused: focusedField == .password
        ) {
            HStack(spacing: 8) {
                Group {
                    if isPasswordVisible {
                        TextField("Enter your password", text: $viewModel.password)
                    } else {
                        SecureField("Enter your password", text: $viewModel.password)
                    }
                }
                .textContentType(.password)
                .focused($focusedField, equals: .password)
                .submitLabel(.go)
                .onSubmit { submitSignIn() }

                Button {
                    isPasswordVisible.toggle()
                    focusedField = .password
                } label: {
                    Image(systemName: isPasswordVisible ? "eye.slash.fill" : "eye.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(
                            focusedField == .password
                                ? PGColors.brandPurple
                                : PGColors.secondaryText
                        )
                        .contentTransition(.symbolEffect(.replace))
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isPasswordVisible ? "Hide password" : "Show password")
            }
        }
    }

    private var signInButton: some View {
        Button(action: submitSignIn) {
            HStack(spacing: 10) {
                if viewModel.isLoading {
                    ProgressView()
                        .tint(.white)
                        .transition(.scale.combined(with: .opacity))
                }

                Text(viewModel.isLoading ? "Signing in…" : "Sign In")
                    .font(.system(size: 17, weight: .bold))

                if !viewModel.isLoading {
                    Image(systemName: "arrow.right")
                        .font(.system(size: 14, weight: .bold))
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .foregroundStyle(.white)
            .background {
                LinearGradient(
                    colors: [
                        Color(red: 0.38, green: 0.23, blue: 0.84),
                        PGColors.brandPurple
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            }
            .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
            .shadow(color: PGColors.brandPurple.opacity(0.3), radius: 14, y: 7)
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isLoading)
        .opacity(viewModel.isLoading ? 0.82 : 1)
        .animation(.easeInOut(duration: 0.2), value: viewModel.isLoading)
    }

    private func submitSignIn() {
        focusedField = nil
        Task { await viewModel.signIn(appState: appState) }
    }
}

private struct PremiumFieldContainer<Content: View>: View {
    let title: String
    let icon: String
    let isFocused: Bool
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(isFocused ? PGColors.brandPurple : PGColors.secondaryText)

            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(isFocused ? PGColors.brandPurple : PGColors.secondaryText)
                    .frame(width: 20)

                content
                    .font(.system(size: 16))
                    .foregroundStyle(PGColors.primaryText)
            }
            .padding(.horizontal, 14)
            .frame(height: 54)
            .background(Color.white.opacity(0.86))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(
                        isFocused ? PGColors.brandPurple : PGColors.brandPurple.opacity(0.1),
                        lineWidth: isFocused ? 1.5 : 1
                    )
            }
            .shadow(
                color: isFocused ? PGColors.brandPurple.opacity(0.12) : .clear,
                radius: 10,
                y: 4
            )
            .animation(.easeOut(duration: 0.2), value: isFocused)
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
