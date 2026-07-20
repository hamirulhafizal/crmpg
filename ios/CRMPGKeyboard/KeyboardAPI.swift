import Foundation

/// Live Supabase REST helpers for the keyboard (requires Full Access).
enum KeyboardAPI {
    struct Config {
        let supabaseURL: URL
        let anonKey: String
    }

    static var config: Config? {
        guard
            let urlString = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let url = URL(string: urlString),
            !urlString.contains("$("),
            let anon = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
            !anon.isEmpty,
            !anon.contains("$(")
        else { return nil }
        return Config(supabaseURL: url, anonKey: anon)
    }

    static func searchLive(query: String, session: KeyboardShared.SessionSnapshot) async throws -> [KeyboardCustomer] {
        guard let config else { throw KeyboardAPIError.notConfigured }
        var components = URLComponents(
            url: config.supabaseURL.appendingPathComponent("rest/v1/customers"),
            resolvingAgainstBaseURL: false
        )!
        var items: [URLQueryItem] = [
            URLQueryItem(name: "select", value: "id,name,phone,email,location,pg_code,gender,ethnicity,sender_name,save_name,dob,is_married,is_friend,sales_journey_stage"),
            URLQueryItem(name: "user_id", value: "eq.\(session.userId)"),
            URLQueryItem(name: "order", value: "updated_at.desc"),
            URLQueryItem(name: "limit", value: "60"),
        ]
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !q.isEmpty {
            let escaped = q.replacingOccurrences(of: ",", with: " ")
            items.append(
                URLQueryItem(
                    name: "or",
                    value: "(name.ilike.*\(escaped)*,phone.ilike.*\(escaped)*,email.ilike.*\(escaped)*,pg_code.ilike.*\(escaped)*,sender_name.ilike.*\(escaped)*,save_name.ilike.*\(escaped)*)"
                )
            )
        }
        components.queryItems = items
        let rows: [RemoteCustomer] = try await get(url: components.url!, session: session, config: config)
        return rows.map(\.asKeyboardCustomer)
    }

    static func create(_ customer: KeyboardCustomer, session: KeyboardShared.SessionSnapshot) async throws -> KeyboardCustomer {
        guard let config else { throw KeyboardAPIError.notConfigured }
        let url = config.supabaseURL.appendingPathComponent("rest/v1/customers")
        let body = CreateBody(from: customer, userId: session.userId)
        let rows: [RemoteCustomer] = try await mutate(
            url: url,
            method: "POST",
            session: session,
            config: config,
            body: body
        )
        guard let first = rows.first else { throw KeyboardAPIError.empty }
        return first.asKeyboardCustomer
    }

    static func update(_ customer: KeyboardCustomer, session: KeyboardShared.SessionSnapshot) async throws -> KeyboardCustomer {
        guard let config else { throw KeyboardAPIError.notConfigured }
        var components = URLComponents(
            url: config.supabaseURL.appendingPathComponent("rest/v1/customers"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [URLQueryItem(name: "id", value: "eq.\(customer.id)")]
        let body = UpdateBody(from: customer)
        let rows: [RemoteCustomer] = try await mutate(
            url: components.url!,
            method: "PATCH",
            session: session,
            config: config,
            body: body
        )
        guard let first = rows.first else { throw KeyboardAPIError.empty }
        return first.asKeyboardCustomer
    }

    private static func get<T: Decodable>(
        url: URL,
        session: KeyboardShared.SessionSnapshot,
        config: Config
    ) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        applyHeaders(to: &request, session: session, config: config)
        return try await decode(request)
    }

    private static func mutate<T: Decodable, B: Encodable>(
        url: URL,
        method: String,
        session: KeyboardShared.SessionSnapshot,
        config: Config,
        body: B
    ) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = method
        applyHeaders(to: &request, session: session, config: config)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(body)
        return try await decode(request)
    }

    private static func applyHeaders(
        to request: inout URLRequest,
        session: KeyboardShared.SessionSnapshot,
        config: Config
    ) {
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(config.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
    }

    private static func decode<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ... 299).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Request failed"
            throw KeyboardAPIError.server(message)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

enum KeyboardAPIError: LocalizedError {
    case notConfigured
    case empty
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: "Supabase is not configured for the keyboard."
        case .empty: "No data returned."
        case .server(let message): message
        }
    }
}

private struct RemoteCustomer: Decodable {
    var id: UUID
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
        case id, name, phone, email, location, gender, ethnicity, dob
        case pgCode = "pg_code"
        case senderName = "sender_name"
        case saveName = "save_name"
        case isMarried = "is_married"
        case isFriend = "is_friend"
        case salesJourneyStage = "sales_journey_stage"
    }

    var asKeyboardCustomer: KeyboardCustomer {
        KeyboardCustomer(
            id: id.uuidString,
            name: name,
            phone: phone,
            email: email,
            location: location,
            pgCode: pgCode,
            gender: gender,
            ethnicity: ethnicity,
            senderName: senderName,
            saveName: saveName,
            dob: dob,
            isMarried: isMarried,
            isFriend: isFriend,
            salesJourneyStage: salesJourneyStage,
            statusTitle: nil
        )
    }
}

private struct CreateBody: Encodable {
    var user_id: String
    var name: String?
    var phone: String?
    var email: String?
    var location: String?
    var pg_code: String?
    var gender: String?
    var ethnicity: String?
    var sender_name: String?
    var save_name: String?
    var dob: String?
    var is_married: Bool?
    var is_friend: Bool?
    var sales_journey_stage: String?

    init(from customer: KeyboardCustomer, userId: String) {
        user_id = userId
        name = customer.name
        phone = customer.phone
        email = customer.email
        location = customer.location
        pg_code = customer.pgCode
        gender = customer.gender
        ethnicity = customer.ethnicity
        sender_name = customer.senderName
        save_name = customer.saveName
        dob = customer.dob
        is_married = customer.isMarried
        is_friend = customer.isFriend
        sales_journey_stage = customer.salesJourneyStage
    }
}

private struct UpdateBody: Encodable {
    var name: String?
    var phone: String?
    var email: String?
    var location: String?
    var pg_code: String?
    var gender: String?
    var ethnicity: String?
    var sender_name: String?
    var save_name: String?
    var dob: String?
    var is_married: Bool?
    var is_friend: Bool?
    var sales_journey_stage: String?

    init(from customer: KeyboardCustomer) {
        name = customer.name
        phone = customer.phone
        email = customer.email
        location = customer.location
        pg_code = customer.pgCode
        gender = customer.gender
        ethnicity = customer.ethnicity
        sender_name = customer.senderName
        save_name = customer.saveName
        dob = customer.dob
        is_married = customer.isMarried
        is_friend = customer.isFriend
        sales_journey_stage = customer.salesJourneyStage
    }
}
