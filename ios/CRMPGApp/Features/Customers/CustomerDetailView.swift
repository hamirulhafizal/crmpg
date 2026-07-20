import SwiftUI

@MainActor
@Observable
final class CustomerDetailViewModel {
    var customer: Customer?
    var tags: [CustomerTagAssignment] = []
    var isLoading = false
    var errorMessage: String?
    var showEdit = false
    var showTags = false
    var showChat = false
    var didDelete = false
    var selectedTab: DetailTab = .overview

    enum DetailTab: String, CaseIterable, Identifiable {
        case overview
        case details
        case tags
        var id: String { rawValue }
        var title: String {
            switch self {
            case .overview: "Overview"
            case .details: "Details"
            case .tags: "Tags"
            }
        }
    }

    private let customerId: UUID

    init(customerId: UUID) {
        self.customerId = customerId
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let customerTask = SupabaseRepository.fetchCustomer(id: customerId)
            async let tagsTask = SupabaseRepository.fetchCustomerTags(customerId: customerId)
            customer = try await customerTask
            tags = try await tagsTask
            if customer == nil {
                errorMessage = "Customer not found."
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func delete() async {
        do {
            try await SupabaseRepository.deleteCustomer(id: customerId)
            didDelete = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct CustomerDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: CustomerDetailViewModel
    @State private var confirmDelete = false

    init(customerId: UUID) {
        _viewModel = State(initialValue: CustomerDetailViewModel(customerId: customerId))
    }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.customer == nil {
                LoadingView(message: "Loading customer…")
            } else if let customer = viewModel.customer {
                List {
                    Section {
                        CustomerHeroHeader(customer: customer)
                    }
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)

                    Section {
                        Picker("Section", selection: $viewModel.selectedTab) {
                            ForEach(CustomerDetailViewModel.DetailTab.allCases) { tab in
                                Text(tab.title).tag(tab)
                            }
                        }
                        .pickerStyle(.segmented)
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                        .listRowBackground(Color.clear)
                    }

                    switch viewModel.selectedTab {
                    case .overview:
                        overviewSections(customer)
                    case .details:
                        detailsSections(customer)
                    case .tags:
                        tagsSection
                    }

                    Section("Actions") {
                        if let phone = customer.phone, !phone.isEmpty {
                            if let tel = URL(string: "tel:\(phone.filter(\.isNumber))") {
                                Link(destination: tel) {
                                    Label("Call", systemImage: "phone.fill")
                                }
                            }
                            if let wa = URL(string: "https://wa.me/\(phone.filter(\.isNumber))") {
                                Link(destination: wa) {
                                    Label("WhatsApp", systemImage: "message.fill")
                                }
                            }
                        }
                        Button {
                            viewModel.showChat = true
                        } label: {
                            Label("Chat history", systemImage: "bubble.left.and.bubble.right")
                        }
                        Button("Edit customer") {
                            viewModel.showEdit = true
                        }
                        Button("Delete customer", role: .destructive) {
                            confirmDelete = true
                        }
                    }
                }
            } else {
                EmptyStateView(
                    icon: "person.slash",
                    title: "Customer unavailable",
                    message: viewModel.errorMessage ?? "This customer could not be loaded."
                )
            }
        }
        .navigationTitle(viewModel.customer?.displayName ?? "Customer")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Edit") { viewModel.showEdit = true }
                    .disabled(viewModel.customer == nil)
            }
        }
        .refreshable { await viewModel.load() }
        .task { await viewModel.load() }
        .sheet(isPresented: $viewModel.showEdit) {
            if let customer = viewModel.customer {
                CustomerFormView(mode: .edit(customer)) { updated in
                    viewModel.customer = updated
                }
            }
        }
        .sheet(isPresented: $viewModel.showTags) {
            if let customer = viewModel.customer {
                CustomerTagsView(customerId: customer.id, assigned: viewModel.tags) { refreshed in
                    viewModel.tags = refreshed
                }
            }
        }
        .sheet(isPresented: $viewModel.showChat) {
            NavigationStack {
                if let customer = viewModel.customer {
                    ChatHistoryView(customerId: customer.id, customerName: customer.displayName)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button("Done") { viewModel.showChat = false }
                            }
                        }
                }
            }
        }
        .alert("Delete customer?", isPresented: $confirmDelete) {
            Button("Delete", role: .destructive) {
                Task {
                    await viewModel.delete()
                    if viewModel.didDelete { dismiss() }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This cannot be undone.")
        }
        .overlay(alignment: .top) {
            if let error = viewModel.errorMessage, viewModel.customer != nil {
                ErrorBanner(message: error) { viewModel.errorMessage = nil }
                    .padding()
            }
        }
    }

    @ViewBuilder
    private func overviewSections(_ customer: Customer) -> some View {
        Section("Status") {
            LabeledContent("Account", value: customer.accountStatus.title)
            LabeledContent("Journey", value: customer.journeyLabel)
            if let last = customer.lastPurchaseDisplay {
                LabeledContent("Last purchase", value: last)
            }
            if customer.isMonthlyBuyer == true {
                Label("Monthly buyer", systemImage: "arrow.triangle.2.circlepath")
                    .foregroundStyle(PGColors.success)
            }
        }

        Section("Contact") {
            LabeledContent("Name", value: customer.name ?? "—")
            if let sender = customer.senderName, !sender.isEmpty {
                LabeledContent("Sender name", value: sender)
            }
            if let save = customer.saveName, !save.isEmpty {
                LabeledContent("Save name", value: save)
            }
            if let phone = customer.phone, !phone.isEmpty {
                LabeledContent("Phone", value: phone)
            }
            if let email = customer.email, !email.isEmpty {
                LabeledContent("Email", value: email)
            }
            if let location = customer.location, !location.isEmpty {
                LabeledContent("Location", value: location)
                if let mapsURL = mapsURL(for: location) {
                    Link(destination: mapsURL) {
                        Label("Open in Maps", systemImage: "map.fill")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func detailsSections(_ customer: Customer) -> some View {
        Section("CRM profile") {
            if let pg = customer.pgCode, !pg.isEmpty {
                LabeledContent("PG code", value: pg)
            }
            if let dob = customer.dobDisplay {
                LabeledContent("Date of birth", value: dob)
            }
            if let age = customer.age {
                LabeledContent("Age", value: "\(age)")
            }
            if let gender = customer.gender, !gender.isEmpty {
                LabeledContent("Gender", value: gender)
            }
            if let ethnicity = customer.ethnicity, !ethnicity.isEmpty {
                LabeledContent("Ethnicity", value: ethnicity)
            }
        }

        Section("Flags") {
            flagRow("Married", customer.isMarried == true)
            flagRow("Friend", customer.isFriend == true)
            flagRow("Profile verified", customer.isProfileVerified)
            flagRow("Direct debit", customer.hasDirectDebit)
        }

        if let rank = customer.originalData?["Rank"]?.stringValue, !rank.isEmpty {
            Section("Business") {
                LabeledContent("Rank", value: rank)
                if let branch = customer.originalData?["Branch"]?.stringValue, !branch.isEmpty {
                    LabeledContent("Branch", value: branch)
                }
            }
        }
    }

    private var tagsSection: some View {
        Section("Tags") {
            if viewModel.tags.isEmpty {
                Text("No tags yet")
                    .foregroundStyle(PGColors.secondaryText)
            } else {
                FlowTagWrap(labels: viewModel.tags.compactMap(\.tag?.label))
            }
            Button("Manage tags") {
                viewModel.showTags = true
            }
        }
    }

    private func flagRow(_ title: String, _ value: Bool) -> some View {
        HStack {
            Text(title)
            Spacer()
            Image(systemName: value ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(value ? PGColors.success : PGColors.secondaryText)
        }
    }

    private func mapsURL(for location: String) -> URL? {
        var components = URLComponents(string: "https://maps.apple.com/")
        components?.queryItems = [URLQueryItem(name: "q", value: location)]
        return components?.url
    }
}

struct CustomerHeroHeader: View {
    let customer: Customer

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                Circle()
                    .fill(statusColor.opacity(0.18))
                    .frame(width: 64, height: 64)
                    .overlay {
                        Text(String(customer.displayName.prefix(1)).uppercased())
                            .font(.title2.weight(.bold))
                            .foregroundStyle(statusColor)
                    }

                VStack(alignment: .leading, spacing: 6) {
                    Text(customer.displayName)
                        .font(PGTypography.title)
                        .lineLimit(2)
                    if let pg = customer.pgCode, !pg.isEmpty {
                        Text(pg)
                            .font(PGTypography.caption)
                            .foregroundStyle(PGColors.goldDark)
                    }
                    HStack(spacing: 8) {
                        badge(customer.accountStatus.title, color: statusColor)
                        badge(customer.journeyLabel, color: PGColors.goldDark)
                    }
                }
            }

            if let last = customer.lastPurchaseDisplay {
                Text("Last purchase · \(last)")
                    .font(PGTypography.caption)
                    .foregroundStyle(PGColors.secondaryText)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(PGColors.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
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

    private func badge(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.14))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

private struct FlowTagWrap: View {
    let labels: [String]

    var body: some View {
        FlexibleTagLayout(spacing: 8) {
            ForEach(labels, id: \.self) { label in
                Text(label)
                    .font(PGTypography.caption)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(PGColors.gold.opacity(0.15))
                    .foregroundStyle(PGColors.goldDark)
                    .clipShape(Capsule())
            }
        }
    }
}

private struct FlexibleTagLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(proposal: proposal, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, point) in result.positions.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y),
                proposal: .unspecified
            )
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var width: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            width = max(width, x - spacing)
        }

        return (CGSize(width: width, height: y + rowHeight), positions)
    }
}
