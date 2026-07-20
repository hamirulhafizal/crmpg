import SwiftUI
import UIKit

@MainActor
@Observable
final class KeyboardStore {
    enum Route: Equatable {
        case list
        case detail(KeyboardCustomer)
        case edit(KeyboardCustomer)
        case create
        case templates(KeyboardCustomer)
        case templateEditor
    }

    var route: Route = .list
    var searchText = ""
    var customers: [KeyboardCustomer] = []
    var templates: [InsertTemplate] = KeyboardShared.loadTemplates()
    var session = KeyboardShared.loadSession()
    var hasFullAccess = false
    var isLoading = false
    var statusMessage: String?
    var draft = KeyboardCustomer(id: UUID().uuidString)

    var dealerLabel: String {
        session?.dealerLabel ?? "Not signed in"
    }

    func reloadFromCache() {
        session = KeyboardShared.loadSession()
        templates = KeyboardShared.loadTemplates()
        customers = KeyboardShared.searchCustomers(searchText)
    }

    func search() {
        Task { await performSearch() }
    }

    func performSearch() async {
        isLoading = true
        defer { isLoading = false }

        let cached = KeyboardShared.searchCustomers(searchText)
        customers = cached

        guard hasFullAccess, let session else {
            if session == nil {
                statusMessage = "Open Public Gold CRM and sign in once."
            } else if !hasFullAccess {
                statusMessage = "Enable Full Access for live search & save."
            }
            return
        }

        do {
            let live = try await KeyboardAPI.searchLive(query: searchText, session: session)
            if !live.isEmpty {
                customers = live
                // Merge into cache.
                var all = KeyboardShared.loadCustomers()
                for row in live {
                    all.removeAll { $0.id == row.id }
                    all.insert(row, at: 0)
                }
                KeyboardShared.saveCustomers(all)
            }
            statusMessage = nil
        } catch {
            statusMessage = "Cache mode: \(error.localizedDescription)"
        }
    }

    func beginCreate() {
        draft = KeyboardCustomer(id: UUID().uuidString, salesJourneyStage: "prospect")
        route = .create
    }

    func beginEdit(_ customer: KeyboardCustomer) {
        draft = customer
        route = .edit(customer)
    }

    func saveDraft(isCreate: Bool) async -> Bool {
        isLoading = true
        defer { isLoading = false }

        if draft.name?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true
            && draft.phone?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true
            && draft.senderName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true {
            statusMessage = "Enter a name or phone."
            return false
        }

        if hasFullAccess, let session {
            do {
                let saved: KeyboardCustomer
                if isCreate {
                    saved = try await KeyboardAPI.create(draft, session: session)
                } else {
                    saved = try await KeyboardAPI.update(draft, session: session)
                }
                KeyboardShared.upsertCustomer(saved)
                statusMessage = "Saved"
                route = .detail(saved)
                reloadFromCache()
                return true
            } catch {
                statusMessage = error.localizedDescription
                // Fall through to pending queue.
            }
        }

        let pending = PendingCustomerEdit(
            id: UUID().uuidString,
            kind: isCreate ? .create : .update,
            customerId: isCreate ? nil : draft.id,
            payload: draft,
            createdAt: Date()
        )
        KeyboardShared.enqueuePending(pending)
        KeyboardShared.upsertCustomer(draft)
        statusMessage = hasFullAccess ? "Queued — will sync when possible." : "Saved offline — open CRM app to sync."
        route = .detail(draft)
        reloadFromCache()
        return true
    }
}

struct KeyboardRootView: View {
    @Bindable var store: KeyboardStore
    var onInsert: (String) -> Void
    var onAdvance: () -> Void
    var onDismissKeyboard: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            content
        }
        .background(Color(uiColor: .systemBackground))
        .onAppear {
            store.reloadFromCache()
            Task { await store.performSearch() }
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Public Gold CRM")
                    .font(.caption.weight(.bold))
                Text(store.dealerLabel)
                    .font(.caption2)
                    .foregroundStyle(Color(red: 0.72, green: 0.55, blue: 0.12))
            }
            Spacer()
            if store.route != .list {
                Button("Back") {
                    store.route = .list
                    store.reloadFromCache()
                }
                .font(.caption.weight(.semibold))
            }
            Button {
                onDismissKeyboard()
            } label: {
                Image(systemName: "keyboard.chevron.compact.down")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private var content: some View {
        switch store.route {
        case .list:
            listView
        case .detail(let customer):
            detailView(customer)
        case .edit:
            editorView(isCreate: false)
        case .create:
            editorView(isCreate: true)
        case .templates(let customer):
            templatesView(customer)
        case .templateEditor:
            templateEditorView
        }
    }

    private var listView: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search name, phone, PG…", text: $store.searchText)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit { store.search() }
                if store.isLoading {
                    ProgressView().scaleEffect(0.7)
                }
                Button {
                    store.beginCreate()
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .foregroundStyle(Color(red: 0.83, green: 0.69, blue: 0.22))
                }
            }
            .padding(10)
            .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal, 12)

            if let status = store.statusMessage {
                Text(status)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 14)
            }

            List(store.customers) { customer in
                Button {
                    store.route = .detail(customer)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(customer.displayName)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                            HStack(spacing: 8) {
                                if let pg = customer.pgCode, !pg.isEmpty {
                                    Text(pg).foregroundStyle(Color(red: 0.72, green: 0.55, blue: 0.12))
                                }
                                if let phone = customer.phone, !phone.isEmpty {
                                    Text(phone).foregroundStyle(.secondary)
                                }
                            }
                            .font(.caption2)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
                .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
            }
            .listStyle(.plain)
            .onChange(of: store.searchText) { _, _ in
                store.search()
            }
        }
    }

    private func detailView(_ customer: KeyboardCustomer) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text(customer.displayName)
                    .font(.headline)
                gridRow("PG", customer.pgCode)
                gridRow("Phone", customer.phone)
                gridRow("Email", customer.email)
                gridRow("Location", customer.location)
                gridRow("Sender", customer.senderName)
                gridRow("Journey", customer.salesJourneyStage)
                gridRow("Status", customer.statusTitle)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    insertButton("Name") { onInsert(customer.displayName) }
                    insertButton("Phone") { onInsert(customer.phone ?? "") }
                    insertButton("PG") { onInsert(customer.pgCode ?? "") }
                    insertButton("Email") { onInsert(customer.email ?? "") }
                }

                Button {
                    store.route = .templates(customer)
                } label: {
                    Label("Insert template", systemImage: "text.badge.plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.83, green: 0.69, blue: 0.22))

                HStack {
                    Button("Edit profile") { store.beginEdit(customer) }
                        .buttonStyle(.bordered)
                    Button("Next field") { onAdvance() }
                        .buttonStyle(.bordered)
                }
            }
            .padding(12)
        }
    }

    private func editorView(isCreate: Bool) -> some View {
        ScrollView {
            VStack(spacing: 8) {
                Text(isCreate ? "New customer" : "Edit customer")
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity, alignment: .leading)

                field("Name", text: binding(\.name))
                field("Sender name", text: binding(\.senderName))
                field("Save name", text: binding(\.saveName))
                field("Phone", text: binding(\.phone))
                field("Email", text: binding(\.email))
                field("PG code", text: binding(\.pgCode))
                field("Location", text: binding(\.location))
                field("Gender", text: binding(\.gender))
                field("Ethnicity", text: binding(\.ethnicity))
                field("DOB", text: binding(\.dob))
                field("Journey", text: binding(\.salesJourneyStage))

                Toggle("Married", isOn: boolBinding(\.isMarried))
                Toggle("Friend", isOn: boolBinding(\.isFriend))

                if let status = store.statusMessage {
                    Text(status).font(.caption2).foregroundStyle(.secondary)
                }

                Button {
                    Task {
                        _ = await store.saveDraft(isCreate: isCreate)
                    }
                } label: {
                    if store.isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Save")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.83, green: 0.69, blue: 0.22))
                .disabled(store.isLoading)
            }
            .padding(12)
        }
    }

    private func templatesView(_ customer: KeyboardCustomer) -> some View {
        VStack(spacing: 8) {
            HStack {
                Text("Templates")
                    .font(.subheadline.weight(.bold))
                Spacer()
                Button("Manage") { store.route = .templateEditor }
                    .font(.caption)
            }
            .padding(.horizontal, 12)

            List(store.templates) { template in
                Button {
                    onInsert(template.render(customer: customer))
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(template.name).font(.subheadline.weight(.semibold))
                        Text(template.render(customer: customer))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(3)
                    }
                }
            }
            .listStyle(.plain)
        }
    }

    private var templateEditorView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("Insert templates")
                    .font(.subheadline.weight(.bold))
                Text("Tokens: {name} {phone} {email} {pgcode} {location} {sender} {journey} {status}")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                ForEach($store.templates) { $template in
                    VStack(alignment: .leading, spacing: 4) {
                        TextField("Name", text: $template.name)
                            .textFieldStyle(.roundedBorder)
                        TextField("Body", text: $template.body, axis: .vertical)
                            .textFieldStyle(.roundedBorder)
                            .lineLimit(3 ... 6)
                    }
                    .padding(.vertical, 4)
                }

                Button("Add template") {
                    store.templates.append(
                        InsertTemplate(id: UUID().uuidString, name: "Custom", body: "Hi {name}")
                    )
                }

                Button("Save templates") {
                    KeyboardShared.saveTemplates(store.templates)
                    store.statusMessage = "Templates saved"
                    store.route = .list
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.83, green: 0.69, blue: 0.22))
            }
            .padding(12)
        }
    }

    private func field(_ title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption2).foregroundStyle(.secondary)
            TextField(title, text: text)
                .textFieldStyle(.roundedBorder)
                .font(.footnote)
        }
    }

    private func binding(_ keyPath: WritableKeyPath<KeyboardCustomer, String?>) -> Binding<String> {
        Binding(
            get: { store.draft[keyPath: keyPath] ?? "" },
            set: { store.draft[keyPath: keyPath] = $0.isEmpty ? nil : $0 }
        )
    }

    private func boolBinding(_ keyPath: WritableKeyPath<KeyboardCustomer, Bool?>) -> Binding<Bool> {
        Binding(
            get: { store.draft[keyPath: keyPath] ?? false },
            set: { store.draft[keyPath: keyPath] = $0 }
        )
    }

    private func gridRow(_ title: String, _ value: String?) -> some View {
        HStack {
            Text(title).foregroundStyle(.secondary)
            Spacer()
            Text(value?.isEmpty == false ? value! : "—")
        }
        .font(.caption)
    }

    private func insertButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text("Insert \(title)")
                .font(.caption.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
        }
        .buttonStyle(.bordered)
    }
}
