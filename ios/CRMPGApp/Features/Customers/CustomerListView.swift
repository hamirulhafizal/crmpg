import SwiftUI

@MainActor
@Observable
final class CustomersViewModel {
    var customers: [Customer] = []
    var stats = CustomerStats()
    var availableTags: [Tag] = []
    var searchText = ""
    var filters = CustomerListFilters()
    var isLoading = false
    var isSearching = false
    var isLoadingStats = false
    var errorMessage: String?
    var showCreate = false
    var showFilters = false

    private var searchTask: Task<Void, Never>?

    var hasStats: Bool {
        stats.total > 0 || stats.byAccountStatus.values.contains(where: { $0 > 0 })
    }

    func load(search: String? = nil) async {
        let query = search ?? searchText
        let isInitial = customers.isEmpty && query.isEmpty && !filters.isActive
        if isInitial {
            isLoading = true
        } else {
            isSearching = true
        }
        errorMessage = nil
        defer {
            isLoading = false
            isSearching = false
        }

        do {
            async let listTask = SupabaseRepository.fetchCustomers(
                limit: 200,
                search: query.isEmpty ? nil : query,
                filters: filters
            )
            async let tagsTask = SupabaseRepository.fetchAllTags()
            customers = try await listTask
            availableTags = (try? await tagsTask) ?? availableTags
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadStats() async {
        isLoadingStats = true
        defer { isLoadingStats = false }

        // Prefer web API when it returns real per-status totals.
        if let response = try? await APIClient.shared.get(.customerStats, as: CustomerStatsAPIResponse.self) {
            let api = response.asStats
            if api.byAccountStatus.values.contains(where: { $0 > 0 }) {
                var next = api
                if next.total == 0 {
                    next.total = api.byAccountStatus.values.reduce(0, +)
                }
                stats = next
                return
            }
        }

        // Local dealer-scoped aggregation (never switches UI to journey).
        if let local = try? await SupabaseRepository.fetchCustomerAccountStats(),
           local.byAccountStatus.values.contains(where: { $0 > 0 }) || local.total > 0 {
            stats = local
            return
        }

        let ownedTotal = (try? await SupabaseRepository.fetchCustomerCount()) ?? 0
        stats = CustomerStats(total: ownedTotal)
    }

    func loadStatsAndPublishWidget(profile: Profile?) async {
        await loadStats()
        WidgetSnapshotSync.publish(stats: stats, profile: profile)
        if let customers = try? await SupabaseRepository.fetchCustomers(
            limit: KeyboardCacheSync.maxCachedCustomers,
            search: nil,
            filters: CustomerListFilters()
        ) {
            KeyboardCacheSync.publishCustomers(customers, profile: profile)
        } else {
            KeyboardCacheSync.publishCustomers(self.customers, profile: profile)
        }
    }

    func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }
            await load(search: searchText)
        }
    }

    func applyStatusFilter(_ status: AccountStatusKey?) {
        if filters.accountStatus == status {
            filters.accountStatus = nil
        } else {
            filters.accountStatus = status
            filters.journey = nil
        }
        Task { await load() }
    }

    func applyJourneyFilter(_ journey: SalesJourney?) {
        if filters.journey == journey {
            filters.journey = nil
        } else {
            filters.journey = journey
            filters.accountStatus = nil
        }
        Task { await load() }
    }

    func applyFilters(_ next: CustomerListFilters) {
        filters = next
        Task { await load() }
    }

    func clearFilters() {
        filters.clear()
        Task { await load() }
    }
}

struct CustomerListView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel = CustomersViewModel()

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.customers.isEmpty {
                LoadingView(message: "Loading customers…")
            } else {
                List {
                    Section {
                        CustomerStatsSection(viewModel: viewModel)
                    }
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)

                    if viewModel.filters.isActive {
                        Section {
                            FilterChipsBar(viewModel: viewModel)
                        }
                        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 8, trailing: 16))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    }

                    Section {
                        if viewModel.customers.isEmpty {
                            ContentUnavailableView(
                                viewModel.searchText.isEmpty && !viewModel.filters.isActive
                                    ? "No customers yet"
                                    : "No matches",
                                systemImage: "person.crop.circle.badge.questionmark",
                                description: Text(
                                    viewModel.searchText.isEmpty && !viewModel.filters.isActive
                                        ? "Tap + to add your first customer."
                                        : "Try adjusting search or filters."
                                )
                            )
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 24)
                        } else {
                            ForEach(viewModel.customers) { customer in
                                NavigationLink(value: customer) {
                                    CustomerRow(customer: customer)
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    if let phone = customer.phone, !phone.isEmpty {
                                        if let tel = URL(string: "tel:\(phone.filter(\.isNumber))") {
                                            Link(destination: tel) {
                                                Label("Call", systemImage: "phone.fill")
                                            }
                                            .tint(.green)
                                        }
                                        if let wa = URL(string: "https://wa.me/\(phone.filter(\.isNumber))") {
                                            Link(destination: wa) {
                                                Label("WhatsApp", systemImage: "message.fill")
                                            }
                                            .tint(.mint)
                                        }
                                    }
                                }
                            }
                        }
                    } header: {
                        HStack {
                            Text("Directory")
                            Spacer()
                            if viewModel.isSearching {
                                ProgressView()
                                    .scaleEffect(0.8)
                            } else {
                                Text("\(viewModel.customers.count) shown")
                                    .font(PGTypography.caption)
                                    .foregroundStyle(PGColors.secondaryText)
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Customers")
        .searchable(text: $viewModel.searchText, prompt: "Search name, phone, PG, email")
        .onChange(of: viewModel.searchText) { _, _ in
            viewModel.scheduleSearch()
        }
        .navigationDestination(for: Customer.self) { customer in
            CustomerDetailView(customerId: customer.id)
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    viewModel.showFilters = true
                } label: {
                    Image(systemName: viewModel.filters.isActive ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    viewModel.showCreate = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $viewModel.showCreate) {
            CustomerFormView(mode: .create) { created in
                viewModel.customers.insert(created, at: 0)
                Task { await viewModel.loadStatsAndPublishWidget(profile: appState.profile) }
            }
        }
        .sheet(isPresented: $viewModel.showFilters) {
            CustomerFilterSheet(
                filters: viewModel.filters,
                tags: viewModel.availableTags
            ) { next in
                viewModel.applyFilters(next)
            }
        }
        .refreshable {
            await viewModel.load()
            await viewModel.loadStatsAndPublishWidget(profile: appState.profile)
        }
        .overlay(alignment: .top) {
            if let error = viewModel.errorMessage {
                ErrorBanner(message: error) {
                    viewModel.errorMessage = nil
                }
                .padding()
            }
        }
        .task {
            await viewModel.load()
            await viewModel.loadStatsAndPublishWidget(profile: appState.profile)
            applyPendingDeepLinkIfNeeded()
        }
        .onChange(of: appState.pendingCustomersTab) { _, pending in
            if pending {
                applyPendingDeepLinkIfNeeded()
            }
        }
        .onChange(of: appState.accountSessionID) { _, _ in
            Task {
                await viewModel.load()
                await viewModel.loadStatsAndPublishWidget(profile: appState.profile)
                applyPendingDeepLinkIfNeeded()
            }
        }
    }

    private func applyPendingDeepLinkIfNeeded() {
        guard appState.pendingCustomersTab else { return }
        if let dealerId = appState.pendingCustomerDealerId,
           SupabaseManager.shared.currentUser?.id != dealerId {
            // Wait until account switch finishes.
            return
        }
        let pending = appState.consumePendingCustomerDeepLink()
        if let status = pending.status {
            viewModel.filters.accountStatus = status
            viewModel.filters.journey = nil
            Task { await viewModel.load() }
        } else {
            viewModel.clearFilters()
        }
    }
}

struct CustomerStatsSection: View {
    @Bindable var viewModel: CustomersViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Account status")
                    .font(PGTypography.headline)
                Spacer()
                if viewModel.isLoadingStats {
                    ProgressView()
                        .scaleEffect(0.8)
                }
            }

            if viewModel.isLoadingStats {
                Text("Updating counts…")
                    .font(PGTypography.caption)
                    .foregroundStyle(PGColors.secondaryText)
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                CustomerStatCard(
                    title: "Total",
                    value: formatCount(viewModel.stats.total),
                    tint: PGColors.gold,
                    isSelected: viewModel.filters.accountStatus == nil && viewModel.filters.journey == nil
                ) {
                    viewModel.clearFilters()
                }

                ForEach(AccountStatusKey.allCases) { status in
                    CustomerStatCard(
                        title: status.title,
                        value: formatCount(viewModel.stats.count(for: status)),
                        subtitle: status.subtitle,
                        tint: statusTint(status),
                        isSelected: viewModel.filters.accountStatus == status
                    ) {
                        viewModel.applyStatusFilter(status)
                    }
                }
            }
        }
    }

    private func formatCount(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    private func statusTint(_ status: AccountStatusKey) -> Color {
        switch status {
        case .active: Color(red: 0.20, green: 0.72, blue: 0.45)
        case .inactive: Color(red: 0.92, green: 0.45, blue: 0.55)
        case .freeze: Color(red: 0.95, green: 0.62, blue: 0.28)
        case .free: Color(red: 0.95, green: 0.78, blue: 0.25)
        case .temporary: Color(red: 0.62, green: 0.48, blue: 0.90)
        case .unknown: PGColors.secondaryText
        }
    }
}

struct CustomerStatCard: View {
    let title: String
    let value: String
    var subtitle: String? = nil
    let tint: Color
    var isSelected = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title.uppercased())
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(PGColors.secondaryText)
                    .lineLimit(1)
                Text(value)
                    .font(.system(.title3, design: .rounded, weight: .bold))
                    .foregroundStyle(tint)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let subtitle {
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundStyle(PGColors.secondaryText)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 72, alignment: .topLeading)
            .padding(12)
            .background(tint.opacity(isSelected ? 0.22 : 0.1))
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(isSelected ? tint : .clear, lineWidth: 1.5)
            }
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct FilterChipsBar: View {
    @Bindable var viewModel: CustomersViewModel

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if let status = viewModel.filters.accountStatus {
                    chip(status.title) { viewModel.applyStatusFilter(nil) }
                }
                if let journey = viewModel.filters.journey {
                    chip(journey.title) { viewModel.applyJourneyFilter(nil) }
                }
                if let gender = viewModel.filters.gender {
                    chip(gender) {
                        viewModel.filters.gender = nil
                        Task { await viewModel.load() }
                    }
                }
                if let ethnicity = viewModel.filters.ethnicity {
                    chip(ethnicity) {
                        viewModel.filters.ethnicity = nil
                        Task { await viewModel.load() }
                    }
                }
                if let age = viewModel.filters.agePreset {
                    chip(age.title) {
                        viewModel.filters.agePreset = nil
                        Task { await viewModel.load() }
                    }
                }
                if viewModel.filters.friendsOnly {
                    chip("Friends") {
                        viewModel.filters.friendsOnly = false
                        Task { await viewModel.load() }
                    }
                }
                if viewModel.filters.marriedOnly {
                    chip("Married") {
                        viewModel.filters.marriedOnly = false
                        Task { await viewModel.load() }
                    }
                }
                if !viewModel.filters.tagIds.isEmpty {
                    chip("\(viewModel.filters.tagIds.count) tags") {
                        viewModel.filters.tagIds = []
                        Task { await viewModel.load() }
                    }
                }
                Button("Clear all") {
                    viewModel.clearFilters()
                }
                .font(PGTypography.caption)
                .foregroundStyle(PGColors.goldDark)
            }
        }
    }

    private func chip(_ title: String, clear: @escaping () -> Void) -> some View {
        Button(action: clear) {
            HStack(spacing: 4) {
                Text(title)
                Image(systemName: "xmark")
                    .font(.caption2.weight(.bold))
            }
            .font(PGTypography.caption)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(PGColors.gold.opacity(0.15))
            .foregroundStyle(PGColors.goldDark)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct CustomerRow: View {
    let customer: Customer

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(statusColor.opacity(0.18))
                .frame(width: 44, height: 44)
                .overlay {
                    Text(String(customer.displayName.prefix(1)).uppercased())
                        .font(PGTypography.headline)
                        .foregroundStyle(statusColor)
                }

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(customer.displayName)
                        .font(PGTypography.headline)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Text(customer.accountStatus.title)
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(statusColor.opacity(0.14))
                        .foregroundStyle(statusColor)
                        .clipShape(Capsule())
                }

                if let pg = customer.pgCode, !pg.isEmpty {
                    Text(pg)
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.goldDark)
                }

                Text(customer.subtitle)
                    .font(PGTypography.caption)
                    .foregroundStyle(PGColors.secondaryText)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    Label(customer.journeyLabel, systemImage: "point.topleft.down.to.point.bottomright.curvepath")
                    if customer.isFriend == true {
                        Label("Friend", systemImage: "person.2.fill")
                    }
                    if customer.isProfileVerified {
                        Label("Verified", systemImage: "checkmark.seal.fill")
                    }
                }
                .font(.caption2)
                .foregroundStyle(PGColors.secondaryText)
            }
        }
        .padding(.vertical, 4)
    }

    private var statusColor: Color {
        switch customer.accountStatus {
        case .active: .green
        case .inactive: .orange
        case .freeze: .blue
        case .free: .purple
        case .temporary: .pink
        case .unknown: PGColors.goldDark
        }
    }
}

#Preview {
    NavigationStack {
        CustomerListView()
    }
}
