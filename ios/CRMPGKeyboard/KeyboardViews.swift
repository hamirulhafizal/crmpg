import SwiftUI

struct KeyboardRootView: View {
    @Bindable var viewModel: KeyboardViewModel
    var onInsert: (String) -> Void
    var onAdvance: () -> Void
    var onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Divider()
            content
        }
        .background(Color(UIColor.secondarySystemBackground))
    }

    private var topBar: some View {
        HStack(spacing: 10) {
            Button(action: onAdvance) {
                Image(systemName: "globe")
                    .font(.system(size: 18, weight: .medium))
            }
            Text(viewModel.dealerLabel)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color(red: 0.72, green: 0.55, blue: 0.12))
                .lineLimit(1)
            Spacer()
            if viewModel.isLoading || viewModel.isSaving {
                ProgressView().scaleEffect(0.75)
            }
            Button(action: onDismiss) {
                Image(systemName: "keyboard.chevron.compact.down")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.route {
        case .list:
            KeyboardListView(viewModel: viewModel, onInsert: onInsert)
        case .detail:
            KeyboardEditorView(viewModel: viewModel, isCreate: false, onInsert: onInsert)
        case .create:
            KeyboardEditorView(viewModel: viewModel, isCreate: true, onInsert: onInsert)
        case .templates:
            KeyboardTemplatesView(viewModel: viewModel)
        case .editTemplate(let template):
            KeyboardTemplateEditorView(viewModel: viewModel, template: template)
        }
    }
}

struct KeyboardListView: View {
    @Bindable var viewModel: KeyboardViewModel
    var onInsert: (String) -> Void

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search name, phone, PG…", text: $viewModel.searchText)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onChange(of: viewModel.searchText) { _, _ in
                        viewModel.scheduleSearch()
                    }
                if !viewModel.searchText.isEmpty {
                    Button {
                        viewModel.searchText = ""
                        Task { await viewModel.performSearch() }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(8)
            .background(Color(UIColor.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal, 12)

            HStack(spacing: 8) {
                Button {
                    viewModel.openCreate()
                } label: {
                    Label("New", systemImage: "plus.circle.fill")
                        .font(.caption.weight(.semibold))
                }
                Button {
                    viewModel.route = .templates
                } label: {
                    Label("Templates", systemImage: "text.badge.plus")
                        .font(.caption.weight(.semibold))
                }
                Spacer()
                if !viewModel.hasFullAccess {
                    Text("Offline cache")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 12)

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption2)
                    .foregroundStyle(.red)
                    .padding(.horizontal, 12)
            }

            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach(viewModel.customers) { customer in
                        Button {
                            viewModel.openDetail(customer)
                        } label: {
                            HStack(spacing: 10) {
                                Circle()
                                    .fill(Color(red: 0.83, green: 0.69, blue: 0.22).opacity(0.25))
                                    .frame(width: 32, height: 32)
                                    .overlay {
                                        Text(String(customer.displayName.prefix(1)).uppercased())
                                            .font(.caption.weight(.bold))
                                    }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(customer.displayName)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(.primary)
                                        .lineLimit(1)
                                    HStack(spacing: 6) {
                                        if let pg = customer.pgCode, !pg.isEmpty {
                                            Text(pg).foregroundStyle(Color(red: 0.72, green: 0.55, blue: 0.12))
                                        }
                                        if let phone = customer.phone, !phone.isEmpty {
                                            Text(phone).foregroundStyle(.secondary)
                                        }
                                    }
                                    .font(.caption2)
                                    .lineLimit(1)
                                }
                                Spacer(minLength: 0)
                                Menu {
                                    ForEach(viewModel.templates) { template in
                                        Button(template.title) {
                                            onInsert(KeyboardShared.renderTemplate(template.body, customer: customer))
                                        }
                                    }
                                } label: {
                                    Image(systemName: "text.insert")
                                        .font(.body)
                                }
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(8)
                            .background(Color(UIColor.systemBackground), in: RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                    }

                    if viewModel.customers.isEmpty {
                        Text(viewModel.searchText.isEmpty ? "Open the CRM app once to sync customers." : "No matches")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.top, 20)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            }
        }
        .padding(.top, 4)
    }
}

struct KeyboardEditorView: View {
    @Bindable var viewModel: KeyboardViewModel
    var isCreate: Bool
    var onInsert: (String) -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    viewModel.route = .list
                } label: {
                    Label("Back", systemImage: "chevron.left")
                        .font(.caption.weight(.semibold))
                }
                Spacer()
                Text(isCreate ? "New customer" : "Customer")
                    .font(.caption.weight(.bold))
                Spacer()
                Button {
                    Task {
                        _ = await viewModel.saveDraft(isCreate: isCreate)
                    }
                } label: {
                    Text(viewModel.isSaving ? "Saving…" : "Save")
                        .font(.caption.weight(.bold))
                }
                .disabled(viewModel.isSaving)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            if let info = viewModel.infoMessage {
                Text(info).font(.caption2).foregroundStyle(.secondary).padding(.horizontal, 12)
            }
            if let error = viewModel.errorMessage {
                Text(error).font(.caption2).foregroundStyle(.red).padding(.horizontal, 12)
            }

            ScrollView {
                VStack(spacing: 8) {
                    field("Name", text: nameBinding)
                    field("Sender name", text: senderBinding)
                    field("PG code", text: pgBinding)
                        .onChange(of: viewModel.draft.pgCode) { _, _ in viewModel.syncSaveName() }
                    field("Save name", text: saveNameBinding)
                    field("Phone", text: phoneBinding)
                        .keyboardType(.phonePad)
                    field("Email", text: emailBinding)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                    field("Location", text: locationBinding)
                    field("Gender", text: genderBinding)
                    field("Ethnicity", text: ethnicityBinding)
                    field("DOB", text: dobBinding)
                    field("Journey", text: journeyBinding)

                    Toggle("Married", isOn: marriedBinding)
                    Toggle("Friend / saved contact", isOn: friendBinding)

                    if !isCreate {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(viewModel.templates) { template in
                                    Button(template.title) {
                                        onInsert(KeyboardShared.renderTemplate(template.body, customer: viewModel.draft))
                                    }
                                    .buttonStyle(.bordered)
                                    .font(.caption)
                                }
                            }
                        }
                    }
                }
                .padding(12)
            }
        }
    }

    private func field(_ title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            TextField(title, text: text)
                .padding(8)
                .background(Color(UIColor.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
        }
    }

    private var nameBinding: Binding<String> {
        Binding(get: { viewModel.draft.name ?? "" }, set: { viewModel.draft.name = $0 })
    }
    private var senderBinding: Binding<String> {
        Binding(
            get: { viewModel.draft.senderName ?? "" },
            set: {
                viewModel.draft.senderName = $0
                viewModel.syncSaveName()
            }
        )
    }
    private var pgBinding: Binding<String> {
        Binding(get: { viewModel.draft.pgCode ?? "" }, set: { viewModel.draft.pgCode = $0 })
    }
    private var saveNameBinding: Binding<String> {
        Binding(get: { viewModel.draft.saveName ?? "" }, set: { viewModel.draft.saveName = $0 })
    }
    private var phoneBinding: Binding<String> {
        Binding(get: { viewModel.draft.phone ?? "" }, set: { viewModel.draft.phone = $0 })
    }
    private var emailBinding: Binding<String> {
        Binding(get: { viewModel.draft.email ?? "" }, set: { viewModel.draft.email = $0 })
    }
    private var locationBinding: Binding<String> {
        Binding(get: { viewModel.draft.location ?? "" }, set: { viewModel.draft.location = $0 })
    }
    private var genderBinding: Binding<String> {
        Binding(get: { viewModel.draft.gender ?? "" }, set: { viewModel.draft.gender = $0 })
    }
    private var ethnicityBinding: Binding<String> {
        Binding(get: { viewModel.draft.ethnicity ?? "" }, set: { viewModel.draft.ethnicity = $0 })
    }
    private var dobBinding: Binding<String> {
        Binding(get: { viewModel.draft.dob ?? "" }, set: { viewModel.draft.dob = $0 })
    }
    private var journeyBinding: Binding<String> {
        Binding(get: { viewModel.draft.salesJourneyStage ?? "prospect" }, set: { viewModel.draft.salesJourneyStage = $0 })
    }
    private var marriedBinding: Binding<Bool> {
        Binding(get: { viewModel.draft.isMarried ?? false }, set: { viewModel.draft.isMarried = $0 })
    }
    private var friendBinding: Binding<Bool> {
        Binding(get: { viewModel.draft.isFriend ?? false }, set: { viewModel.draft.isFriend = $0 })
    }
}

struct KeyboardTemplatesView: View {
    @Bindable var viewModel: KeyboardViewModel

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    viewModel.route = .list
                } label: {
                    Label("Back", systemImage: "chevron.left")
                        .font(.caption.weight(.semibold))
                }
                Spacer()
                Text("Insert templates")
                    .font(.caption.weight(.bold))
                Spacer()
                Button {
                    let neu = KeyboardInsertTemplate(
                        id: UUID().uuidString,
                        title: "Custom",
                        body: "Hi {name}, "
                    )
                    viewModel.templates.append(neu)
                    viewModel.saveTemplates()
                    viewModel.route = .editTemplate(neu)
                } label: {
                    Image(systemName: "plus")
                }
            }
            .padding(12)

            Text("Tokens: {name} {phone} {pg} {email} {location} {sender} {save_name}")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 12)

            List {
                ForEach(viewModel.templates) { template in
                    Button {
                        viewModel.route = .editTemplate(template)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(template.title).font(.subheadline.weight(.semibold))
                            Text(template.body)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                    }
                }
                .onDelete { indexSet in
                    viewModel.templates.remove(atOffsets: indexSet)
                    viewModel.saveTemplates()
                }
            }
            .listStyle(.plain)
        }
    }
}

struct KeyboardTemplateEditorView: View {
    @Bindable var viewModel: KeyboardViewModel
    @State var template: KeyboardInsertTemplate

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Button {
                    viewModel.route = .templates
                } label: {
                    Label("Back", systemImage: "chevron.left")
                        .font(.caption.weight(.semibold))
                }
                Spacer()
                Button("Save") {
                    if let idx = viewModel.templates.firstIndex(where: { $0.id == template.id }) {
                        viewModel.templates[idx] = template
                    } else {
                        viewModel.templates.append(template)
                    }
                    viewModel.saveTemplates()
                    viewModel.route = .templates
                }
                .font(.caption.weight(.bold))
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)

            TextField("Title", text: $template.title)
                .padding(8)
                .background(Color(UIColor.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
                .padding(.horizontal, 12)

            TextEditor(text: $template.body)
                .frame(minHeight: 80)
                .padding(8)
                .background(Color(UIColor.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
                .padding(.horizontal, 12)

            Spacer()
        }
    }
}
