import Foundation
import Security

enum KeychainStore {
    private static let service = "com.publicgolds.crmpg.keychain"
    private static let authService = "com.publicgolds.crmpg.supabase-auth"

    enum Key: String {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case savedAccounts = "saved_accounts_v1"
    }

    static func save(_ value: String, for key: Key) throws {
        try saveData(Data(value.utf8), account: key.rawValue, service: service)
    }

    static func read(_ key: Key) -> String? {
        guard let data = readData(account: key.rawValue, service: service) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: Key) {
        deleteItem(account: key.rawValue, service: service)
    }

    static func clearSession() {
        delete(.accessToken)
        delete(.refreshToken)
    }

    // MARK: - Arbitrary key/value (Supabase AuthLocalStorage)

    static func saveAuthData(_ data: Data, forKey key: String) throws {
        try saveData(data, account: key, service: authService)
    }

    static func readAuthData(forKey key: String) -> Data? {
        readData(account: key, service: authService)
    }

    static func deleteAuthData(forKey key: String) {
        deleteItem(account: key, service: authService)
    }

    // MARK: - SecItem helpers

    private static func saveData(_ data: Data, account: String, service: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)

        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unhandled(status)
        }
    }

    private static func readData(account: String, service: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess else { return nil }
        return item as? Data
    }

    private static func deleteItem(account: String, service: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

enum KeychainError: LocalizedError {
    case unhandled(OSStatus)

    var errorDescription: String? {
        switch self {
        case .unhandled(let status):
            "Keychain error (\(status))"
        }
    }
}
