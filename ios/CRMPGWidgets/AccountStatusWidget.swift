import SwiftUI
import WidgetKit

struct AccountStatusEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetStatsSnapshot?
    let dealerId: String?
    let message: String?
}

struct AccountStatusProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> AccountStatusEntry {
        AccountStatusEntry(
            date: Date(),
            snapshot: .empty(dealerId: "preview", label: "PG00000000"),
            dealerId: "preview",
            message: nil
        )
    }

    func snapshot(for configuration: SelectDealerIntent, in context: Context) async -> AccountStatusEntry {
        entry(for: configuration)
    }

    func timeline(for configuration: SelectDealerIntent, in context: Context) async -> Timeline<AccountStatusEntry> {
        let entry = entry(for: configuration)
        // Data is refreshed when the app opens; keep a long timeline.
        let next = Calendar.current.date(byAdding: .hour, value: 12, to: Date()) ?? Date().addingTimeInterval(43_200)
        return Timeline(entries: [entry], policy: .after(next))
    }

    private func entry(for configuration: SelectDealerIntent) -> AccountStatusEntry {
        let dealers = WidgetShared.loadDealers()
        let dealerId = configuration.dealer?.id
            ?? WidgetShared.activeDealerId()
            ?? dealers.first?.id

        guard let dealerId else {
            return AccountStatusEntry(
                date: Date(),
                snapshot: nil,
                dealerId: nil,
                message: "Open the app and sign in to sync dealers."
            )
        }

        if let snapshot = WidgetShared.loadSnapshot(dealerId: dealerId) {
            return AccountStatusEntry(date: Date(), snapshot: snapshot, dealerId: dealerId, message: nil)
        }

        let label = dealers.first(where: { $0.id == dealerId })?.label ?? "Dealer"
        return AccountStatusEntry(
            date: Date(),
            snapshot: nil,
            dealerId: dealerId,
            message: "Open Customers in the app once to sync \(label)."
        )
    }
}

struct AccountStatusWidget: Widget {
    let kind = WidgetShared.widgetKind

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: SelectDealerIntent.self, provider: AccountStatusProvider()) { entry in
            AccountStatusWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    Color(red: 0.97, green: 0.97, blue: 0.98)
                }
        }
        .configurationDisplayName("Account status")
        .description("Customer account status counts for a saved dealer.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct AccountStatusWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var entry: AccountStatusEntry

    var body: some View {
        if let snapshot = entry.snapshot {
            switch family {
            case .systemSmall:
                smallLayout(snapshot)
            default:
                mediumLayout(snapshot)
            }
        } else {
            emptyLayout
        }
    }

    private var emptyLayout: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Account status")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(entry.message ?? "No data yet")
                .font(.footnote)
                .foregroundStyle(.primary)
            Spacer(minLength: 0)
        }
        .padding(4)
        .widgetURL(WidgetShared.customersDeepLink(status: nil, dealerId: entry.dealerId))
    }

    private func smallLayout(_ snapshot: WidgetStatsSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(snapshot.dealerLabel)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Color(red: 0.72, green: 0.55, blue: 0.12))
                .lineLimit(1)

            Link(destination: WidgetShared.customersDeepLink(status: "total", dealerId: snapshot.dealerId)) {
                statusChip(title: "Total", value: snapshot.total, tint: Color(red: 0.83, green: 0.69, blue: 0.22))
            }

            HStack(spacing: 6) {
                Link(destination: WidgetShared.customersDeepLink(status: "active", dealerId: snapshot.dealerId)) {
                    statusChip(title: "Active", value: snapshot.active, tint: Color(red: 0.20, green: 0.72, blue: 0.45))
                }
                Link(destination: WidgetShared.customersDeepLink(status: "inactive", dealerId: snapshot.dealerId)) {
                    statusChip(title: "Inactive", value: snapshot.inactive, tint: Color(red: 0.92, green: 0.45, blue: 0.55))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(2)
    }

    private func mediumLayout(_ snapshot: WidgetStatsSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Account status")
                    .font(.caption.weight(.semibold))
                Spacer()
                Text(snapshot.dealerLabel)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color(red: 0.72, green: 0.55, blue: 0.12))
                    .lineLimit(1)
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                linkChip("Total", snapshot.total, "total", snapshot.dealerId, Color(red: 0.83, green: 0.69, blue: 0.22))
                linkChip("Active", snapshot.active, "active", snapshot.dealerId, Color(red: 0.20, green: 0.72, blue: 0.45))
                linkChip("Inactive", snapshot.inactive, "inactive", snapshot.dealerId, Color(red: 0.92, green: 0.45, blue: 0.55))
                linkChip("Freeze", snapshot.freeze, "freeze", snapshot.dealerId, Color(red: 0.95, green: 0.62, blue: 0.28))
                linkChip("Free", snapshot.free, "free", snapshot.dealerId, Color(red: 0.95, green: 0.78, blue: 0.25))
                linkChip("Temp", snapshot.temporary, "temporary", snapshot.dealerId, Color(red: 0.62, green: 0.48, blue: 0.90))
            }

            HStack {
                Text(snapshot.updatedAt, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text("ago")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(2)
    }

    private func linkChip(_ title: String, _ value: Int, _ status: String, _ dealerId: String, _ tint: Color) -> some View {
        Link(destination: WidgetShared.customersDeepLink(status: status, dealerId: dealerId)) {
            statusChip(title: title, value: value, tint: tint)
        }
    }

    private func statusChip(title: String, value: Int, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(tint)
            Text(formatCount(value))
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundStyle(.primary)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(6)
        .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func formatCount(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }
}
