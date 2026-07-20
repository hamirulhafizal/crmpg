import Foundation

/// App Group bridge for the custom keyboard (cache + session + insert templates).
enum KeyboardShared {
    static let appGroupID = WidgetShared.appGroupID
    static let maxCachedCustomers = 400

    static var defaults: UserDefaults { WidgetShared.defaults }

    private static let customersKey = "keyboard_customers_v1"
    private static let sessionKey = "keyboard_session_v1"
    private static let templatesKey = "keyboard_templates_v1"
    private static let pendingEditsKey = "keyboard_pending_edits_v1"

    // MARK: - Session (for Full Access live calls)

    struct SessionSnapshot: Codable, Sendable {
        var userId: String
        var email: String?
        var dealerLabel: String
        var accessToken: String
        var refreshToken: String
        var updatedAt: Date
    }

    static func saveSession(_ session: SessionSnapshot) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        defaults.set(data, forKey: sessionKey)
    }

    static func loadSession() -> SessionSnapshot? {
        guard let data = defaults.data(forKey: sessionKey),
              let session = try? JSONDecoder().decode(SessionSnapshot.self, from: data)
        else { return nil }
        return session
    }

    static func clearSession() {
        defaults.removeObject(forKey: sessionKey)
    }

    // MARK: - Customer cache

    static func saveCustomers(_ customers: [KeyboardCustomer]) {
        let trimmed = Array(customers.prefix(maxCachedCustomers))
        guard let data = try? JSONEncoder().encode(trimmed) else { return }
        defaults.set(data, forKey: customersKey)
    }

    static func loadCustomers() -> [KeyboardCustomer] {
        guard let data = defaults.data(forKey: customersKey),
              let rows = try? JSONDecoder().decode([KeyboardCustomer].self, from: data)
        else { return [] }
        return rows
    }

    static func upsertCustomer(_ customer: KeyboardCustomer) {
        var rows = loadCustomers().filter { $0.id != customer.id }
        rows.insert(customer, at: 0)
        saveCustomers(rows)
    }

    static func searchCustomers(_ query: String) -> [KeyboardCustomer] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let rows = loadCustomers()
        guard !q.isEmpty else { return Array(rows.prefix(40)) }
        return rows.filter {
            $0.searchBlob.contains(q)
        }.prefix(60).map { $0 }
    }

    // MARK: - Templates

    static func defaultTemplates() -> [InsertTemplate] {
        [
            InsertTemplate(
                id: "card",
                name: "Contact card",
                body: "{name}\n{pgcode}\n{phone}"
            ),
            InsertTemplate(
                id: "wa_hi",
                name: "WhatsApp hi",
                body: "Hi {name}, this is regarding your PG account {pgcode}. Thank you!"
            ),
            InsertTemplate(
                id: "phone_only",
                name: "Phone only",
                body: "{phone}"
            ),
            InsertTemplate(
                id: "pg_only",
                name: "PG code only",
                body: "{pgcode}"
            ),
        ]
    }

    static func loadTemplates() -> [InsertTemplate] {
        guard let data = defaults.data(forKey: templatesKey),
              let rows = try? JSONDecoder().decode([InsertTemplate].self, from: data),
              !rows.isEmpty
        else {
            return defaultTemplates()
        }
        return rows
    }

    static func saveTemplates(_ templates: [InsertTemplate]) {
        guard let data = try? JSONEncoder().encode(templates) else { return }
        defaults.set(data, forKey: templatesKey)
    }

    // MARK: - Pending edits (no Full Access)

    static func enqueuePending(_ edit: PendingCustomerEdit) {
        var rows = loadPending()
        rows.removeAll { $0.customerId == edit.customerId && $0.kind == edit.kind }
        rows.append(edit)
        guard let data = try? JSONEncoder().encode(rows) else { return }
        defaults.set(data, forKey: pendingEditsKey)
    }

    static func loadPending() -> [PendingCustomerEdit] {
        guard let data = defaults.data(forKey: pendingEditsKey),
              let rows = try? JSONDecoder().decode([PendingCustomerEdit].self, from: data)
        else { return [] }
        return rows
    }

    static func clearPending() {
        defaults.removeObject(forKey: pendingEditsKey)
    }

    static func replacePending(_ edits: [PendingCustomerEdit]) {
        guard let data = try? JSONEncoder().encode(edits) else { return }
        defaults.set(data, forKey: pendingEditsKey)
    }
}

struct KeyboardCustomer: Codable, Identifiable, Hashable, Sendable {
    var id: String
    var name: String?
    var phone: String?
    var email: String?
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
    var statusTitle: String?

    var displayName: String {
        if let saveName, !saveName.isEmpty { return saveName }
        if let name, !name.isEmpty { return name }
        if let senderName, !senderName.isEmpty { return senderName }
        if let phone, !phone.isEmpty { return phone }
        return "Customer"
    }

    var searchBlob: String {
        [name, saveName, senderName, phone, email, pgCode, location, gender, ethnicity, dob]
            .compactMap { $0?.lowercased() }
            .joined(separator: " ")
    }
}

struct InsertTemplate: Codable, Identifiable, Hashable, Sendable {
    var id: String
    var name: String
    var body: String

    func render(customer: KeyboardCustomer) -> String {
        body
            .replacingOccurrences(of: "{name}", with: customer.displayName)
            .replacingOccurrences(of: "{phone}", with: customer.phone ?? "")
            .replacingOccurrences(of: "{email}", with: customer.email ?? "")
            .replacingOccurrences(of: "{pgcode}", with: customer.pgCode ?? "")
            .replacingOccurrences(of: "{location}", with: customer.location ?? "")
            .replacingOccurrences(of: "{sender}", with: customer.senderName ?? "")
            .replacingOccurrences(of: "{journey}", with: customer.salesJourneyStage ?? "")
            .replacingOccurrences(of: "{status}", with: customer.statusTitle ?? "")
    }
}

struct PendingCustomerEdit: Codable, Identifiable, Hashable, Sendable {
    enum Kind: String, Codable { case create, update }

    var id: String
    var kind: Kind
    var customerId: String?
    var payload: KeyboardCustomer
    var createdAt: Date
}
