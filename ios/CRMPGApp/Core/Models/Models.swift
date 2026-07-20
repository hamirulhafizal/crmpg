import Foundation

struct Profile: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var fullName: String?
    var avatarURL: String?
    var role: String
    var pgcode: String?
    var phone: String?
    var usernamePbo: String?
    var timezone: String?
    var locale: String?
    var createdAt: Date?
    var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case fullName = "full_name"
        case avatarURL = "avatar_url"
        case role
        case pgcode
        case phone
        case usernamePbo = "username_pbo"
        case timezone
        case locale
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    init(
        id: UUID,
        fullName: String? = nil,
        avatarURL: String? = nil,
        role: String = "user",
        pgcode: String? = nil,
        phone: String? = nil,
        usernamePbo: String? = nil,
        timezone: String? = nil,
        locale: String? = nil,
        createdAt: Date? = nil,
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.fullName = fullName
        self.avatarURL = avatarURL
        self.role = role
        self.pgcode = pgcode
        self.phone = phone
        self.usernamePbo = usernamePbo
        self.timezone = timezone
        self.locale = locale
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        fullName = try container.decodeIfPresent(String.self, forKey: .fullName)
        avatarURL = try container.decodeIfPresent(String.self, forKey: .avatarURL)
        role = try container.decodeIfPresent(String.self, forKey: .role) ?? "user"
        pgcode = try container.decodeIfPresent(String.self, forKey: .pgcode)
        phone = try container.decodeIfPresent(String.self, forKey: .phone)
        usernamePbo = try container.decodeIfPresent(String.self, forKey: .usernamePbo)
        timezone = try container.decodeIfPresent(String.self, forKey: .timezone)
        locale = try container.decodeIfPresent(String.self, forKey: .locale)
        createdAt = JSONDate.decode(container, forKey: .createdAt)
        updatedAt = JSONDate.decode(container, forKey: .updatedAt)
    }

    static func placeholder(userId: UUID, email: String?) -> Profile {
        Profile(id: userId, fullName: email, role: "user")
    }

    var displayName: String {
        if let fullName, !fullName.isEmpty { return fullName }
        if let usernamePbo, !usernamePbo.isEmpty { return usernamePbo }
        if let pgcode, !pgcode.isEmpty { return pgcode }
        return "Dealer"
    }

    var isProfileComplete: Bool {
        let hasName = !(fullName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        let hasPgCode = !(pgcode?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        let hasPhone = (phone?.filter(\.isNumber).count ?? 0) >= 8
        let hasPbo = !(usernamePbo?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        return hasName && hasPgCode && hasPhone && hasPbo
    }
}

struct Customer: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var userId: UUID?
    var name: String?
    var email: String?
    var phone: String?
    var location: String?
    var pgCode: String?
    var gender: String?
    var ethnicity: String?
    var age: Int?
    var prefix: String?
    var firstName: String?
    var senderName: String?
    var saveName: String?
    var dob: String?
    var isMarried: Bool?
    var isFriend: Bool?
    var lastPurchaseAt: Date?
    var isMonthlyBuyer: Bool?
    var salesJourneyStage: String?
    var originalData: [String: FlexibleJSONValue]?
    var createdAt: Date?
    var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case name
        case email
        case phone
        case location
        case pgCode = "pg_code"
        case gender
        case ethnicity
        case age
        case prefix
        case firstName = "first_name"
        case senderName = "sender_name"
        case saveName = "save_name"
        case dob
        case isMarried = "is_married"
        case isFriend = "is_friend"
        case lastPurchaseAt = "last_purchase_at"
        case isMonthlyBuyer = "is_monthly_buyer"
        case salesJourneyStage = "sales_journey_stage"
        case originalData = "original_data"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        userId = try container.decodeIfPresent(UUID.self, forKey: .userId)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        email = try container.decodeIfPresent(String.self, forKey: .email)
        phone = try container.decodeIfPresent(String.self, forKey: .phone)
        location = try container.decodeIfPresent(String.self, forKey: .location)
        pgCode = try container.decodeIfPresent(String.self, forKey: .pgCode)
        gender = try container.decodeIfPresent(String.self, forKey: .gender)
        ethnicity = try container.decodeIfPresent(String.self, forKey: .ethnicity)
        age = try container.decodeIfPresent(Int.self, forKey: .age)
        prefix = try container.decodeIfPresent(String.self, forKey: .prefix)
        firstName = try container.decodeIfPresent(String.self, forKey: .firstName)
        senderName = try container.decodeIfPresent(String.self, forKey: .senderName)
        saveName = try container.decodeIfPresent(String.self, forKey: .saveName)
        dob = try container.decodeIfPresent(String.self, forKey: .dob)
        isMarried = try container.decodeIfPresent(Bool.self, forKey: .isMarried)
        isFriend = try container.decodeIfPresent(Bool.self, forKey: .isFriend)
        lastPurchaseAt = JSONDate.decode(container, forKey: .lastPurchaseAt)
        isMonthlyBuyer = try container.decodeIfPresent(Bool.self, forKey: .isMonthlyBuyer)
        salesJourneyStage = try container.decodeIfPresent(String.self, forKey: .salesJourneyStage)
        if let flex = try? container.decodeIfPresent(FlexibleJSONValue.self, forKey: .originalData) {
            originalData = flex.dictionaryValue
        } else {
            originalData = try container.decodeIfPresent([String: FlexibleJSONValue].self, forKey: .originalData)
        }
        createdAt = JSONDate.decode(container, forKey: .createdAt)
        updatedAt = JSONDate.decode(container, forKey: .updatedAt)
    }

    var displayName: String {
        if let saveName, !saveName.isEmpty { return saveName }
        if let senderName, !senderName.isEmpty { return senderName }
        if let name, !name.isEmpty { return name }
        if let firstName, !firstName.isEmpty { return firstName }
        if let phone, !phone.isEmpty { return phone }
        return "Unknown customer"
    }

    var subtitle: String {
        [phone, email, pgCode, location]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .first ?? "No contact info"
    }

    var journeyKind: SalesJourney {
        SalesJourney(rawValue: salesJourneyStage ?? "") ?? .unknown
    }

    var journeyLabel: String { journeyKind.title }

    var accountStatus: AccountStatusKey {
        AccountStatus.compute(for: self)
    }

    var isProfileVerified: Bool {
        originalData?["Profile Verified"]?.truthy == true
    }

    var hasDirectDebit: Bool {
        originalData?["Direct Debit Subscription"]?.truthy == true
    }

    var lastPurchaseDisplay: String? {
        if let lastPurchaseAt {
            return CustomerDateFormat.medium.string(from: lastPurchaseAt)
        }
        if let raw = originalData?["Last Purchase Date"]?.stringValue, !raw.isEmpty {
            return raw
        }
        return nil
    }

    var dobDisplay: String? {
        guard let dob, !dob.isEmpty else { return nil }
        return dob
    }
}

enum FlexibleJSONValue: Codable, Hashable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: FlexibleJSONValue])
    case array([FlexibleJSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: FlexibleJSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([FlexibleJSONValue].self) {
            self = .array(value)
        } else {
            self = .null
        }
    }

    init(any value: Any?) {
        switch value {
        case nil:
            self = .null
        case let value as Bool:
            self = .bool(value)
        case let value as Int:
            self = .number(Double(value))
        case let value as Double:
            self = .number(value)
        case let value as NSNumber:
            self = .number(value.doubleValue)
        case let value as String:
            self = .string(value)
        case let value as [String: Any]:
            self = .object(value.mapValues { FlexibleJSONValue(any: $0) })
        case let value as [Any]:
            self = .array(value.map { FlexibleJSONValue(any: $0) })
        default:
            self = .null
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    var stringValue: String? {
        switch self {
        case .string(let value):
            return value
        case .number(let value):
            if value.rounded() == value {
                return String(Int(value))
            }
            return String(value)
        case .bool(let value):
            return value ? "Yes" : "No"
        case .object, .array, .null:
            return nil
        }
    }

    var truthy: Bool {
        switch self {
        case .bool(let value):
            return value
        case .string(let value):
            let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return ["yes", "true", "1", "y"].contains(normalized)
        case .number(let value):
            return value != 0
        case .object, .array, .null:
            return false
        }
    }

    var dictionaryValue: [String: FlexibleJSONValue]? {
        if case .object(let object) = self { return object }
        return nil
    }
}

enum CustomerDateFormat {
    static let medium: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()
}

struct CustomerDraft: Encodable, Sendable {
    var userId: UUID
    var name: String?
    var phone: String?
    var email: String?
    var location: String?
    var pgCode: String?
    var gender: String?
    var ethnicity: String?
    var senderName: String?
    var saveName: String?
    var dob: String?
    var isMarried: Bool?
    var isFriend: Bool?
    var salesJourneyStage: String?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case name, phone, email, location, gender, ethnicity, dob
        case pgCode = "pg_code"
        case senderName = "sender_name"
        case saveName = "save_name"
        case isMarried = "is_married"
        case isFriend = "is_friend"
        case salesJourneyStage = "sales_journey_stage"
    }
}

struct CustomerPatch: Encodable, Sendable {
    var name: String?
    var phone: String?
    var email: String?
    var location: String?
    var pgCode: String?
    var gender: String?
    var ethnicity: String?
    var senderName: String?
    var saveName: String?
    var dob: String?
    var isMarried: Bool?
    var isFriend: Bool?
    var salesJourneyStage: String?

    enum CodingKeys: String, CodingKey {
        case name, phone, email, location, gender, ethnicity, dob
        case pgCode = "pg_code"
        case senderName = "sender_name"
        case saveName = "save_name"
        case isMarried = "is_married"
        case isFriend = "is_friend"
        case salesJourneyStage = "sales_journey_stage"
    }
}

enum AccountStatusKey: String, CaseIterable, Identifiable, Hashable, Sendable {
    case active
    case inactive
    case freeze
    case free
    case temporary
    case unknown

    var id: String { rawValue }

    var title: String {
        switch self {
        case .temporary: "Temporary"
        case .active: "Active"
        case .inactive: "Inactive"
        case .freeze: "Freeze"
        case .free: "Free"
        case .unknown: "Unknown"
        }
    }

    var subtitle: String {
        switch self {
        case .temporary: "No PG code"
        case .active: "Buyer this month"
        case .inactive: "Recent buyer, not this month"
        case .freeze: "No sales 3–11 months"
        case .free: "No sales within a year"
        case .unknown: "Needs data"
        }
    }
}

enum AccountStatus {
    private static let oneYearMs: Double = 365 * 24 * 60 * 60 * 1000
    private static let threeMonthsMs: Double = 90 * 24 * 60 * 60 * 1000
    private static let thirtyDaysMs: Double = 30 * 24 * 60 * 60 * 1000
    private static let freezeRegistrationMinMs = Date(timeIntervalSince1970: 1_577_836_800).timeIntervalSince1970 * 1000 // 2020-01-01 UTC

    static func compute(for customer: Customer) -> AccountStatusKey {
        compute(
            pgCode: customer.pgCode,
            lastPurchaseAt: customer.lastPurchaseAt,
            isMonthlyBuyer: customer.isMonthlyBuyer,
            createdAt: customer.createdAt,
            originalData: customer.originalData
        )
    }

    static func compute(
        pgCode: String?,
        lastPurchaseAt: Date?,
        isMonthlyBuyer: Bool?,
        createdAt: Date?,
        originalData: [String: FlexibleJSONValue]?
    ) -> AccountStatusKey {
        let pg = normalizePgCode(pgCode, originalData: originalData)
        if pg.isEmpty {
            return .temporary
        }

        if let raw = originalData?["Last Purchase Date"]?.stringValue,
           raw.lowercased().contains("no sales transaction within a year") || raw.lowercased().contains("no sales") {
            return .free
        }

        guard let lastMs = lastPurchaseMs(lastPurchaseAt: lastPurchaseAt, originalData: originalData) else {
            if let createdAt {
                let regMs = createdAt.timeIntervalSince1970 * 1000
                if regMs >= freezeRegistrationMinMs {
                    return .freeze
                }
            }
            return .unknown
        }

        let now = Date().timeIntervalSince1970 * 1000
        if now - lastMs > oneYearMs { return .free }
        if now - lastMs > threeMonthsMs { return .freeze }

        let autoDebit = originalData?["Direct Debit Subscription"]?.truthy == true
        let inCurrentMonth = isCurrentMalaysiaMonth(ms: lastMs)

        if !inCurrentMonth {
            return autoDebit ? .active : .inactive
        }

        if lastMs > now - thirtyDaysMs || isMonthlyBuyer == true {
            return .active
        }
        return autoDebit ? .active : .inactive
    }

    private static func normalizePgCode(_ pgCode: String?, originalData: [String: FlexibleJSONValue]?) -> String {
        let candidates = [
            pgCode,
            originalData?["PG Code"]?.stringValue,
            originalData?["pg_code"]?.stringValue,
            originalData?["Pg Code"]?.stringValue,
        ]
        for candidate in candidates {
            guard let raw = candidate?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else { continue }
            let lower = raw.lowercased()
            if ["-", "—", "–", "n/a", "na", "none", "nil", ".", "--", "null"].contains(lower) {
                continue
            }
            return raw
        }
        return ""
    }

    private static func lastPurchaseMs(
        lastPurchaseAt: Date?,
        originalData: [String: FlexibleJSONValue]?
    ) -> Double? {
        if let date = lastPurchaseAt {
            return date.timeIntervalSince1970 * 1000
        }
        if let raw = originalData?["Last Purchase Date"]?.stringValue {
            return parseFlexibleDateMs(raw)
        }
        return nil
    }

    private static func isCurrentMalaysiaMonth(ms: Double) -> Bool {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Kuala_Lumpur") ?? .current
        let date = Date(timeIntervalSince1970: ms / 1000)
        let now = Date()
        return calendar.component(.year, from: date) == calendar.component(.year, from: now)
            && calendar.component(.month, from: date) == calendar.component(.month, from: now)
    }

    private static func parseFlexibleDateMs(_ raw: String) -> Double? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let patterns = ["yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy", "MM/dd/yyyy"]
        for pattern in patterns {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = pattern
            if let date = formatter.date(from: trimmed) {
                return date.timeIntervalSince1970 * 1000
            }
        }
        if let date = JSONDate.parse(trimmed) {
            return date.timeIntervalSince1970 * 1000
        }
        return nil
    }
}

struct CustomerStats: Hashable, Sendable {
    var total: Int = 0
    var byAccountStatus: [AccountStatusKey: Int] = [:]
    var byJourney: [SalesJourney: Int] = [:]

    init(
        total: Int = 0,
        byAccountStatus: [AccountStatusKey: Int] = [:],
        byJourney: [SalesJourney: Int] = [:]
    ) {
        self.total = total
        self.byAccountStatus = byAccountStatus
        self.byJourney = byJourney
    }

    func count(for status: AccountStatusKey) -> Int {
        byAccountStatus[status] ?? 0
    }

    func count(for journey: SalesJourney) -> Int {
        byJourney[journey] ?? 0
    }
}

struct CustomerListFilters: Equatable, Hashable, Sendable {
    var journey: SalesJourney?
    var accountStatus: AccountStatusKey?
    var gender: String?
    var ethnicity: String?
    var agePreset: AgePreset?
    var tagIds: Set<UUID> = []
    var friendsOnly = false
    var marriedOnly = false
    var sort: CustomerSort = .updatedDesc

    var isActive: Bool {
        journey != nil
            || accountStatus != nil
            || gender != nil
            || ethnicity != nil
            || agePreset != nil
            || !tagIds.isEmpty
            || friendsOnly
            || marriedOnly
            || sort != .updatedDesc
    }

    var activeCount: Int {
        var count = 0
        if journey != nil { count += 1 }
        if accountStatus != nil { count += 1 }
        if gender != nil { count += 1 }
        if ethnicity != nil { count += 1 }
        if agePreset != nil { count += 1 }
        if !tagIds.isEmpty { count += 1 }
        if friendsOnly { count += 1 }
        if marriedOnly { count += 1 }
        if sort != .updatedDesc { count += 1 }
        return count
    }

    mutating func clear() {
        self = CustomerListFilters()
    }
}

enum AgePreset: String, CaseIterable, Identifiable, Hashable, Sendable {
    case under19 = "0-18"
    case young = "19-26"
    case adult = "27-45"
    case senior = "46-100"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .under19: "0–18"
        case .young: "19–26"
        case .adult: "27–45"
        case .senior: "46+"
        }
    }

    var range: (min: Int, max: Int) {
        switch self {
        case .under19: (0, 18)
        case .young: (19, 26)
        case .adult: (27, 45)
        case .senior: (46, 120)
        }
    }
}

enum CustomerSort: String, CaseIterable, Identifiable, Hashable, Sendable {
    case updatedDesc
    case createdDesc
    case nameAsc
    case lastPurchaseDesc

    var id: String { rawValue }

    var title: String {
        switch self {
        case .updatedDesc: "Recently updated"
        case .createdDesc: "Newest"
        case .nameAsc: "Name A–Z"
        case .lastPurchaseDesc: "Last purchase"
        }
    }
}

struct Tag: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var label: String
    var slug: String?
    var categoryId: UUID?

    enum CodingKeys: String, CodingKey {
        case id, label, slug
        case categoryId = "category_id"
    }
}

struct CustomerTagAssignment: Codable, Identifiable, Hashable, Sendable {
    let assignmentId: UUID?
    let customerId: UUID
    let tagId: UUID
    var tag: Tag?

    var id: UUID { assignmentId ?? tagId }

    enum CodingKeys: String, CodingKey {
        case assignmentId = "id"
        case customerId = "customer_id"
        case tagId = "tag_id"
        case tag = "tags"
    }
}

struct ChatMessage: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let text: String
    let timestamp: Double?
    let fromMe: Bool

    var date: Date? {
        guard let timestamp else { return nil }
        return Date(timeIntervalSince1970: timestamp > 1e12 ? timestamp / 1000 : timestamp)
    }
}

struct ChatHistoryResponse: Codable, Sendable {
    let messages: [ChatMessage]?
    let data: [ChatMessage]?

    var items: [ChatMessage] { messages ?? data ?? [] }
}

enum SalesJourney: String, CaseIterable, Identifiable {
    case prospect
    case activeBuyer = "active_buyer"
    case warming
    case atRisk = "at_risk"
    case dormant
    case unknown

    var id: String { rawValue }

    var title: String {
        switch self {
        case .prospect: "Prospect"
        case .activeBuyer: "Active buyer"
        case .warming: "Warming"
        case .atRisk: "At risk"
        case .dormant: "Dormant"
        case .unknown: "Unknown"
        }
    }
}

struct SavedAccount: Codable, Identifiable, Hashable, Sendable {
    var id: UUID
    var email: String
    var displayName: String
    var pgcode: String?
    var avatarURL: String?
    /// Stored on this device only (Keychain) for one-tap account switch.
    var password: String?
    var refreshToken: String?
    var accessToken: String?
    var expiresAt: Date?
    var lastUsedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case email
        case displayName = "display_name"
        case pgcode
        case avatarURL = "avatar_url"
        case password
        case refreshToken = "refresh_token"
        case accessToken = "access_token"
        case expiresAt = "expires_at"
        case lastUsedAt = "last_used_at"
    }

    var pickerLabel: String {
        if let pgcode, !pgcode.isEmpty { return pgcode }
        return displayName
    }

    var initials: String {
        let source = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if source.isEmpty { return "?" }
        let parts = source.split(separator: " ").prefix(2)
        if parts.count >= 2 {
            return "\(parts[0].prefix(1))\(parts[1].prefix(1))".uppercased()
        }
        return String(source.prefix(2)).uppercased()
    }

    /// Enough to switch without prompting (password and/or refresh token).
    var hasSwitchCredentials: Bool {
        let hasPassword = !(password?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        let hasRefresh = !(refreshToken?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        return hasPassword || hasRefresh
    }
}

/// Lightweight subscription row from Supabase (Phase 1 dashboard).
struct SubscriptionSummary: Codable, Sendable {
    let status: String?
    let trialEndsAt: String?
    let currentPeriodEnd: String?
    let plan: SaasPlanPayload?

    enum CodingKeys: String, CodingKey {
        case status
        case trialEndsAt = "trial_ends_at"
        case currentPeriodEnd = "current_period_end"
        case plan
    }

    var planName: String {
        plan?.name ?? plan?.slug?.capitalized ?? "Free"
    }

    var isTrialing: Bool {
        (status ?? "").lowercased() == "trialing"
    }

    var isActive: Bool {
        let s = (status ?? "").lowercased()
        return s == "active" || s == "trialing"
    }

    var expiryBanner: String? {
        if isTrialing, let trialEndsAt, let date = JSONDate.parse(trialEndsAt) {
            let days = Calendar.current.dateComponents([.day], from: Date(), to: date).day ?? 0
            if days < 0 { return "Your trial has ended. Upgrade to keep writing to CRM." }
            if days <= 7 { return "Trial ends in \(days) day\(days == 1 ? "" : "s")." }
        }
        if let currentPeriodEnd, let date = JSONDate.parse(currentPeriodEnd) {
            let days = Calendar.current.dateComponents([.day], from: Date(), to: date).day ?? 0
            if days >= 0 && days <= 7 {
                return "Subscription renews/ends in \(days) day\(days == 1 ? "" : "s")."
            }
        }
        return nil
    }
}

struct SaasMeResponse: Codable, Sendable {
    let subscription: SaasSubscriptionPayload?
    let usage: SaasUsagePayload?
    let flags: SaasFlagsPayload?
    let entitlements: SaasEntitlementsPayload?
    let alerts: SaasAlertsPayload?

    var planName: String {
        if flags?.isPlatformAdmin == true { return "Admin" }
        if let slug = entitlements?.planSlug, !slug.isEmpty {
            return slug.capitalized
        }
        return subscription?.plan?.name ?? "Free"
    }

    var hasWriteAccess: Bool {
        entitlements?.hasPlatformWriteAccess ?? flags?.hasPlatformWriteAccess ?? false
    }

    var activeCampaignCount: Int {
        usage?.activeCampaigns ?? 0
    }

    var campaignLimit: Int? {
        entitlements?.maxActiveCampaigns
    }

    var toSummary: SubscriptionSummary {
        SubscriptionSummary(
            status: subscription?.status ?? entitlements.map { _ in flags?.isProActive == true ? "active" : "expired" },
            trialEndsAt: subscription?.trialEndsAt,
            currentPeriodEnd: subscription?.currentPeriodEnd,
            plan: subscription?.plan ?? SaasPlanPayload(name: planName, slug: entitlements?.planSlug)
        )
    }
}

struct SaasSubscriptionPayload: Codable, Sendable {
    let status: String?
    let trialEndsAt: String?
    let currentPeriodEnd: String?
    let plan: SaasPlanPayload?

    enum CodingKeys: String, CodingKey {
        case status
        case trialEndsAt = "trial_ends_at"
        case currentPeriodEnd = "current_period_end"
        case plan
    }
}

struct SaasPlanPayload: Codable, Sendable {
    let name: String?
    let slug: String?
}

struct SaasUsagePayload: Codable, Sendable {
    let activeCampaigns: Int?

    enum CodingKeys: String, CodingKey {
        case activeCampaigns = "active_campaigns"
    }
}

struct SaasFlagsPayload: Codable, Sendable {
    let isProActive: Bool?
    let hasPlatformWriteAccess: Bool?
    let isPlatformAdmin: Bool?

    enum CodingKeys: String, CodingKey {
        case isProActive = "is_pro_active"
        case hasPlatformWriteAccess = "has_platform_write_access"
        case isPlatformAdmin = "is_platform_admin"
    }
}

struct SaasEntitlementsPayload: Codable, Sendable {
    let planSlug: String?
    let hasPlatformWriteAccess: Bool?
    let maxActiveCampaigns: Int?
    let isProActive: Bool?
}

struct SaasAlertsPayload: Codable, Sendable {
    let daysUntilExpiry: Int?
    let whatsappProviderLabel: String?

    enum CodingKeys: String, CodingKey {
        case daysUntilExpiry = "days_until_expiry"
        case whatsappProviderLabel = "whatsapp_provider_label"
    }
}

struct MobileConfigResponse: Codable, Sendable {
    let ok: Bool
    let authMode: String?
    let minIosVersion: String?

    enum CodingKeys: String, CodingKey {
        case ok
        case authMode = "auth_mode"
        case minIosVersion = "min_ios_version"
    }
}

// MARK: - WhatsApp (Phase 5)

struct WhatsAppProviderInfo: Codable, Sendable {
    let provider: String?
    let wasenderAvailable: Bool?
    let isProActive: Bool?
    let serverId: String?
    let serverName: String?
    let serverBaseUrl: String?
    let assignedByAdmin: Bool?

    enum CodingKeys: String, CodingKey {
        case provider
        case wasenderAvailable = "wasender_available"
        case isProActive = "is_pro_active"
        case serverId = "server_id"
        case serverName = "server_name"
        case serverBaseUrl = "server_base_url"
        case assignedByAdmin = "assigned_by_admin"
    }

    var displayProvider: String {
        switch (provider ?? "").lowercased() {
        case "wasender": "Wasender"
        case "waha": "WAHA"
        default: provider?.capitalized ?? "WhatsApp"
        }
    }
}

struct WhatsAppSession: Codable, Identifiable, Hashable, Sendable {
    let name: String
    var status: String
    var provider: String?
    var externalSessionId: String?
    var me: WhatsAppSessionMe?

    var id: String { name }

    enum CodingKeys: String, CodingKey {
        case name, status, provider, me
        case externalSessionId = "externalSessionId"
    }

    init(
        name: String,
        status: String,
        provider: String? = nil,
        externalSessionId: String? = nil,
        me: WhatsAppSessionMe? = nil
    ) {
        self.name = name
        self.status = status
        self.provider = provider
        self.externalSessionId = externalSessionId
        self.me = me
    }

    var statusKind: WhatsAppSessionStatus {
        WhatsAppSessionStatus(raw: status)
    }

    var displayName: String {
        if let push = me?.pushName, !push.isEmpty { return push }
        return name
    }
}

/// Row from `waha_user_sessions` (Supabase fallback when Bearer API is unavailable).
struct WahaUserSessionRow: Decodable, Sendable {
    let sessionName: String
    let providerType: String?
    let lastKnownWahaStatus: String?
    let externalSessionId: String?

    enum CodingKeys: String, CodingKey {
        case sessionName = "session_name"
        case providerType = "provider_type"
        case lastKnownWahaStatus = "last_known_waha_status"
        case externalSessionId = "external_session_id"
    }

    func asSession() -> WhatsAppSession {
        WhatsAppSession(
            name: sessionName,
            status: lastKnownWahaStatus ?? "UNKNOWN",
            provider: providerType,
            externalSessionId: externalSessionId
        )
    }
}

struct WhatsAppSessionMe: Codable, Hashable, Sendable {
    let id: String?
    let pushName: String?
}

enum WhatsAppSessionStatus: Hashable {
    case working
    case scanQR
    case starting
    case stopped
    case failed
    case unknown(String)

    init(raw: String) {
        let value = raw.uppercased()
        if value.contains("WORKING") || value == "CONNECTED" {
            self = .working
        } else if value.contains("SCAN") || value.contains("QR") || value == "NEED_SCAN" {
            self = .scanQR
        } else if value.contains("START") {
            self = .starting
        } else if value.contains("STOP") || value.contains("CLOSE") {
            self = .stopped
        } else if value.contains("FAIL") || value.contains("ERROR") {
            self = .failed
        } else {
            self = .unknown(raw)
        }
    }

    var title: String {
        switch self {
        case .working: "Connected"
        case .scanQR: "Scan QR"
        case .starting: "Starting"
        case .stopped: "Stopped"
        case .failed: "Failed"
        case .unknown(let raw): raw.isEmpty ? "Unknown" : raw
        }
    }

    var systemImage: String {
        switch self {
        case .working: "checkmark.circle.fill"
        case .scanQR: "qrcode"
        case .starting: "arrow.triangle.2.circlepath"
        case .stopped: "pause.circle.fill"
        case .failed: "exclamationmark.triangle.fill"
        case .unknown: "questionmark.circle"
        }
    }

    var needsQR: Bool {
        switch self {
        case .scanQR, .starting: true
        default: false
        }
    }
}

struct WhatsAppSessionsResponse: Codable, Sendable {
    let sessions: [WhatsAppSession]?
    let error: String?
}

struct WhatsAppQRResponse: Codable, Sendable {
    let qrcode: String?
    let mimetype: String?
    let alreadyConnected: Bool?
    let message: String?
    let value: String?
    let error: String?
}

struct CreateWhatsAppSessionBody: Encodable, Sendable {
    let name: String
    let start: Bool
}

struct SendWhatsAppBody: Encodable, Sendable {
    let session: String
    let to: String
    let text: String
}

struct PairingCodeBody: Encodable, Sendable {
    let phoneNumber: String?

    enum CodingKeys: String, CodingKey {
        case phoneNumber
    }
}

struct PairingCodeResponse: Codable, Sendable {
    let code: String?
    let error: String?
}

// MARK: - Campaigns (Phase 6)

struct Campaign: Decodable, Identifiable, Hashable, Sendable {
    let id: UUID
    var name: String
    var description: String?
    var status: String
    var triggerType: String?
    var timezone: String?
    var dailySendLimit: Int?
    var cooldownDays: Int?
    var enrolledCount: Int?
    var sentCount: Int?
    var platformDefaultTier: String?
    var createdAt: Date?
    var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, name, description, status, timezone
        case triggerType = "trigger_type"
        case dailySendLimit = "daily_send_limit"
        case cooldownDays = "cooldown_days"
        case enrolledCount = "enrolled_count"
        case sentCount = "sent_count"
        case platformDefaultTier = "platform_default_tier"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "draft"
        triggerType = try container.decodeIfPresent(String.self, forKey: .triggerType)
        timezone = try container.decodeIfPresent(String.self, forKey: .timezone)
        dailySendLimit = try container.decodeIfPresent(Int.self, forKey: .dailySendLimit)
        cooldownDays = try container.decodeIfPresent(Int.self, forKey: .cooldownDays)
        enrolledCount = try container.decodeIfPresent(Int.self, forKey: .enrolledCount)
        sentCount = try container.decodeIfPresent(Int.self, forKey: .sentCount)
        platformDefaultTier = try container.decodeIfPresent(String.self, forKey: .platformDefaultTier)
        createdAt = JSONDate.decode(container, forKey: .createdAt)
        updatedAt = JSONDate.decode(container, forKey: .updatedAt)
    }

    func withStatus(_ newStatus: String) -> Campaign {
        var copy = self
        copy.status = newStatus
        return copy
    }

    var statusKind: CampaignStatusKind {
        CampaignStatusKind(raw: status)
    }

    var triggerLabel: String {
        switch (triggerType ?? "").lowercased() {
        case "birthday": "Birthday"
        case "last_purchase": "Last purchase"
        case "enrollment": "Enrollment"
        case "manual": "Manual"
        default: (triggerType ?? "Manual").capitalized
        }
    }
}

enum CampaignStatusKind: Hashable {
    case draft
    case active
    case paused
    case completed
    case archived
    case unknown(String)

    init(raw: String) {
        switch raw.lowercased() {
        case "draft": self = .draft
        case "active": self = .active
        case "paused": self = .paused
        case "completed": self = .completed
        case "archived": self = .archived
        default: self = .unknown(raw)
        }
    }

    var title: String {
        switch self {
        case .draft: "Draft"
        case .active: "Active"
        case .paused: "Paused"
        case .completed: "Completed"
        case .archived: "Archived"
        case .unknown(let raw): raw.isEmpty ? "Unknown" : raw.capitalized
        }
    }

    var systemImage: String {
        switch self {
        case .draft: "doc"
        case .active: "play.circle.fill"
        case .paused: "pause.circle.fill"
        case .completed: "checkmark.seal.fill"
        case .archived: "archivebox.fill"
        case .unknown: "questionmark.circle"
        }
    }
}

struct CampaignsListResponse: Decodable, Sendable {
    let data: [Campaign]?
    let error: String?

    var items: [Campaign] { data ?? [] }
}

struct CampaignDetailEnvelope: Decodable, Sendable {
    let data: CampaignDetailPayload?
    let error: String?
}

struct CampaignDetailPayload: Decodable, Sendable {
    var campaign: Campaign
    let steps: [CampaignStep]?
    let stats: CampaignStats?
    let recentLogs: [CampaignMessageLog]?
    let audience: CampaignAudienceSummary?

    enum CodingKeys: String, CodingKey {
        case campaign, steps, stats, audience
        case recentLogs = "recent_logs"
    }
}

struct CampaignStep: Decodable, Identifiable, Hashable, Sendable {
    let id: UUID
    var stepOrder: Int?
    var delayDays: Int?
    var sendTime: String?
    var messageTemplate: String?
    var isActive: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case stepOrder = "step_order"
        case delayDays = "delay_days"
        case sendTime = "send_time"
        case messageTemplate = "message_template"
        case isActive = "is_active"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        stepOrder = try container.decodeIfPresent(Int.self, forKey: .stepOrder)
        delayDays = try container.decodeIfPresent(Int.self, forKey: .delayDays)
        sendTime = try container.decodeIfPresent(String.self, forKey: .sendTime)
        messageTemplate = try container.decodeIfPresent(String.self, forKey: .messageTemplate)
        isActive = try container.decodeIfPresent(Bool.self, forKey: .isActive)
    }
}

struct CampaignStats: Decodable, Hashable, Sendable {
    let enrolled: Int?
    let sent: Int?
    let failed: Int?
    let completed: Int?

    var successRate: Double? {
        let s = sent ?? 0
        let f = failed ?? 0
        guard s + f > 0 else { return nil }
        return Double(s) / Double(s + f) * 100
    }
}

struct CampaignMessageLog: Decodable, Identifiable, Hashable, Sendable {
    let id: UUID
    var sendStatus: String?
    var sentAt: String?
    var errorMessage: String?
    var customerId: UUID?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case sendStatus = "send_status"
        case sentAt = "sent_at"
        case errorMessage = "error_message"
        case customerId = "customer_id"
        case createdAt = "created_at"
    }
}

struct CampaignAudienceSummary: Decodable, Hashable, Sendable {
    let criteriaLines: [String]?
    let eligible: CampaignEligibleAudience?
    let dueNow: CampaignDueAudience?

    enum CodingKeys: String, CodingKey {
        case criteriaLines = "criteria_lines"
        case eligible
        case dueNow = "due_now"
    }
}

struct CampaignEligibleAudience: Decodable, Hashable, Sendable {
    let matchingTotal: Int?
    let customersScanned: Int?

    enum CodingKeys: String, CodingKey {
        case matchingTotal = "matching_total"
        case customersScanned = "customers_scanned"
    }
}

struct CampaignDueAudience: Decodable, Hashable, Sendable {
    let total: Int?
}

struct CampaignStatusPatch: Encodable, Sendable {
    let status: String
}

struct CampaignPatchEnvelope: Decodable, Sendable {
    let data: Campaign?
    let error: String?
}

enum JSONDate {
    static func decode<K: CodingKey>(_ container: KeyedDecodingContainer<K>, forKey key: K) -> Date? {
        if let date = try? container.decodeIfPresent(Date.self, forKey: key) {
            return date
        }
        guard let raw = try? container.decodeIfPresent(String.self, forKey: key) else { return nil }
        return parse(raw)
    }

    static func parse(_ raw: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: raw) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: raw)
    }
}

// MARK: - Tools (Phase 7)

struct ProfilePatch: Encodable, Sendable {
    var fullName: String?
    var phone: String?
    var pgcode: String?
    var usernamePbo: String?
    var avatarURL: String?

    enum CodingKeys: String, CodingKey {
        case fullName = "full_name"
        case phone
        case pgcode
        case usernamePbo = "username_pbo"
        case avatarURL = "avatar_url"
    }
}

struct PgSyncJobRecord: Decodable, Identifiable, Hashable, Sendable {
    let id: UUID
    var workerJobId: String
    var status: String
    var pgCode: String?
    var queuePosition: Int?
    var errorMessage: String?
    var createdAt: Date?
    var updatedAt: Date?
    var completedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case workerJobId = "worker_job_id"
        case status
        case pgCode = "pg_code"
        case queuePosition = "queue_position"
        case errorMessage = "error_message"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case completedAt = "completed_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        workerJobId = try container.decode(String.self, forKey: .workerJobId)
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "queued"
        pgCode = try container.decodeIfPresent(String.self, forKey: .pgCode)
        queuePosition = try container.decodeIfPresent(Int.self, forKey: .queuePosition)
        errorMessage = try container.decodeIfPresent(String.self, forKey: .errorMessage)
        createdAt = JSONDate.decode(container, forKey: .createdAt)
        updatedAt = JSONDate.decode(container, forKey: .updatedAt)
        completedAt = JSONDate.decode(container, forKey: .completedAt)
    }

    var statusTitle: String {
        status.replacingOccurrences(of: "_", with: " ").capitalized
    }

    var isActive: Bool {
        switch status.lowercased() {
        case "completed", "failed", "cancelled": false
        default: true
        }
    }
}

struct PgSyncProgressPayload: Decodable, Hashable, Sendable {
    var pct: Double?
    var message: String?
    var phase: String?
    var inserted: Int?
    var updated: Int?
    var failed: Int?
    var currentRow: Int?
    var totalRows: Int?

    enum CodingKeys: String, CodingKey {
        case pct, message, phase, inserted, updated, failed
        case currentRow = "current_row"
        case totalRows = "total_rows"
    }
}

struct PgSyncActiveJob: Decodable, Hashable, Sendable {
    var id: String?
    var status: String?
    var pgCode: String?
    var queuePosition: Int?
    var error: String?
    var syncProgress: PgSyncProgressPayload?

    enum CodingKeys: String, CodingKey {
        case id, status, error
        case pgCode = "pg_code"
        case queuePosition = "queue_position"
        case syncProgress = "sync_progress"
    }

    init(
        id: String? = nil,
        status: String? = nil,
        pgCode: String? = nil,
        queuePosition: Int? = nil,
        error: String? = nil,
        syncProgress: PgSyncProgressPayload? = nil
    ) {
        self.id = id
        self.status = status
        self.pgCode = pgCode
        self.queuePosition = queuePosition
        self.error = error
        self.syncProgress = syncProgress
    }
}

struct PgSyncQueueInfo: Decodable, Hashable, Sendable {
    var position: Int?
    var length: Int?
    var message: String?
    var badgeLabel: String?
    var formHint: String?
    var myQueuePosition: Int?
    var readiness: String?

    enum CodingKeys: String, CodingKey {
        case position, length, message, readiness
        case badgeLabel = "badge_label"
        case formHint = "form_hint"
        case myQueuePosition = "my_queue_position"
    }

    var displayMessage: String? {
        if let formHint, !formHint.isEmpty { return formHint }
        if let badgeLabel, !badgeLabel.isEmpty { return badgeLabel }
        if let message, !message.isEmpty { return message }
        return nil
    }
}

struct PgSyncStatusResponse: Decodable, Sendable {
    var ok: Bool?
    var pgCode: String?
    var activeJobId: String?
    var activeJob: PgSyncActiveJob?
    var dbJob: PgSyncJobRecord?
    var queueInfo: PgSyncQueueInfo?
    var isMyTurn: Bool?
    var error: String?

    enum CodingKeys: String, CodingKey {
        case ok, error
        case pgCode = "pg_code"
        case activeJobId = "active_job_id"
        case activeJob = "active_job"
        case dbJob = "db_job"
        case queueInfo = "queue_info"
        case isMyTurn = "is_my_turn"
    }

    init(
        ok: Bool? = nil,
        pgCode: String? = nil,
        activeJobId: String? = nil,
        activeJob: PgSyncActiveJob? = nil,
        dbJob: PgSyncJobRecord? = nil,
        queueInfo: PgSyncQueueInfo? = nil,
        isMyTurn: Bool? = nil,
        error: String? = nil
    ) {
        self.ok = ok
        self.pgCode = pgCode
        self.activeJobId = activeJobId
        self.activeJob = activeJob
        self.dbJob = dbJob
        self.queueInfo = queueInfo
        self.isMyTurn = isMyTurn
        self.error = error
    }
}

struct PgSyncCreateJobBody: Encodable, Sendable {
    let pgPassword: String
    let crmpgPassword: String

    enum CodingKeys: String, CodingKey {
        case pgPassword = "pg_password"
        case crmpgPassword = "crmpg_password"
    }
}

struct PgSyncCreateJobResponse: Decodable, Sendable {
    var ok: Bool?
    var pgCode: String?
    var job: PgSyncCreatedJob?
    var error: String?

    enum CodingKeys: String, CodingKey {
        case ok, job, error
        case pgCode = "pg_code"
    }
}

struct PgSyncCreatedJob: Decodable, Sendable {
    var jobId: String?
    var status: String?
    var queuePosition: Int?
    var message: String?

    enum CodingKeys: String, CodingKey {
        case status, message
        case jobId = "job_id"
        case queuePosition = "queue_position"
    }
}

struct PgSyncTacBody: Encodable, Sendable {
    let tac: String
}

struct PgSyncTacResponse: Decodable, Sendable {
    var ok: Bool?
    var error: String?
    var message: String?
}

struct LuckyDrawPage: Decodable, Identifiable, Hashable, Sendable {
    let id: UUID
    var title: String
    var pageSlug: String
    var status: String
    var entryCount: Int?
    var createdAt: Date?
    var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, title, status
        case pageSlug = "page_slug"
        case entryCount = "entry_count"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Lucky Draw"
        pageSlug = try container.decodeIfPresent(String.self, forKey: .pageSlug) ?? "lucky-draw"
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "draft"
        entryCount = try container.decodeIfPresent(Int.self, forKey: .entryCount)
        createdAt = JSONDate.decode(container, forKey: .createdAt)
        updatedAt = JSONDate.decode(container, forKey: .updatedAt)
    }

    var statusTitle: String { status.capitalized }

    func publicURL(dealerSlug: String, apiBase: URL) -> URL? {
        let path = "/\(dealerSlug)/\(pageSlug)"
        return URL(string: path, relativeTo: apiBase)?.absoluteURL
    }
}

struct LuckyDrawListResponse: Decodable, Sendable {
    var data: [LuckyDrawPage]?
    var dealerSlug: String?
    var error: String?

    enum CodingKeys: String, CodingKey {
        case data, error
        case dealerSlug = "dealer_slug"
    }

    var pages: [LuckyDrawPage] { data ?? [] }
}

struct LuckyDrawDealerSettings: Decodable, Sendable {
    var dealerSlug: String

    enum CodingKeys: String, CodingKey {
        case dealerSlug = "dealer_slug"
    }
}
