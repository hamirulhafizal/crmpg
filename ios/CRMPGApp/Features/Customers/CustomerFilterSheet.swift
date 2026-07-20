import SwiftUI

struct CustomerFilterSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var draft: CustomerListFilters
    let tags: [Tag]
    let onApply: (CustomerListFilters) -> Void

    init(filters: CustomerListFilters, tags: [Tag], onApply: @escaping (CustomerListFilters) -> Void) {
        _draft = State(initialValue: filters)
        self.tags = tags
        self.onApply = onApply
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Account status") {
                    Picker("Status", selection: $draft.accountStatus) {
                        Text("Any").tag(Optional<AccountStatusKey>.none)
                        ForEach(AccountStatusKey.allCases) { status in
                            Text(status.title).tag(Optional(status))
                        }
                    }
                }

                Section("Demographics") {
                    Picker("Gender", selection: $draft.gender) {
                        Text("Any").tag(Optional<String>.none)
                        Text("Male").tag(Optional("Male"))
                        Text("Female").tag(Optional("Female"))
                    }
                    Picker("Ethnicity", selection: $draft.ethnicity) {
                        Text("Any").tag(Optional<String>.none)
                        Text("Malay").tag(Optional("Malay"))
                        Text("Chinese").tag(Optional("Chinese"))
                        Text("Indian").tag(Optional("Indian"))
                        Text("Other").tag(Optional("Other"))
                    }
                    Picker("Age", selection: $draft.agePreset) {
                        Text("Any").tag(Optional<AgePreset>.none)
                        ForEach(AgePreset.allCases) { preset in
                            Text(preset.title).tag(Optional(preset))
                        }
                    }
                }

                Section("Flags") {
                    Toggle("Friends only", isOn: $draft.friendsOnly)
                    Toggle("Married only", isOn: $draft.marriedOnly)
                }

                if !tags.isEmpty {
                    Section("Tags") {
                        ForEach(tags) { tag in
                            Button {
                                toggleTag(tag.id)
                            } label: {
                                HStack {
                                    Text(tag.label)
                                        .foregroundStyle(PGColors.primaryText)
                                    Spacer()
                                    if draft.tagIds.contains(tag.id) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundStyle(PGColors.goldDark)
                                    }
                                }
                            }
                        }
                    }
                }

                Section("Sort") {
                    Picker("Sort by", selection: $draft.sort) {
                        ForEach(CustomerSort.allCases) { sort in
                            Text(sort.title).tag(sort)
                        }
                    }
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Reset") {
                        draft.clear()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Apply") {
                        draft.journey = nil
                        onApply(draft)
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func toggleTag(_ id: UUID) {
        if draft.tagIds.contains(id) {
            draft.tagIds.remove(id)
        } else {
            draft.tagIds.insert(id)
        }
    }
}
