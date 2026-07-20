import Foundation
import Supabase

enum SupabaseRepository {
    /// Returns nil when the profile row is missing (avoids `.single()` PGRST116).
    static func fetchProfile(userId: UUID) async throws -> Profile? {
        let rows: [Profile] = try await SupabaseManager.shared.client
            .from("profiles")
            .select()
            .eq("id", value: userId.uuidString)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    static func fetchCustomers(
        limit: Int = 200,
        search: String? = nil,
        filters: CustomerListFilters = CustomerListFilters()
    ) async throws -> [Customer] {
        guard let userId = SupabaseManager.shared.currentUser?.id else {
            return []
        }

        let client = SupabaseManager.shared.client
        let selectColumns = filters.tagIds.isEmpty
            ? "*"
            : "*, customer_tags!inner(tag_id)"

        var query = client
            .from("customers")
            .select(selectColumns)
            .eq("user_id", value: userId.uuidString)

        if !filters.tagIds.isEmpty {
            query = query.in("customer_tags.tag_id", values: filters.tagIds.map(\.uuidString))
        }

        if let search, !search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let q = search.trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: ",", with: " ")
                .replacingOccurrences(of: "%", with: "")
            query = query.or(
                "name.ilike.%\(q)%,phone.ilike.%\(q)%,email.ilike.%\(q)%,first_name.ilike.%\(q)%,pg_code.ilike.%\(q)%,sender_name.ilike.%\(q)%,save_name.ilike.%\(q)%"
            )
        }

        if let journey = filters.journey {
            query = query.eq("sales_journey_stage", value: journey.rawValue)
        }
        if let gender = filters.gender {
            query = query.eq("gender", value: gender)
        }
        if let ethnicity = filters.ethnicity {
            query = query.eq("ethnicity", value: ethnicity)
        }
        if let age = filters.agePreset {
            query = query
                .gte("age", value: age.range.min)
                .lte("age", value: age.range.max)
        }
        if filters.friendsOnly {
            query = query.eq("is_friend", value: true)
        }
        if filters.marriedOnly {
            query = query.eq("is_married", value: true)
        }

        // Fetch a wider window when account-status is filtered client-side.
        let fetchLimit = filters.accountStatus == nil ? limit : max(limit, 800)

        let ordered: PostgrestTransformBuilder
        switch filters.sort {
        case .updatedDesc:
            ordered = query.order("updated_at", ascending: false)
        case .createdDesc:
            ordered = query.order("created_at", ascending: false)
        case .nameAsc:
            ordered = query.order("name", ascending: true)
        case .lastPurchaseDesc:
            ordered = query.order("last_purchase_at", ascending: false)
        }

        var customers: [Customer] = try await ordered.limit(fetchLimit).execute().value

        // Joins can return duplicates when multiple tags match.
        if !filters.tagIds.isEmpty {
            var seen = Set<UUID>()
            customers = customers.filter { seen.insert($0.id).inserted }
        }

        if let status = filters.accountStatus {
            customers = customers.filter { $0.accountStatus == status }
            if customers.count > limit {
                customers = Array(customers.prefix(limit))
            }
        }

        return customers
    }

    static func fetchCustomer(id: UUID) async throws -> Customer? {
        guard let userId = SupabaseManager.shared.currentUser?.id else {
            return nil
        }
        let rows: [Customer] = try await SupabaseManager.shared.client
            .from("customers")
            .select()
            .eq("id", value: id.uuidString)
            .eq("user_id", value: userId.uuidString)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    static func fetchCustomerJourneyStats() async throws -> CustomerStats {
        var stats = CustomerStats()
        stats.total = try await fetchCustomerCount()

        await withTaskGroup(of: (SalesJourney, Int).self) { group in
            for journey in SalesJourney.allCases where journey != .unknown {
                group.addTask {
                    let count = (try? await fetchCustomerCount(journey: journey)) ?? 0
                    return (journey, count)
                }
            }
            for await (journey, count) in group {
                stats.byJourney[journey] = count
            }
        }

        let known = stats.byJourney.values.reduce(0, +)
        stats.byJourney[.unknown] = max(0, stats.total - known)
        return stats
    }

    /// Computes account-status buckets locally (same rules as web) for the signed-in dealer.
    /// Uses the same Customer decode path as the list (proven working), paged with range.
    static func fetchCustomerAccountStats() async throws -> CustomerStats {
        guard let userId = SupabaseManager.shared.currentUser?.id else {
            return CustomerStats()
        }

        var stats = CustomerStats()
        for key in AccountStatusKey.allCases {
            stats.byAccountStatus[key] = 0
        }

        let pageSize = 500
        var from = 0
        var decodedAnyPage = false

        while true {
            do {
                let rows: [Customer] = try await SupabaseManager.shared.client
                    .from("customers")
                    .select()
                    .eq("user_id", value: userId.uuidString)
                    .order("updated_at", ascending: false)
                    .range(from: from, to: from + pageSize - 1)
                    .execute()
                    .value

                if rows.isEmpty { break }
                decodedAnyPage = true

                for customer in rows {
                    let status = customer.accountStatus
                    stats.byAccountStatus[status, default: 0] += 1
                }

                stats.total += rows.count
                if rows.count < pageSize { break }
                from += pageSize
            } catch {
                // If Codable page fails, fall back to raw JSON for this window.
                let response = try await SupabaseManager.shared.client
                    .from("customers")
                    .select("pg_code, last_purchase_at, is_monthly_buyer, created_at, original_data")
                    .eq("user_id", value: userId.uuidString)
                    .order("updated_at", ascending: false)
                    .range(from: from, to: from + pageSize - 1)
                    .execute()

                let rows = parseStatusRows(from: response.data)
                if rows.isEmpty {
                    if !decodedAnyPage && from == 0 {
                        throw error
                    }
                    break
                }
                decodedAnyPage = true

                for row in rows {
                    let status = AccountStatus.compute(
                        pgCode: row.pgCode,
                        lastPurchaseAt: row.lastPurchaseAt,
                        isMonthlyBuyer: row.isMonthlyBuyer,
                        createdAt: row.createdAt,
                        originalData: row.originalData
                    )
                    stats.byAccountStatus[status, default: 0] += 1
                }

                stats.total += rows.count
                if rows.count < pageSize { break }
                from += pageSize
            }
        }

        if stats.total == 0 {
            stats.total = try await fetchCustomerCount()
        }

        return stats
    }

    private struct StatusRow {
        var pgCode: String?
        var lastPurchaseAt: Date?
        var isMonthlyBuyer: Bool?
        var salesJourneyStage: String?
        var createdAt: Date?
        var originalData: [String: FlexibleJSONValue]?
    }

    private static func parseStatusRows(from data: Data) -> [StatusRow] {
        guard
            let root = try? JSONSerialization.jsonObject(with: data),
            let array = root as? [[String: Any]]
        else {
            return []
        }

        return array.map { dict in
            var row = StatusRow()
            row.pgCode = dict["pg_code"] as? String
            row.isMonthlyBuyer = dict["is_monthly_buyer"] as? Bool
            row.salesJourneyStage = dict["sales_journey_stage"] as? String
            if let raw = dict["last_purchase_at"] as? String {
                row.lastPurchaseAt = JSONDate.parse(raw)
            }
            if let raw = dict["created_at"] as? String {
                row.createdAt = JSONDate.parse(raw)
            }
            if let original = dict["original_data"] as? [String: Any] {
                row.originalData = original.mapValues { FlexibleJSONValue(any: $0) }
            } else if let originalString = dict["original_data"] as? String,
                      let originalData = originalString.data(using: .utf8),
                      let original = try? JSONSerialization.jsonObject(with: originalData) as? [String: Any] {
                row.originalData = original.mapValues { FlexibleJSONValue(any: $0) }
            }
            return row
        }
    }

    /// Always scopes by the signed-in dealer. Do not rely on RLS alone —
    /// platform admins may have a broader SELECT policy and would otherwise see
    /// every customer in the database (~30k) instead of their own list.
    static func fetchCustomerCount(journey: SalesJourney? = nil) async throws -> Int {
        guard let userId = SupabaseManager.shared.currentUser?.id else {
            return 0
        }
        var query = SupabaseManager.shared.client
            .from("customers")
            .select("id", head: true, count: .exact)
            .eq("user_id", value: userId.uuidString)
        if let journey {
            query = query.eq("sales_journey_stage", value: journey.rawValue)
        }
        let response = try await query.execute()
        return response.count ?? 0
    }

    static func createCustomer(_ draft: CustomerDraft) async throws -> Customer {
        let rows: [Customer] = try await SupabaseManager.shared.client
            .from("customers")
            .insert(draft)
            .select()
            .execute()
            .value
        guard let created = rows.first else {
            throw RepositoryError.emptyResult
        }
        return created
    }

    static func updateCustomer(id: UUID, patch: CustomerPatch) async throws -> Customer {
        let rows: [Customer] = try await SupabaseManager.shared.client
            .from("customers")
            .update(patch)
            .eq("id", value: id.uuidString)
            .select()
            .execute()
            .value
        guard let updated = rows.first else {
            throw RepositoryError.emptyResult
        }
        return updated
    }

    static func deleteCustomer(id: UUID) async throws {
        try await SupabaseManager.shared.client
            .from("customers")
            .delete()
            .eq("id", value: id.uuidString)
            .execute()
    }

    static func fetchAllTags() async throws -> [Tag] {
        try await SupabaseManager.shared.client
            .from("tags")
            .select("id, label, slug, category_id")
            .order("sort_order", ascending: true)
            .execute()
            .value
    }

    static func fetchCustomerTags(customerId: UUID) async throws -> [CustomerTagAssignment] {
        try await SupabaseManager.shared.client
            .from("customer_tags")
            .select("id, customer_id, tag_id, tags(id, label, slug, category_id)")
            .eq("customer_id", value: customerId.uuidString)
            .execute()
            .value
    }

    static func setCustomerTags(customerId: UUID, userId: UUID, tagIds: [UUID]) async throws {
        let client = SupabaseManager.shared.client
        try await client
            .from("customer_tags")
            .delete()
            .eq("customer_id", value: customerId.uuidString)
            .execute()

        guard !tagIds.isEmpty else { return }

        struct Row: Encodable {
            let customer_id: UUID
            let tag_id: UUID
            let user_id: UUID
            let source: String
        }

        let rows = tagIds.map {
            Row(customer_id: customerId, tag_id: $0, user_id: userId, source: "manual")
        }
        try await client.from("customer_tags").insert(rows).execute()
    }

    /// Direct Supabase read (works before Bearer `/api/saas/me` is deployed to production).
    static func fetchSubscriptionSummary(userId: UUID) async throws -> SubscriptionSummary? {
        let rows: [SubscriptionSummary] = try await SupabaseManager.shared.client
            .from("saas_subscriptions")
            .select("status, trial_ends_at, current_period_end, plan:saas_plans(name, slug)")
            .eq("user_id", value: userId.uuidString)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    /// Fallback campaign list when Bearer `/api/campaigns` is not deployed yet.
    static func fetchCampaigns(userId: UUID) async throws -> [Campaign] {
        try await SupabaseManager.shared.client
            .from("campaigns")
            .select("id, name, description, status, trigger_type, timezone, daily_send_limit, cooldown_days, created_at, updated_at")
            .eq("user_id", value: userId.uuidString)
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    static func updateCampaignStatus(id: UUID, status: String) async throws {
        try await SupabaseManager.shared.client
            .from("campaigns")
            .update(["status": status])
            .eq("id", value: id.uuidString)
            .execute()
    }

    /// Fallback WhatsApp sessions when Bearer `/api/waha/sessions` is not deployed yet.
    static func fetchWhatsAppSessions(userId: UUID) async throws -> [WhatsAppSession] {
        let rows: [WahaUserSessionRow] = try await SupabaseManager.shared.client
            .from("waha_user_sessions")
            .select("session_name, provider_type, last_known_waha_status, external_session_id")
            .eq("user_id", value: userId.uuidString)
            .order("session_name", ascending: true)
            .execute()
            .value
        return rows.map { $0.asSession() }
    }

    static func updateProfile(userId: UUID, patch: ProfilePatch) async throws -> Profile {
        let rows: [Profile] = try await SupabaseManager.shared.client
            .from("profiles")
            .update(patch)
            .eq("id", value: userId.uuidString)
            .select()
            .execute()
            .value
        guard let updated = rows.first else {
            throw RepositoryError.emptyResult
        }
        return updated
    }

    static func fetchPgSyncJobs(userId: UUID, limit: Int = 10) async throws -> [PgSyncJobRecord] {
        try await SupabaseManager.shared.client
            .from("pg_sync_jobs")
            .select("id, worker_job_id, status, pg_code, queue_position, error_message, created_at, updated_at, completed_at")
            .eq("user_id", value: userId.uuidString)
            .order("created_at", ascending: false)
            .limit(limit)
            .execute()
            .value
    }

    static func fetchLuckyDrawPages(userId: UUID) async throws -> [LuckyDrawPage] {
        try await SupabaseManager.shared.client
            .from("lucky_draw_pages")
            .select("id, title, page_slug, status, created_at, updated_at")
            .eq("user_id", value: userId.uuidString)
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    static func fetchLuckyDrawEntryCount(pageId: UUID) async throws -> Int {
        let response = try await SupabaseManager.shared.client
            .from("lucky_draw_entries")
            .select("id", head: true, count: .exact)
            .eq("page_id", value: pageId.uuidString)
            .execute()
        return response.count ?? 0
    }

    static func fetchDealerSlug(userId: UUID) async throws -> String? {
        let rows: [LuckyDrawDealerSettings] = try await SupabaseManager.shared.client
            .from("lucky_draw_dealer_settings")
            .select("dealer_slug")
            .eq("user_id", value: userId.uuidString)
            .limit(1)
            .execute()
            .value
        return rows.first?.dealerSlug
    }
}

enum RepositoryError: LocalizedError {
    case emptyResult

    var errorDescription: String? {
        switch self {
        case .emptyResult:
            "No data returned from server."
        }
    }
}
