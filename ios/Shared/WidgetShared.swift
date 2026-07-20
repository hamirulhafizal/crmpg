import Foundation

/// Shared between the main app and the Account Status widget (App Group).
enum WidgetShared {
    static let appGroupID = "group.com.publicgolds.crmpg"
    static let widgetKind = "AccountStatusWidget"
    static let urlScheme = "crmpg"

    static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroupID) ?? .standard
    }

    private static let dealersKey = "widget_dealers_v1"
    private static let snapshotsKey = "widget_snapshots_v1"
    private static let activeDealerKey = "widget_active_dealer_id"

    // MARK: - Dealers (picker list)

    static func saveDealers(_ dealers: [WidgetDealer]) {
        guard let data = try? JSONEncoder().encode(dealers) else { return }
        defaults.set(data, forKey: dealersKey)
    }

    static func loadDealers() -> [WidgetDealer] {
        guard let data = defaults.data(forKey: dealersKey),
              let dealers = try? JSONDecoder().decode([WidgetDealer].self, from: data)
        else { return [] }
        return dealers.sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
    }

    static func setActiveDealerId(_ id: String?) {
        defaults.set(id, forKey: activeDealerKey)
    }

    static func activeDealerId() -> String? {
        defaults.string(forKey: activeDealerKey)
    }

    // MARK: - Snapshots

    static func saveSnapshot(_ snapshot: WidgetStatsSnapshot) {
        var all = loadAllSnapshots()
        all[snapshot.dealerId] = snapshot
        guard let data = try? JSONEncoder().encode(all) else { return }
        defaults.set(data, forKey: snapshotsKey)
    }

    static func loadSnapshot(dealerId: String) -> WidgetStatsSnapshot? {
        loadAllSnapshots()[dealerId]
    }

    static func loadAllSnapshots() -> [String: WidgetStatsSnapshot] {
        guard let data = defaults.data(forKey: snapshotsKey),
              let map = try? JSONDecoder().decode([String: WidgetStatsSnapshot].self, from: data)
        else { return [:] }
        return map
    }

    // MARK: - Deep links

    /// `crmpg://customers?status=active&dealer=<uuid>`
    static func customersDeepLink(status: String?, dealerId: String?) -> URL {
        var components = URLComponents()
        components.scheme = urlScheme
        components.host = "customers"
        var items: [URLQueryItem] = []
        if let status, !status.isEmpty {
            items.append(URLQueryItem(name: "status", value: status))
        }
        if let dealerId, !dealerId.isEmpty {
            items.append(URLQueryItem(name: "dealer", value: dealerId))
        }
        components.queryItems = items.isEmpty ? nil : items
        return components.url ?? URL(string: "\(urlScheme)://customers")!
    }

    static func parseDeepLink(_ url: URL) -> (status: String?, dealerId: String?)? {
        guard url.scheme == urlScheme else { return nil }
        let host = url.host?.lowercased() ?? ""
        let path = url.path.lowercased()
        guard host == "customers" || path.contains("customers") else { return nil }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let status = items.first(where: { $0.name == "status" })?.value
        let dealer = items.first(where: { $0.name == "dealer" })?.value
        return (status, dealer)
    }
}

struct WidgetDealer: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var email: String
    var displayName: String
    var pgcode: String?

    var label: String {
        if let pgcode, !pgcode.isEmpty { return pgcode }
        if !displayName.isEmpty { return displayName }
        return email
    }
}

struct WidgetStatsSnapshot: Codable, Hashable, Sendable {
    var dealerId: String
    var dealerLabel: String
    var total: Int
    var active: Int
    var inactive: Int
    var freeze: Int
    var free: Int
    var temporary: Int
    var unknown: Int
    var updatedAt: Date

    static func empty(dealerId: String, label: String) -> WidgetStatsSnapshot {
        WidgetStatsSnapshot(
            dealerId: dealerId,
            dealerLabel: label,
            total: 0,
            active: 0,
            inactive: 0,
            freeze: 0,
            free: 0,
            temporary: 0,
            unknown: 0,
            updatedAt: Date()
        )
    }

    func count(for statusRaw: String) -> Int {
        switch statusRaw {
        case "total": total
        case "active": active
        case "inactive": inactive
        case "freeze": freeze
        case "free": free
        case "temporary": temporary
        case "unknown": unknown
        default: 0
        }
    }
}
