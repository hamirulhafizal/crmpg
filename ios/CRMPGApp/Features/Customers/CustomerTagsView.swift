import SwiftUI

@MainActor
@Observable
final class CustomerTagsViewModel {
    var allTags: [Tag] = []
    var selectedIds: Set<UUID> = []
    var isLoading = false
    var isSaving = false
    var errorMessage: String?

    private let customerId: UUID

    init(customerId: UUID, assigned: [CustomerTagAssignment]) {
        self.customerId = customerId
        selectedIds = Set(assigned.map(\.tagId))
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            allTags = try await SupabaseRepository.fetchAllTags()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggle(_ tag: Tag) {
        if selectedIds.contains(tag.id) {
            selectedIds.remove(tag.id)
        } else {
            selectedIds.insert(tag.id)
        }
    }

    func save() async -> [CustomerTagAssignment]? {
        guard let userId = SupabaseManager.shared.currentUser?.id else {
            errorMessage = "You must be signed in."
            return nil
        }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            try await SupabaseRepository.setCustomerTags(
                customerId: customerId,
                userId: userId,
                tagIds: Array(selectedIds)
            )
            return try await SupabaseRepository.fetchCustomerTags(customerId: customerId)
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }
}

struct CustomerTagsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: CustomerTagsViewModel
    let onSaved: ([CustomerTagAssignment]) -> Void

    init(customerId: UUID, assigned: [CustomerTagAssignment], onSaved: @escaping ([CustomerTagAssignment]) -> Void) {
        _viewModel = State(initialValue: CustomerTagsViewModel(customerId: customerId, assigned: assigned))
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.allTags.isEmpty {
                    LoadingView(message: "Loading tags…")
                } else if viewModel.allTags.isEmpty {
                    EmptyStateView(
                        icon: "tag",
                        title: "No tags available",
                        message: "Ask an admin to create tags in the web CRM."
                    )
                } else {
                    List(viewModel.allTags) { tag in
                        Button {
                            viewModel.toggle(tag)
                        } label: {
                            HStack {
                                Text(tag.label)
                                    .foregroundStyle(PGColors.primaryText)
                                Spacer()
                                if viewModel.selectedIds.contains(tag.id) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(PGColors.gold)
                                } else {
                                    Image(systemName: "circle")
                                        .foregroundStyle(PGColors.secondaryText)
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("CRM tags")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            if let refreshed = await viewModel.save() {
                                onSaved(refreshed)
                                dismiss()
                            }
                        }
                    }
                    .disabled(viewModel.isSaving)
                }
            }
            .task { await viewModel.load() }
            .overlay(alignment: .top) {
                if let error = viewModel.errorMessage {
                    ErrorBanner(message: error) { viewModel.errorMessage = nil }
                        .padding()
                }
            }
        }
    }
}
