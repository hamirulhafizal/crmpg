import AppIntents
import Foundation

struct DealerEntity: AppEntity {
    nonisolated(unsafe) static var typeDisplayRepresentation: TypeDisplayRepresentation = "Dealer"
    nonisolated(unsafe) static var defaultQuery = DealerEntityQuery()

    var id: String
    var label: String
    var email: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(label)", subtitle: "\(email)")
    }
}

struct DealerEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [DealerEntity] {
        let dealers = WidgetShared.loadDealers()
        return identifiers.compactMap { id in
            dealers.first(where: { $0.id == id }).map {
                DealerEntity(id: $0.id, label: $0.label, email: $0.email)
            }
        }
    }

    func suggestedEntities() async throws -> [DealerEntity] {
        WidgetShared.loadDealers().map {
            DealerEntity(id: $0.id, label: $0.label, email: $0.email)
        }
    }

    func defaultResult() async -> DealerEntity? {
        let dealers = WidgetShared.loadDealers()
        if let active = WidgetShared.activeDealerId(),
           let match = dealers.first(where: { $0.id == active }) {
            return DealerEntity(id: match.id, label: match.label, email: match.email)
        }
        return dealers.first.map { DealerEntity(id: $0.id, label: $0.label, email: $0.email) }
    }
}

struct SelectDealerIntent: WidgetConfigurationIntent {
    nonisolated(unsafe) static var title: LocalizedStringResource = "Account status"
    nonisolated(unsafe) static var description = IntentDescription("Show account status counts for a saved dealer.")

    @Parameter(title: "Dealer")
    var dealer: DealerEntity?

    init() {}

    init(dealer: DealerEntity?) {
        self.dealer = dealer
    }
}
