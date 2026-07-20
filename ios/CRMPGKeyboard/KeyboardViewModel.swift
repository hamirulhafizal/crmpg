import Foundation
import Observation

enum KeyboardRoute: Equatable {
    case list
    case detail(KeyboardCustomer)
    case create
    case templates
    case editTemplate(KeyboardInsertTemplate)
}

@MainActor
@Observable
final class KeyboardViewModel {
    var route: KeyboardRoute = .list
    var searchText = ""
    var customers: [KeyboardCustomer] = []
    var isLoading = false
    var isSaving = false
    var errorMessage: String?
    var infoMessage: String?
    var hasFullAccess = false
    var dealerLabel = "Dealer"
    var templates: [KeyboardInsertTemplate] = KeyboardShared.loadTemplates()

    // Edit form
    var draft = KeyboardCustomer(
        id: UUID().uuidString,
        userId: nil,
        name: nil,
        email: nil,
        phone: nil,
        location: nil,
        pgCode: nil,
        gender: nil,
        ethnicity: nil,
        senderName: nil,
        saveName: nil,
        dob: nil,
        isMarried: false,
        isFriend: false,
        salesJourneyStage: "prospect",
        accountStatus: nil
    )

    private var searchTask: Task<Void, Never>?

    func bootstrap(hasFullAccess: Bool) {
        self.hasFullAccess = hasFullAccess
        // Prefer active session label so we never show the previous dealer after a switch.
        dealerLabel = KeyboardShared.loadSession()?.dealerLabel
            ?? KeyboardShared.loadCache()?.dealerLabel
            ?? "Dealer"
        templates = KeyboardShared.loadTemplates()
        customers = KeyboardShared.searchCache("")
        if hasFullAccess {
            Task { await refreshLive(query: searchText) }
        }
    }

    func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 280_000_000)
            guard !Task.isCancelled else { return }
            await performSearch()
        }
    }

    func performSearch() async {
        let query = searchText
        if hasFullAccess {
            await refreshLive(query: query)
        } else {
            customers = KeyboardShared.searchCache(query)
            dealerLabel = KeyboardShared.loadSession()?.dealerLabel
                ?? KeyboardShared.loadCache()?.dealerLabel
                ?? dealerLabel
        }
    }

    func refreshLive(query: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let session = KeyboardShared.loadSession()
        dealerLabel = session?.dealerLabel
            ?? KeyboardShared.loadCache()?.dealerLabel
            ?? dealerLabel

        do {
            let remote = try await KeyboardNetwork.searchCustomers(query: query)
            customers = remote
            if let session {
                KeyboardShared.saveCache(
                    KeyboardCustomerCache(
                        dealerId: session.userId,
                        dealerLabel: session.dealerLabel,
                        customers: query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            ? remote
                            : (KeyboardShared.loadCache()?.customers ?? remote),
                        updatedAt: Date()
                    )
                )
            }
        } catch {
            // Only fall back to cache when it matches the active session dealer.
            customers = KeyboardShared.searchCache(query)
            if customers.isEmpty {
                errorMessage = friendlyError(error)
            } else {
                errorMessage = nil
            }
        }
    }

    private func friendlyError(_ error: Error) -> String {
        let raw = error.localizedDescription
        if raw.contains("sales_journey_stage") {
            return "Customer sync needs an app update. Showing cached results if available."
        }
        if raw.contains("42703") {
            return "Could not refresh live customers. Showing cached results if available."
        }
        return raw
    }

    func openDetail(_ customer: KeyboardCustomer) {
        draft = customer
        route = .detail(customer)
        errorMessage = nil
        infoMessage = nil
    }

    func openCreate() {
        draft = KeyboardCustomer(
            id: UUID().uuidString,
            userId: KeyboardShared.loadSession()?.userId,
            name: nil,
            email: nil,
            phone: nil,
            location: nil,
            pgCode: nil,
            gender: nil,
            ethnicity: nil,
            senderName: nil,
            saveName: nil,
            dob: nil,
            isMarried: false,
            isFriend: false,
            salesJourneyStage: "prospect",
            accountStatus: nil
        )
        route = .create
        errorMessage = nil
    }

    func syncSaveName() {
        let sender = (draft.senderName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let pg = (draft.pgCode ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sender.isEmpty else { return }
        draft.saveName = pg.isEmpty ? sender : "\(sender) - \(pg)"
        draft.isFriend = true
        if (draft.name ?? "").isEmpty {
            draft.name = draft.saveName
        }
    }

    func saveDraft(isCreate: Bool) async -> Bool {
        let hasIdentity = !(draft.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !(draft.phone ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !(draft.senderName ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        guard hasIdentity else {
            errorMessage = "Enter at least a name or phone."
            return false
        }

        isSaving = true
        errorMessage = nil
        infoMessage = nil
        defer { isSaving = false }

        if hasFullAccess {
            do {
                let saved = isCreate
                    ? try await KeyboardNetwork.createCustomer(draft)
                    : try await KeyboardNetwork.updateCustomer(draft)
                draft = saved
                KeyboardShared.upsertCachedCustomer(saved)
                customers = KeyboardShared.searchCache(searchText)
                infoMessage = isCreate ? "Customer created." : "Saved."
                route = .detail(saved)
                return true
            } catch {
                errorMessage = error.localizedDescription
                return false
            }
        } else {
            KeyboardShared.upsertCachedCustomer(draft)
            KeyboardShared.enqueuePendingEdit(
                KeyboardPendingEdit(
                    id: draft.id,
                    isCreate: isCreate,
                    customer: draft,
                    createdAt: Date()
                )
            )
            customers = KeyboardShared.searchCache(searchText)
            infoMessage = "Saved offline — will sync when you open the CRM app."
            route = .detail(draft)
            return true
        }
    }

    func saveTemplates() {
        KeyboardShared.saveTemplates(templates)
        infoMessage = "Templates saved."
    }
}
