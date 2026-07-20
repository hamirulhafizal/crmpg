import Foundation

enum SavedAccountsStore {
    private static let maxAccounts = 5

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

    static func upsert(from profile: Profile?, email: String, userId: UUID) {
        var accounts = load().filter { $0.id != userId && $0.email.lowercased() != email.lowercased() }
        accounts.insert(
            SavedAccount(
                id: userId,
                email: email,
                displayName: profile?.displayName ?? email,
                pgcode: profile?.pgcode,
                avatarURL: profile?.avatarURL,
                lastUsedAt: Date()
            ),
            at: 0
        )
        save(accounts)
    }

    static func remove(id: UUID) {
        save(load().filter { $0.id != id })
    }
}
