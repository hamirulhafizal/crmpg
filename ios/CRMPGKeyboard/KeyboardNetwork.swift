import Foundation

/// Lightweight PostgREST client for the keyboard (Full Access only).
enum KeyboardNetwork {
    enum NetworkError: LocalizedError {
        case noFullAccessConfig
        case http(Int, String?)
        case decode

        var errorDescription: String? {
            switch self {
            case .noFullAccessConfig: "Sign in to the CRM app and enable Full Access for the keyboard."
            case .http(let code, let message): message ?? "Server error (\(code))"
            case .decode: "Could not read server response."
            }
        }
    }

    static func searchCustomers(query: String, limit: Int = 40) async throws -> [KeyboardCustomer] {
        let session = try requireSession()
        let config = try requireConfig()
        var components = URLComponents(string: config.url.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/rest/v1/customers")!
        var items: [URLQueryItem] = [
            URLQueryItem(name: "select", value: "id,user_id,name,email,phone,location,pg_code,gender,ethnicity,sender_name,save_name,dob,is_married,is_friend"),
            URLQueryItem(name: "user_id", value: "eq.\(session.userId)"),
            URLQueryItem(name: "order", value: "updated_at.desc.nullslast"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !q.isEmpty {
            let escaped = q.replacingOccurrences(of: ",", with: " ")
            items.append(
                URLQueryItem(
                    name: "or",
                    value: "(name.ilike.*\(escaped)*,phone.ilike.*\(escaped)*,pg_code.ilike.*\(escaped)*,email.ilike.*\(escaped)*,sender_name.ilike.*\(escaped)*,save_name.ilike.*\(escaped)*)"
                )
            )
        }
        components.queryItems = items
        guard let url = components.url else { throw NetworkError.noFullAccessConfig }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        applyAuth(&request, config: config, accessToken: session.accessToken)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response, data: data)
        let rows = try JSONDecoder().decode([RemoteCustomerRow].self, from: data)
        return rows.map(\.asKeyboardCustomer)
    }

    static func createCustomer(_ customer: KeyboardCustomer) async throws -> KeyboardCustomer {
        let session = try requireSession()
        let config = try requireConfig()
        guard let url = URL(string: config.url.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/rest/v1/customers") else {
            throw NetworkError.noFullAccessConfig
        }

        var body: [String: Any] = [
            "user_id": session.userId,
        ]
        assignOptional(&body, "name", customer.name)
        assignOptional(&body, "phone", customer.phone)
        assignOptional(&body, "email", customer.email)
        assignOptional(&body, "location", customer.location)
        assignOptional(&body, "pg_code", customer.pgCode)
        assignOptional(&body, "gender", customer.gender)
        assignOptional(&body, "ethnicity", customer.ethnicity)
        assignOptional(&body, "sender_name", customer.senderName)
        assignOptional(&body, "save_name", customer.saveName)
        assignOptional(&body, "dob", customer.dob)
        if let isMarried = customer.isMarried { body["is_married"] = isMarried }
        if let isFriend = customer.isFriend { body["is_friend"] = isFriend }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        applyAuth(&request, config: config, accessToken: session.accessToken)
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response, data: data)
        let rows = try JSONDecoder().decode([RemoteCustomerRow].self, from: data)
        guard let first = rows.first else { throw NetworkError.decode }
        return first.asKeyboardCustomer
    }

    static func updateCustomer(_ customer: KeyboardCustomer) async throws -> KeyboardCustomer {
        let session = try requireSession()
        let config = try requireConfig()
        guard let url = URL(string: config.url.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/rest/v1/customers?id=eq.\(customer.id)") else {
            throw NetworkError.noFullAccessConfig
        }

        var body: [String: Any] = [:]
        assignOptional(&body, "name", customer.name)
        assignOptional(&body, "phone", customer.phone)
        assignOptional(&body, "email", customer.email)
        assignOptional(&body, "location", customer.location)
        assignOptional(&body, "pg_code", customer.pgCode)
        assignOptional(&body, "gender", customer.gender)
        assignOptional(&body, "ethnicity", customer.ethnicity)
        assignOptional(&body, "sender_name", customer.senderName)
        assignOptional(&body, "save_name", customer.saveName)
        assignOptional(&body, "dob", customer.dob)
        if let isMarried = customer.isMarried { body["is_married"] = isMarried }
        if let isFriend = customer.isFriend { body["is_friend"] = isFriend }

        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        applyAuth(&request, config: config, accessToken: session.accessToken)
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response, data: data)
        let rows = try JSONDecoder().decode([RemoteCustomerRow].self, from: data)
        guard let first = rows.first else { throw NetworkError.decode }
        return first.asKeyboardCustomer
    }

    private static func requireSession() throws -> KeyboardSessionBridge {
        guard let session = KeyboardShared.loadSession() else { throw NetworkError.noFullAccessConfig }
        return session
    }

    private static func requireConfig() throws -> KeyboardSupabaseConfig {
        guard let config = KeyboardShared.loadSupabaseConfig() else { throw NetworkError.noFullAccessConfig }
        return config
    }

    private static func applyAuth(_ request: inout URLRequest, config: KeyboardSupabaseConfig, accessToken: String) {
        request.setValue(config.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
    }

    private static func validate(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw NetworkError.http(-1, nil) }
        guard (200 ... 299).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8)
            throw NetworkError.http(http.statusCode, message)
        }
    }

    private static func assignOptional(_ body: inout [String: Any], _ key: String, _ value: String?) {
        if let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            body[key] = value
        }
    }
}

private struct RemoteCustomerRow: Decodable {
    let id: UUID
    let user_id: UUID?
    let name: String?
    let email: String?
    let phone: String?
    let location: String?
    let pg_code: String?
    let gender: String?
    let ethnicity: String?
    let sender_name: String?
    let save_name: String?
    let dob: String?
    let is_married: Bool?
    let is_friend: Bool?

    var asKeyboardCustomer: KeyboardCustomer {
        KeyboardCustomer(
            id: id.uuidString,
            userId: user_id?.uuidString,
            name: name,
            email: email,
            phone: phone,
            location: location,
            pgCode: pg_code,
            gender: gender,
            ethnicity: ethnicity,
            senderName: sender_name,
            saveName: save_name,
            dob: dob,
            isMarried: is_married,
            isFriend: is_friend,
            salesJourneyStage: nil,
            accountStatus: nil
        )
    }
}
