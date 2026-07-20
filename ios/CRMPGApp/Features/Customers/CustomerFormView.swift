import SwiftUI

enum CustomerFormMode {
    case create
    case edit(Customer)

    var title: String {
        switch self {
        case .create: "New customer"
        case .edit: "Edit customer"
        }
    }
}

@MainActor
@Observable
final class CustomerFormViewModel {
    var name = ""
    var senderName = ""
    var saveName = ""
    var phone = ""
    var email = ""
    var location = ""
    var pgCode = ""
    var gender = ""
    var ethnicity = ""
    var dob = ""
    var isMarried = false
    var isFriend = false
    var journey: SalesJourney = .prospect
    var isSaving = false
    var errorMessage: String?

    let mode: CustomerFormMode

    init(mode: CustomerFormMode) {
        self.mode = mode
        if case .edit(let customer) = mode {
            name = customer.name ?? ""
            senderName = customer.senderName ?? ""
            saveName = customer.saveName ?? ""
            phone = customer.phone ?? ""
            email = customer.email ?? ""
            location = customer.location ?? ""
            pgCode = customer.pgCode ?? ""
            gender = customer.gender ?? ""
            ethnicity = customer.ethnicity ?? ""
            dob = customer.dob ?? ""
            isMarried = customer.isMarried == true
            isFriend = customer.isFriend == true
            journey = SalesJourney(rawValue: customer.salesJourneyStage ?? "prospect") ?? .prospect
        }
    }

    func syncSaveName() {
        let sender = senderName.trimmingCharacters(in: .whitespacesAndNewlines)
        let pg = pgCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sender.isEmpty else { return }
        if pg.isEmpty {
            saveName = sender
        } else {
            saveName = "\(sender) - \(pg)"
        }
        isFriend = true
    }

    func save() async -> Customer? {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !phone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !senderName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            errorMessage = "Enter at least a name or phone number."
            return nil
        }

        guard let userId = SupabaseManager.shared.currentUser?.id else {
            errorMessage = "You must be signed in."
            return nil
        }

        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            switch mode {
            case .create:
                let draft = CustomerDraft(
                    userId: userId,
                    name: name.nilIfBlank,
                    phone: phone.nilIfBlank,
                    email: email.nilIfBlank,
                    location: location.nilIfBlank,
                    pgCode: pgCode.nilIfBlank,
                    gender: gender.nilIfBlank,
                    ethnicity: ethnicity.nilIfBlank,
                    senderName: senderName.nilIfBlank,
                    saveName: saveName.nilIfBlank,
                    dob: dob.nilIfBlank,
                    isMarried: isMarried,
                    isFriend: isFriend,
                    salesJourneyStage: journey.rawValue
                )
                return try await SupabaseRepository.createCustomer(draft)

            case .edit(let customer):
                let patch = CustomerPatch(
                    name: name.nilIfBlank,
                    phone: phone.nilIfBlank,
                    email: email.nilIfBlank,
                    location: location.nilIfBlank,
                    pgCode: pgCode.nilIfBlank,
                    gender: gender.nilIfBlank,
                    ethnicity: ethnicity.nilIfBlank,
                    senderName: senderName.nilIfBlank,
                    saveName: saveName.nilIfBlank,
                    dob: dob.nilIfBlank,
                    isMarried: isMarried,
                    isFriend: isFriend,
                    salesJourneyStage: journey.rawValue
                )
                return try await SupabaseRepository.updateCustomer(id: customer.id, patch: patch)
            }
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }
}

struct CustomerFormView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: CustomerFormViewModel
    let onSaved: (Customer) -> Void

    init(mode: CustomerFormMode, onSaved: @escaping (Customer) -> Void) {
        _viewModel = State(initialValue: CustomerFormViewModel(mode: mode))
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Messaging names") {
                    TextField("Sender name", text: $viewModel.senderName)
                        .onChange(of: viewModel.senderName) { _, _ in
                            viewModel.syncSaveName()
                        }
                    TextField("Save name", text: $viewModel.saveName)
                    Text("Save name updates when sender name or PG code changes.")
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.secondaryText)
                }

                Section("Contact") {
                    TextField("Full name", text: $viewModel.name)
                    TextField("Phone", text: $viewModel.phone)
                        .keyboardType(.phonePad)
                    TextField("Email", text: $viewModel.email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Location", text: $viewModel.location)
                    TextField("Date of birth (YYYY-MM-DD)", text: $viewModel.dob)
                        .keyboardType(.numbersAndPunctuation)
                }

                Section("CRM") {
                    Picker("Sales journey", selection: $viewModel.journey) {
                        ForEach(SalesJourney.allCases) { stage in
                            Text(stage.title).tag(stage)
                        }
                    }
                    TextField("PG code", text: $viewModel.pgCode)
                        .textInputAutocapitalization(.characters)
                        .onChange(of: viewModel.pgCode) { _, _ in
                            viewModel.syncSaveName()
                        }
                    Picker("Gender", selection: $viewModel.gender) {
                        Text("—").tag("")
                        Text("Male").tag("Male")
                        Text("Female").tag("Female")
                    }
                    Picker("Ethnicity", selection: $viewModel.ethnicity) {
                        Text("—").tag("")
                        Text("Malay").tag("Malay")
                        Text("Chinese").tag("Chinese")
                        Text("Indian").tag("Indian")
                        Text("Other").tag("Other")
                    }
                }

                Section("Flags") {
                    Toggle("Married", isOn: $viewModel.isMarried)
                    Toggle("Friend", isOn: $viewModel.isFriend)
                }

                if let error = viewModel.errorMessage {
                    Section {
                        ErrorBanner(message: error) {
                            viewModel.errorMessage = nil
                        }
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                    }
                }
            }
            .navigationTitle(viewModel.mode.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            if let saved = await viewModel.save() {
                                onSaved(saved)
                                dismiss()
                            }
                        }
                    }
                    .disabled(viewModel.isSaving)
                }
            }
            .overlay {
                if viewModel.isSaving {
                    ProgressView("Saving…")
                        .padding()
                        .background(.ultraThinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
