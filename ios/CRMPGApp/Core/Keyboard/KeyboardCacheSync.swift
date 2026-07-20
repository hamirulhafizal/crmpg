import Foundation

/// Publishes the signed-in dealer's customers + session into App Group for the keyboard.
enum KeyboardCacheSync {
    static let maxCachedCustomers = 400

    @MainActor
    static func publishSessionAndConfig(profile: Profile?) {
        guard let user = SupabaseManager.shared.currentUser,
              let session = SupabaseManager.shared.session
                ?? SupabaseManager.shared.client.auth.currentSession
        else {
            KeyboardShared.clearSession()
            return
        }

        let label: String = {
            if let pg = profile?.pgcode, !pg.isEmpty { return pg }
            if let name = profile?.displayName, !name.isEmpty { return name }
            return user.email ?? "Dealer"
        }()

        KeyboardShared.saveSupabaseConfig(
            url: AppConfig.supabaseURL.absoluteString,
            anonKey: AppConfig.supabaseAnonKey
        )
        KeyboardShared.saveSession(
            KeyboardSessionBridge(
                userId: user.id.uuidString,
                email: user.email,
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
                dealerLabel: label,
                updatedAt: Date()
            )
        )
        WidgetShared.setActiveDealerId(user.id.uuidString)
    }

    /// Wipe previous dealer customers and stamp the new active dealer label/session.
    @MainActor
    static func resetCacheForActiveDealer(profile: Profile?) {
        publishSessionAndConfig(profile: profile)
        guard let userId = SupabaseManager.shared.currentUser?.id.uuidString else {
            KeyboardShared.clearCache()
            return
        }
        let label = KeyboardShared.loadSession()?.dealerLabel ?? profile?.displayName ?? "Dealer"
        KeyboardShared.saveCache(
            KeyboardCustomerCache(
                dealerId: userId,
                dealerLabel: label,
                customers: [],
                updatedAt: Date()
            )
        )
    }

    /// Called after account switch: reset then reload customers for the new session.
    @MainActor
    static func switchToActiveDealer(profile: Profile?) async {
        resetCacheForActiveDealer(profile: profile)
        await refreshFromApp(profile: profile)
    }

    @MainActor
    static func publishCustomers(_ customers: [Customer], profile: Profile?) {
        publishSessionAndConfig(profile: profile)
        guard let userId = SupabaseManager.shared.currentUser?.id.uuidString else { return }

        let label = KeyboardShared.loadSession()?.dealerLabel ?? profile?.displayName ?? "Dealer"
        let mapped = customers.prefix(maxCachedCustomers).map { customer -> KeyboardCustomer in
            KeyboardCustomer(
                id: customer.id.uuidString,
                userId: customer.userId?.uuidString ?? userId,
                name: customer.name,
                email: customer.email,
                phone: customer.phone,
                location: customer.location,
                pgCode: customer.pgCode,
                gender: customer.gender,
                ethnicity: customer.ethnicity,
                senderName: customer.senderName,
                saveName: customer.saveName,
                dob: customer.dob,
                isMarried: customer.isMarried,
                isFriend: customer.isFriend,
                salesJourneyStage: customer.salesJourneyStage,
                accountStatus: customer.accountStatus.rawValue
            )
        }

        KeyboardShared.saveCache(
            KeyboardCustomerCache(
                dealerId: userId,
                dealerLabel: label,
                customers: Array(mapped),
                updatedAt: Date()
            )
        )
    }

    /// Full refresh for keyboard: session + up to N customers for the active dealer.
    @MainActor
    static func refreshFromApp(profile: Profile?) async {
        publishSessionAndConfig(profile: profile)
        guard let userId = SupabaseManager.shared.currentUser?.id.uuidString else {
            KeyboardShared.clearCache()
            return
        }

        // Drop stale cache from a previous dealer before fetching.
        if let existing = KeyboardShared.loadCache(), existing.dealerId != userId {
            resetCacheForActiveDealer(profile: profile)
        }

        if let customers = try? await SupabaseRepository.fetchCustomers(
            limit: maxCachedCustomers,
            search: nil,
            filters: CustomerListFilters()
        ) {
            publishCustomers(customers, profile: profile)
        }

        await flushPendingEdits()
    }

    @MainActor
    static func flushPendingEdits() async {
        let pending = KeyboardShared.loadPendingEdits()
        guard !pending.isEmpty else { return }
        let activeUserId = SupabaseManager.shared.currentUser?.id.uuidString

        var remaining: [KeyboardPendingEdit] = []
        for edit in pending {
            // Only flush edits that belong to the current dealer.
            if let activeUserId, let owner = edit.customer.userId, owner != activeUserId {
                remaining.append(edit)
                continue
            }
            do {
                if edit.isCreate {
                    guard let userId = SupabaseManager.shared.currentUser?.id else {
                        remaining.append(edit)
                        continue
                    }
                    let draft = CustomerDraft(
                        userId: userId,
                        name: edit.customer.name,
                        phone: edit.customer.phone,
                        email: edit.customer.email,
                        location: edit.customer.location,
                        pgCode: edit.customer.pgCode,
                        gender: edit.customer.gender,
                        ethnicity: edit.customer.ethnicity,
                        senderName: edit.customer.senderName,
                        saveName: edit.customer.saveName,
                        dob: edit.customer.dob,
                        isMarried: edit.customer.isMarried,
                        isFriend: edit.customer.isFriend,
                        salesJourneyStage: edit.customer.salesJourneyStage
                    )
                    _ = try await SupabaseRepository.createCustomer(draft)
                } else if let id = UUID(uuidString: edit.customer.id) {
                    let patch = CustomerPatch(
                        name: edit.customer.name,
                        phone: edit.customer.phone,
                        email: edit.customer.email,
                        location: edit.customer.location,
                        pgCode: edit.customer.pgCode,
                        gender: edit.customer.gender,
                        ethnicity: edit.customer.ethnicity,
                        senderName: edit.customer.senderName,
                        saveName: edit.customer.saveName,
                        dob: edit.customer.dob,
                        isMarried: edit.customer.isMarried,
                        isFriend: edit.customer.isFriend,
                        salesJourneyStage: edit.customer.salesJourneyStage
                    )
                    _ = try await SupabaseRepository.updateCustomer(id: id, patch: patch)
                }
            } catch {
                remaining.append(edit)
            }
        }

        if remaining.isEmpty {
            KeyboardShared.clearPendingEdits()
        } else {
            KeyboardShared.savePendingEdits(remaining)
        }

        if let customers = try? await SupabaseRepository.fetchCustomers(
            limit: maxCachedCustomers,
            search: nil,
            filters: CustomerListFilters()
        ) {
            publishCustomers(customers, profile: nil)
        }
    }
}
