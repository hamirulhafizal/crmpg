import Foundation

/// Shared App Group storage for the custom keyboard (cache + session bridge + templates).
enum KeyboardShared {
    static let appGroupID = WidgetShared.appGroupID

    static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroupID) ?? .standard
    }

    private static let cacheKey = "keyboard_customer_cache_v1"
    private static let sessionKey = "keyboard_session_v1"
    private static let templatesKey = "keyboard_templates_v1"
    private static let pendingEditsKey = "keyboard_pending_edits_v1"
    private static let configKey = "keyboard_supabase_config_v1"

    // MARK: - Customer cache

    static func saveCache(_ cache: KeyboardCustomerCache) {
        guard let data = try? JSONEncoder().encode(cache) else { return }
        defaults.set(data, forKey: cacheKey)
    }

    static func loadCache() -> KeyboardCustomerCache? {
        guard let data = defaults.data(forKey: cacheKey),
              let cache = try? JSONDecoder().decode(KeyboardCustomerCache.self, from: data)
        else { return nil }
        return cache
    }

    static func upsertCachedCustomer(_ customer: KeyboardCustomer) {
        guard var cache = loadCache() else {
            saveCache(
                KeyboardCustomerCache(
                    dealerId: customer.userId ?? "",
                    dealerLabel: "Dealer",
                    customers: [customer],
                    updatedAt: Date()
                )
            )
            return
        }
        if let idx = cache.customers.firstIndex(where: { $0.id == customer.id }) {
            cache.customers[idx] = customer
        } else {
            cache.customers.insert(customer, at: 0)
        }
        cache.updatedAt = Date()
        saveCache(cache)
    }

    static func searchCache(_ query: String, limit: Int = 40) -> [KeyboardCustomer] {
        guard let cache = loadCache() else { return [] }
        // Never show another dealer's cached rows.
        if let activeId = loadSession()?.userId, cache.dealerId != activeId {
            return []
        }
        let customers = cache.customers
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if q.isEmpty {
            return Array(customers.prefix(limit))
        }
        return customers.filter {
            ($0.name ?? "").lowercased().contains(q)
                || ($0.phone ?? "").lowercased().contains(q)
                || ($0.pgCode ?? "").lowercased().contains(q)
                || ($0.email ?? "").lowercased().contains(q)
                || ($0.senderName ?? "").lowercased().contains(q)
                || ($0.saveName ?? "").lowercased().contains(q)
        }
        .prefix(limit)
        .map { $0 }
    }

    // MARK: - Session bridge (for Full Access network)

    static func saveSession(_ session: KeyboardSessionBridge) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        defaults.set(data, forKey: sessionKey)
    }

    static func loadSession() -> KeyboardSessionBridge? {
        guard let data = defaults.data(forKey: sessionKey),
              let session = try? JSONDecoder().decode(KeyboardSessionBridge.self, from: data)
        else { return nil }
        return session
    }

    static func clearSession() {
        defaults.removeObject(forKey: sessionKey)
    }

    static func saveSupabaseConfig(url: String, anonKey: String) {
        let payload = KeyboardSupabaseConfig(url: url, anonKey: anonKey)
        guard let data = try? JSONEncoder().encode(payload) else { return }
        defaults.set(data, forKey: configKey)
    }

    static func loadSupabaseConfig() -> KeyboardSupabaseConfig? {
        guard let data = defaults.data(forKey: configKey),
              let config = try? JSONDecoder().decode(KeyboardSupabaseConfig.self, from: data)
        else { return nil }
        return config
    }

    // MARK: - Templates

    static func loadTemplates() -> [KeyboardInsertTemplate] {
        if let data = defaults.data(forKey: templatesKey),
           let templates = try? JSONDecoder().decode([KeyboardInsertTemplate].self, from: data),
           !templates.isEmpty {
            return templates
        }
        return KeyboardInsertTemplate.defaults
    }

    static func saveTemplates(_ templates: [KeyboardInsertTemplate]) {
        guard let data = try? JSONEncoder().encode(templates) else { return }
        defaults.set(data, forKey: templatesKey)
    }

    // MARK: - Pending edits (no Full Access)

    static func enqueuePendingEdit(_ edit: KeyboardPendingEdit) {
        var all = loadPendingEdits()
        all.removeAll { $0.id == edit.id }
        all.append(edit)
        guard let data = try? JSONEncoder().encode(all) else { return }
        defaults.set(data, forKey: pendingEditsKey)
    }

    static func loadPendingEdits() -> [KeyboardPendingEdit] {
        guard let data = defaults.data(forKey: pendingEditsKey),
              let edits = try? JSONDecoder().decode([KeyboardPendingEdit].self, from: data)
        else { return [] }
        return edits
    }

    static func clearPendingEdits() {
        defaults.removeObject(forKey: pendingEditsKey)
    }

    static func savePendingEdits(_ edits: [KeyboardPendingEdit]) {
        guard let data = try? JSONEncoder().encode(edits) else { return }
        defaults.set(data, forKey: pendingEditsKey)
    }

    static func clearCache() {
        defaults.removeObject(forKey: cacheKey)
    }

    static func renderTemplate(_ template: String, customer: KeyboardCustomer) -> String {
        template
            .replacingOccurrences(of: "{name}", with: customer.displayName)
            .replacingOccurrences(of: "{phone}", with: customer.phone ?? "")
            .replacingOccurrences(of: "{pg}", with: customer.pgCode ?? "")
            .replacingOccurrences(of: "{email}", with: customer.email ?? "")
            .replacingOccurrences(of: "{location}", with: customer.location ?? "")
            .replacingOccurrences(of: "{sender}", with: customer.senderName ?? customer.displayName)
            .replacingOccurrences(of: "{save_name}", with: customer.saveName ?? customer.displayName)
    }
}

struct KeyboardSupabaseConfig: Codable, Sendable {
    var url: String
    var anonKey: String
}

struct KeyboardSessionBridge: Codable, Sendable {
    var userId: String
    var email: String?
    var accessToken: String
    var refreshToken: String
    var dealerLabel: String
    var updatedAt: Date
}

struct KeyboardCustomerCache: Codable, Sendable {
    var dealerId: String
    var dealerLabel: String
    var customers: [KeyboardCustomer]
    var updatedAt: Date
}

struct KeyboardCustomer: Codable, Identifiable, Hashable, Sendable {
    var id: String
    var userId: String?
    var name: String?
    var email: String?
    var phone: String?
    var location: String?
    var pgCode: String?
    var gender: String?
    var ethnicity: String?
    var senderName: String?
    var saveName: String?
    var dob: String?
    var isMarried: Bool?
    var isFriend: Bool?
    var salesJourneyStage: String?
    var accountStatus: String?

    var displayName: String {
        if let saveName, !saveName.isEmpty { return saveName }
        if let name, !name.isEmpty { return name }
        if let senderName, !senderName.isEmpty { return senderName }
        if let phone, !phone.isEmpty { return phone }
        return "Customer"
    }
}

struct KeyboardInsertTemplate: Codable, Identifiable, Hashable, Sendable {
    var id: String
    var title: String
    var body: String

    static let defaults: [KeyboardInsertTemplate] = [
        .init(id: "name", title: "Name", body: "{name}"),
        .init(id: "phone", title: "Phone", body: "{phone}"),
        .init(id: "pg", title: "PG code", body: "{pg}"),
        .init(id: "card", title: "Contact card", body: "{name}\n{pg}\n{phone}"),
        .init(id: "wa", title: "WhatsApp hello", body: "Hi {name}, "),
    ]
}

struct KeyboardPendingEdit: Codable, Identifiable, Sendable {
    var id: String
    var isCreate: Bool
    var customer: KeyboardCustomer
    var createdAt: Date
}
