import Foundation
import Supabase

enum SavedAccountsStore {
    static let maxAccounts = 5

    static func load() -> [SavedAccount] {
        guard let raw = KeychainStore.read(.savedAccounts),
              let data = raw.data(using: .utf8),
              let accounts = try? JSONDecoder().decode([SavedAccount].self, from: data)
        else {
            return []
        }
        return accounts.sorted { $0.lastUsedAt > $1.lastUsedAt }
    }

    static func save(_ accounts: [SavedAccount]) {
        let trimmed = Array(accounts.sorted { $0.lastUsedAt > $1.lastUsedAt }.prefix(maxAccounts))
        guard let data = try? JSONEncoder().encode(trimmed),
              let string = String(data: data, encoding: .utf8)
        else { return }
        try? KeychainStore.save(string, for: .savedAccounts)
    }

    static func upsert(
        from profile: Profile?,
        email: String,
        userId: UUID,
        password: String? = nil,
        session: Session? = nil
    ) {
        let existing = load().first { $0.id == userId || $0.email.lowercased() == email.lowercased() }
        var accounts = load().filter { $0.id != userId && $0.email.lowercased() != email.lowercased() }

        let trimmedPassword = password?.trimmingCharacters(in: .whitespacesAndNewlines)
        let nextPassword = (trimmedPassword?.isEmpty == false) ? trimmedPassword : existing?.password

        accounts.insert(
            SavedAccount(
                id: userId,
                email: email,
                displayName: profile?.displayName ?? existing?.displayName ?? email,
                pgcode: profile?.pgcode ?? existing?.pgcode,
                avatarURL: profile?.avatarURL ?? existing?.avatarURL,
                password: nextPassword,
                refreshToken: session?.refreshToken ?? existing?.refreshToken,
                accessToken: session?.accessToken ?? existing?.accessToken,
                expiresAt: session.map { Date(timeIntervalSince1970: TimeInterval($0.expiresAt)) }
                    ?? existing?.expiresAt,
                lastUsedAt: Date()
            ),
            at: 0
        )
        save(accounts)
    }

    /// Snapshot the active Supabase session into the matching saved dealer (like web localStorage).
    static func captureCurrentSession(profile: Profile?) {
        let session = SupabaseManager.shared.session
            ?? SupabaseManager.shared.client.auth.currentSession
        guard let session,
              let email = session.user.email
        else { return }

        upsert(
            from: profile,
            email: email,
            userId: session.user.id,
            session: session
        )
    }

    static func account(id: UUID) -> SavedAccount? {
        load().first { $0.id == id }
    }

    static func remove(id: UUID) {
        save(load().filter { $0.id != id })
    }

    static func canAddMore(excludingCurrent currentId: UUID? = nil) -> Bool {
        let accounts = load()
        if let currentId, accounts.contains(where: { $0.id == currentId }) {
            return accounts.count < maxAccounts
        }
        return accounts.count < maxAccounts
    }
}
