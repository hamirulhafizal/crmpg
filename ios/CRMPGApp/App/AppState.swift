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

    private let supabase = SupabaseManager.shared

    /// Must return quickly — never await network on the splash path.
    func bootstrap() {
        supabase.restoreSession()

        if supabase.currentUser != nil {
            authStatus = .signedIn
            // Profile + token refresh after UI is visible.
            Task {
                await loadProfileQuietly()
                if let user = supabase.currentUser, let email = user.email {
                    SavedAccountsStore.upsert(from: profile, email: email, userId: user.id)
                }
                supabase.refreshSessionInBackground()
            }
        } else {
            authStatus = .signedOut
        }
    }

    func signIn(email: String, password: String) async throws {
        errorMessage = nil
        try await supabase.signIn(email: email, password: password)
        await loadProfileQuietly()
        if let user = supabase.currentUser, let email = user.email {
            SavedAccountsStore.upsert(from: profile, email: email, userId: user.id)
        }
        authStatus = .signedIn
    }

    func signOut() async {
        await PushNotificationService.shared.unregisterFromBackend()
        do {
            try await supabase.signOut()
        } catch {
            errorMessage = error.localizedDescription
        }
        profile = nil
        authStatus = .signedOut
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
