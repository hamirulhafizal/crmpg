import Foundation
import Observation

@MainActor
@Observable
final class AppState {
    enum AuthStatus: Equatable {
        case loading
        case signedOut
        case signedIn
    }

    var authStatus: AuthStatus = .loading
    var profile: Profile?
    var errorMessage: String?
    /// Deep-link / notification: present PG Sync (e.g. awaiting TAC).
    var showPGSync = false
    /// When signed out, show Choose Account grid if saved dealers exist.
    var prefersAccountPicker = true
    /// True while switching dealers / until home content finishes reloading.
    var isSwitchingAccount = false
    /// Bumped after a successful account switch so tabs reload for the new user.
    var accountSessionID = UUID()
    /// Deep link from Home Screen widget → Customers tab + status filter.
    var pendingCustomersTab = false
    var pendingCustomerStatusFilter: AccountStatusKey?
    var pendingCustomerDealerId: UUID?

    private let supabase = SupabaseManager.shared

    /// Must return quickly — never await network on the splash path.
    func bootstrap() {
        supabase.restoreSession()

        if supabase.currentUser != nil {
            authStatus = .signedIn
            // Profile + token refresh after UI is visible.
            Task {
                await loadProfileQuietly()
                SavedAccountsStore.captureCurrentSession(profile: profile)
                supabase.refreshSessionInBackground()
                await WidgetSnapshotSync.refreshCurrentDealerStats(profile: profile)
            }
        } else {
            authStatus = .signedOut
            WidgetSnapshotSync.syncDealersFromSavedAccounts()
        }
    }

    func handleDeepLink(_ url: URL) {
        guard let parsed = WidgetShared.parseDeepLink(url) else { return }
        pendingCustomersTab = true
        pendingCustomerDealerId = parsed.dealerId.flatMap(UUID.init(uuidString:))
        if let raw = parsed.status?.lowercased(), raw != "total" {
            pendingCustomerStatusFilter = AccountStatusKey(rawValue: raw)
        } else {
            pendingCustomerStatusFilter = nil
        }

        // If the widget dealer differs, switch when credentials are available.
        if let dealerId = pendingCustomerDealerId,
           supabase.currentUser?.id != dealerId,
           let account = SavedAccountsStore.account(id: dealerId),
           account.hasSwitchCredentials {
            Task {
                try? await switchToAccount(account)
            }
        }
    }

    func consumePendingCustomerDeepLink() -> (status: AccountStatusKey?, dealerId: UUID?) {
        let status = pendingCustomerStatusFilter
        let dealer = pendingCustomerDealerId
        pendingCustomerStatusFilter = nil
        pendingCustomerDealerId = nil
        pendingCustomersTab = false
        return (status, dealer)
    }

    func signIn(email: String, password: String) async throws {
        errorMessage = nil
        try await supabase.signIn(email: email, password: password)
        await loadProfileQuietly()
        if let user = supabase.currentUser, let email = user.email {
            SavedAccountsStore.upsert(
                from: profile,
                email: email,
                userId: user.id,
                password: password,
                session: supabase.session
            )
        }
        authStatus = .signedIn
    }

    /// Signs out the current session, then restores another saved dealer (password or refresh token).
    func switchToAccount(_ account: SavedAccount, password: String? = nil) async throws {
        errorMessage = nil

        // Keep the leaving account switchable later (tokens + any password already stored).
        SavedAccountsStore.captureCurrentSession(profile: profile)

        let latest = SavedAccountsStore.account(id: account.id) ?? account
        let passwordToUse = (password ?? latest.password)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let refresh = latest.refreshToken?.trimmingCharacters(in: .whitespacesAndNewlines)
        let access = latest.accessToken?.trimmingCharacters(in: .whitespacesAndNewlines)

        let hasPassword = !(passwordToUse?.isEmpty ?? true)
        let hasRefresh = !(refresh?.isEmpty ?? true)

        guard hasPassword || hasRefresh else {
            throw SwitchAccountError.credentialsMissing
        }

        if supabase.currentUser?.id == latest.id {
            SavedAccountsStore.upsert(
                from: profile,
                email: latest.email,
                userId: latest.id,
                password: passwordToUse,
                session: supabase.session
            )
            return
        }

        isSwitchingAccount = true
        profile = nil

        await PushNotificationService.shared.unregisterFromBackend()

        do {
            try await supabase.signOut()
        } catch {
            // Continue — local session may already be cleared.
        }
        KeychainStore.clearSession()

        do {
            if hasPassword, let passwordToUse {
                try await supabase.signIn(email: latest.email, password: passwordToUse)
            } else if let refresh, hasRefresh {
                try await supabase.signInWithStoredSession(accessToken: access, refreshToken: refresh)
            } else {
                throw SwitchAccountError.credentialsMissing
            }

            await loadProfileQuietly()
            if let user = supabase.currentUser, let email = user.email {
                SavedAccountsStore.upsert(
                    from: profile,
                    email: email,
                    userId: user.id,
                    password: passwordToUse,
                    session: supabase.session
                )
            }
            authStatus = .signedIn
            showPGSync = false
            accountSessionID = UUID()
            // Keep isSwitchingAccount true until Dashboard finishes reloading tiles.
        } catch {
            isSwitchingAccount = false
            authStatus = .signedOut
            prefersAccountPicker = !SavedAccountsStore.load().isEmpty
            throw error
        }
    }

    func markAccountContentReady() {
        isSwitchingAccount = false
    }

    func prepareAddAccount() async {
        errorMessage = nil
        SavedAccountsStore.captureCurrentSession(profile: profile)
        await PushNotificationService.shared.unregisterFromBackend()
        do {
            try await supabase.signOut()
        } catch {
            // Keep going to login.
        }
        profile = nil
        KeychainStore.clearSession()
        authStatus = .signedOut
        showPGSync = false
        prefersAccountPicker = false
    }

    func signOut() async {
        SavedAccountsStore.captureCurrentSession(profile: profile)
        await PushNotificationService.shared.unregisterFromBackend()
        do {
            try await supabase.signOut()
        } catch {
            errorMessage = error.localizedDescription
        }
        profile = nil
        authStatus = .signedOut
        prefersAccountPicker = true
    }

    func loadProfile() async throws {
        guard let userId = supabase.currentUser?.id else {
            profile = nil
            return
        }
        if let fetched = try await SupabaseRepository.fetchProfile(userId: userId) {
            profile = fetched
        } else {
            profile = Profile.placeholder(userId: userId, email: supabase.currentUser?.email)
        }
    }

    func refreshProfile() async {
        await loadProfileQuietly()
        SavedAccountsStore.captureCurrentSession(profile: profile)
    }

    private func loadProfileQuietly() async {
        guard let userId = supabase.currentUser?.id else {
            profile = nil
            return
        }

        let email = supabase.currentUser?.email
        let placeholder = Profile.placeholder(userId: userId, email: email)

        do {
            if let fetched = try await SupabaseRepository.fetchProfile(userId: userId) {
                profile = fetched
            } else {
                profile = placeholder
            }
        } catch {
            profile = placeholder
            // Don't surface profile errors on splash/login — they spam the UI.
        }
    }
}

enum SwitchAccountError: LocalizedError {
    case credentialsMissing

    var errorDescription: String? {
        switch self {
        case .credentialsMissing:
            "Enter the password for this account once — it will be saved on this device for next time."
        }
    }
}
