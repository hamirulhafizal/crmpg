import Foundation
import WidgetKit

/// Publishes dealer list + account-status counts into the App Group for Home Screen widgets.
enum WidgetSnapshotSync {
    @MainActor
    static func syncDealersFromSavedAccounts() {
        let dealers = SavedAccountsStore.load().map {
            WidgetDealer(
                id: $0.id.uuidString,
                email: $0.email,
                displayName: $0.displayName,
                pgcode: $0.pgcode
            )
        }
        WidgetShared.saveDealers(dealers)
        if let current = SupabaseManager.shared.currentUser?.id.uuidString {
            WidgetShared.setActiveDealerId(current)
        }
    }

    @MainActor
    static func publish(stats: CustomerStats, profile: Profile?) {
        guard let user = SupabaseManager.shared.currentUser else { return }
        let label: String = {
            if let pg = profile?.pgcode, !pg.isEmpty { return pg }
            if let name = profile?.displayName, !name.isEmpty { return name }
            return user.email ?? "Dealer"
        }()

        let snapshot = WidgetStatsSnapshot(
            dealerId: user.id.uuidString,
            dealerLabel: label,
            total: stats.total,
            active: stats.count(for: .active),
            inactive: stats.count(for: .inactive),
            freeze: stats.count(for: .freeze),
            free: stats.count(for: .free),
            temporary: stats.count(for: .temporary),
            unknown: stats.count(for: AccountStatusKey.unknown),
            updatedAt: Date()
        )

        syncDealersFromSavedAccounts()
        WidgetShared.saveSnapshot(snapshot)
        WidgetCenter.shared.reloadTimelines(ofKind: WidgetShared.widgetKind)
    }

    /// Refresh current dealer stats for widgets (call on app open / foreground).
    @MainActor
    static func refreshCurrentDealerStats(profile: Profile?) async {
        syncDealersFromSavedAccounts()
        guard SupabaseManager.shared.currentUser != nil else {
            WidgetCenter.shared.reloadTimelines(ofKind: WidgetShared.widgetKind)
            return
        }

        var stats = CustomerStats()
        if let response = try? await APIClient.shared.get(.customerStats, as: CustomerStatsAPIResponse.self) {
            let api = response.asStats
            if api.byAccountStatus.values.contains(where: { $0 > 0 }) {
                stats = api
                if stats.total == 0 {
                    stats.total = api.byAccountStatus.values.reduce(0, +)
                }
            }
        }
        if stats.total == 0,
           let local = try? await SupabaseRepository.fetchCustomerAccountStats() {
            stats = local
        }
        if stats.total == 0 {
            stats.total = (try? await SupabaseRepository.fetchCustomerCount()) ?? 0
        }

        publish(stats: stats, profile: profile)
    }
}
