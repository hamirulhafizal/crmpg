import Foundation

/// Keeps the custom keyboard cache + session in sync with the signed-in dealer.
enum KeyboardCacheSync {
    @MainActor
    static func publishSession(profile: Profile?) {
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

        KeyboardShared.saveSession(
            KeyboardShared.SessionSnapshot(
                userId: user.id.uuidString,
                email: user.email,
                dealerLabel: label,
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
                updatedAt: Date()
            )
        )
    }

    @MainActor
    static func publishCustomers(_ customers: [Customer]) {
        let mapped = customers.map { customer -> KeyboardCustomer in
            KeyboardCustomer(
                id: customer.id.uuidString,
                name: customer.name,
                phone: customer.phone,
                email: customer.email,
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
                statusTitle: customer.accountStatus.title
            )
        }
        KeyboardShared.saveCustomers(mapped)
    }

    @MainActor
    static func refreshFromApp(profile: Profile?) async {
        publishSession(profile: profile)
        guard SupabaseManager.shared.currentUser != nil else {
            KeyboardShared.saveCustomers([])
            return
        }
        if let customers = try? await SupabaseRepository.fetchCustomers(limit: KeyboardShared.maxCachedCustomers, search: nil, filters: CustomerListFilters()) {
            publishCustomers(customers)
        }
        await flushPendingEdits()
    }

    @MainActor
    static func flushPendingEdits() async {
        let pending = KeyboardShared.loadPending()
        guard !pending.isEmpty, let userId = SupabaseManager.shared.currentUser?.id else { return }

        var remaining: [PendingCustomerEdit] = []
        for edit in pending {
            do {
                switch edit.kind {
                case .create:
                    let draft = CustomerDraft(
                        userId: userId,
                        name: edit.payload.name,
                        phone: edit.payload.phone,
                        email: edit.payload.email,
                        location: edit.payload.location,
                        pgCode: edit.payload.pgCode,
                        gender: edit.payload.gender,
                        ethnicity: edit.payload.ethnicity,
                        senderName: edit.payload.senderName,
                        saveName: edit.payload.saveName,
                        dob: edit.payload.dob,
                        isMarried: edit.payload.isMarried,
                        isFriend: edit.payload.isFriend,
                        salesJourneyStage: edit.payload.salesJourneyStage
                    )
                    let created = try await SupabaseRepository.createCustomer(draft)
                    KeyboardShared.upsertCustomer(
                        KeyboardCustomer(
                            id: created.id.uuidString,
                            name: created.name,
                            phone: created.phone,
                            email: created.email,
                            location: created.location,
                            pgCode: created.pgCode,
                            gender: created.gender,
                            ethnicity: created.ethnicity,
                            senderName: created.senderName,
                            saveName: created.saveName,
                            dob: created.dob,
                            isMarried: created.isMarried,
                            isFriend: created.isFriend,
                            salesJourneyStage: created.salesJourneyStage,
                            statusTitle: created.accountStatus.title
                        )
                    )
                case .update:
                    guard let id = edit.customerId.flatMap(UUID.init(uuidString:)) else {
                        remaining.append(edit)
                        continue
                    }
                    let patch = CustomerPatch(
                        name: edit.payload.name,
                        phone: edit.payload.phone,
                        email: edit.payload.email,
                        location: edit.payload.location,
                        pgCode: edit.payload.pgCode,
                        gender: edit.payload.gender,
                        ethnicity: edit.payload.ethnicity,
                        senderName: edit.payload.senderName,
                        saveName: edit.payload.saveName,
                        dob: edit.payload.dob,
                        isMarried: edit.payload.isMarried,
                        isFriend: edit.payload.isFriend,
                        salesJourneyStage: edit.payload.salesJourneyStage
                    )
                    let updated = try await SupabaseRepository.updateCustomer(id: id, patch: patch)
                    KeyboardShared.upsertCustomer(
                        KeyboardCustomer(
                            id: updated.id.uuidString,
                            name: updated.name,
                            phone: updated.phone,
                            email: updated.email,
                            location: updated.location,
                            pgCode: updated.pgCode,
                            gender: updated.gender,
                            ethnicity: updated.ethnicity,
                            senderName: updated.senderName,
                            saveName: updated.saveName,
                            dob: updated.dob,
                            isMarried: updated.isMarried,
                            isFriend: updated.isFriend,
                            salesJourneyStage: updated.salesJourneyStage,
                            statusTitle: updated.accountStatus.title
                        )
                    )
                }
            } catch {
                remaining.append(edit)
            }
        }

        if remaining.isEmpty {
            KeyboardShared.clearPending()
        } else {
            KeyboardShared.replacePending(remaining)
        }
    }
}
