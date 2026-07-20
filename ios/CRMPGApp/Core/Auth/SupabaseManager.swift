import Foundation
import Supabase

final class SupabaseManager: @unchecked Sendable {
    static let shared = SupabaseManager()

    let client: SupabaseClient

    private let lock = NSLock()
    private var _session: Session?
    private var _currentUser: User?

    var session: Session? {
        lock.lock()
        defer { lock.unlock() }
        return _session
    }

    var currentUser: User? {
        lock.lock()
        defer { lock.unlock() }
        return _currentUser
    }

    var accessToken: String? {
        session?.accessToken ?? client.auth.currentSession?.accessToken
    }

    private init() {
        client = SupabaseClient(
            supabaseURL: AppConfig.supabaseURL,
            supabaseKey: AppConfig.supabaseAnonKey,
            options: SupabaseClientOptions(
                auth: .init(
                    autoRefreshToken: true,
                    emitLocalSessionAsInitialSession: true
                )
            )
        )
        // Local only — never touch the network during init.
        applyLocalSession()
    }

    private func applyLocalSession() {
        if let local = client.auth.currentSession {
            setSession(local)
        } else {
            setSession(nil)
        }
    }

    private func setSession(_ session: Session?) {
        lock.lock()
        _session = session
        _currentUser = session?.user
        lock.unlock()
    }

    /// Instant. Reads Keychain/local storage only — does not await network refresh.
    func restoreSession() {
        applyLocalSession()
        if let session {
            try? persistTokens(session)
        }
    }

    /// Background soft-refresh. Safe to fire-and-forget after UI is up.
    func refreshSessionInBackground() {
        Task.detached(priority: .utility) { [client] in
            do {
                let session = try await client.auth.session
                await MainActor.run {
                    SupabaseManager.shared.setSession(session)
                }
                try? SupabaseManager.shared.persistTokens(session)
            } catch {
                // Keep existing local session.
            }
        }
    }

    func signIn(email: String, password: String) async throws {
        let session = try await client.auth.signIn(email: email, password: password)
        setSession(session)
        try persistTokens(session)
    }

    func signOut() async throws {
        try await client.auth.signOut()
        setSession(nil)
        KeychainStore.clearSession()
    }

    func refreshSessionIfNeeded() async {
        // Prefer local; kick background refresh without blocking callers.
        applyLocalSession()
        refreshSessionInBackground()
    }

    fileprivate func persistTokens(_ session: Session) throws {
        try KeychainStore.save(session.accessToken, for: .accessToken)
        try KeychainStore.save(session.refreshToken, for: .refreshToken)
    }
}
