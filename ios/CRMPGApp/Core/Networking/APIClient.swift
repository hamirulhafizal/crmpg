import Foundation

enum APIEndpoint {
    case mobileConfig
    case saasMe
    case startTrial
    case saasCheckout
    case customers(page: Int, search: String?)
    case customer(id: UUID)
    case customerStats
    case chatHistory(customerId: UUID)
    case iosPushRegister
    case whatsappProvider
    case wahaSessions
    case wahaSession(name: String)
    case wahaSessionQr(name: String, force: Bool)
    case wahaSessionStart(name: String)
    case wahaSessionStop(name: String)
    case wahaSessionRequestCode(name: String)
    case wahaSend
    case campaigns
    case campaign(id: UUID)
    case pgSyncStatus
    case pgSyncJobs
    case pgSyncJobTac(jobId: String)
    case luckyDrawPages
    case luckyDrawPage(id: UUID)

    var path: String {
        switch self {
        case .mobileConfig:
            "/api/mobile/config"
        case .saasMe:
            "/api/saas/me"
        case .startTrial:
            "/api/saas/start-trial"
        case .saasCheckout:
            "/api/saas/checkout"
        case .customers:
            "/api/customers"
        case .customer(let id):
            "/api/customers/\(id.uuidString)"
        case .customerStats:
            "/api/customers/stats"
        case .chatHistory(let customerId):
            "/api/customers/\(customerId.uuidString)/chat-history"
        case .iosPushRegister:
            "/api/push/ios/register"
        case .whatsappProvider:
            "/api/whatsapp/provider"
        case .wahaSessions:
            "/api/waha/sessions"
        case .wahaSession(let name):
            "/api/waha/sessions/\(Self.encoded(name))"
        case .wahaSessionQr(let name, _):
            "/api/waha/sessions/\(Self.encoded(name))/qr"
        case .wahaSessionStart(let name):
            "/api/waha/sessions/\(Self.encoded(name))/start"
        case .wahaSessionStop(let name):
            "/api/waha/sessions/\(Self.encoded(name))/stop"
        case .wahaSessionRequestCode(let name):
            "/api/waha/sessions/\(Self.encoded(name))/request-code"
        case .wahaSend:
            "/api/waha/send"
        case .campaigns:
            "/api/campaigns"
        case .campaign(let id):
            "/api/campaigns/\(id.uuidString)"
        case .pgSyncStatus:
            "/api/pg-sync/status"
        case .pgSyncJobs:
            "/api/pg-sync/jobs"
        case .pgSyncJobTac(let jobId):
            "/api/pg-sync/jobs/\(Self.encoded(jobId))/tac"
        case .luckyDrawPages:
            "/api/lucky-draw"
        case .luckyDrawPage(let id):
            "/api/lucky-draw/\(id.uuidString)"
        }
    }

    var queryItems: [URLQueryItem]? {
        switch self {
        case .customers(let page, let search):
            var items = [URLQueryItem(name: "page", value: String(page))]
            if let search, !search.isEmpty {
                items.append(URLQueryItem(name: "search", value: search))
            }
            return items
        case .wahaSessionQr(_, let force):
            var items = [URLQueryItem(name: "format", value: "image")]
            if force {
                items.append(URLQueryItem(name: "force", value: "1"))
            }
            return items
        default:
            return nil
        }
    }

    private static func encoded(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
    }
}

enum APIError: LocalizedError {
    case unauthorized
    case invalidResponse
    case server(status: Int, message: String?)
    case decoding(Error)
    case network(Error)

    var errorDescription: String? {
        switch self {
        case .unauthorized:
            "Your session expired. Please sign in again."
        case .invalidResponse:
            "Unexpected server response."
        case .server(_, let message):
            message ?? "Something went wrong."
        case .decoding:
            "Could not read server data."
        case .network(let error):
            error.localizedDescription
        }
    }
}

@MainActor
final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let supabase = SupabaseManager.shared

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        session = URLSession(configuration: config)

        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        encoder = JSONEncoder()
    }

    func get<T: Decodable>(_ endpoint: APIEndpoint, as type: T.Type = T.self) async throws -> T {
        try await request(endpoint, method: "GET", body: Optional<Data>.none, as: type)
    }

    func post<Body: Encodable, T: Decodable>(
        _ endpoint: APIEndpoint,
        body: Body,
        as type: T.Type = T.self
    ) async throws -> T {
        let data = try encoder.encode(body)
        return try await request(endpoint, method: "POST", body: data, as: type)
    }

    func postEmptyOk(_ endpoint: APIEndpoint, body: some Encodable) async throws {
        let _: APIOkResponse = try await post(endpoint, body: body)
    }

    func patch<Body: Encodable, T: Decodable>(
        _ endpoint: APIEndpoint,
        body: Body,
        as type: T.Type = T.self
    ) async throws -> T {
        let data = try encoder.encode(body)
        return try await request(endpoint, method: "PATCH", body: data, as: type)
    }

    func delete(_ endpoint: APIEndpoint, query: [URLQueryItem] = []) async throws {
        guard let token = supabase.accessToken else { throw APIError.unauthorized }
        guard var url = URL(string: endpoint.path, relativeTo: AppConfig.apiBaseURL)?.absoluteURL else {
            throw APIError.invalidResponse
        }
        if !query.isEmpty {
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            components?.queryItems = query
            if let composed = components?.url { url = composed }
        }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("CRMPGApp/iOS", forHTTPHeaderField: "User-Agent")

        let (data, response) = try await session.data(for: request)
        _ = try decodeResponse(data, response: response, as: APIOkResponse.self)
    }

    private func request<T: Decodable>(
        _ endpoint: APIEndpoint,
        method: String,
        body: Data?,
        as type: T.Type
    ) async throws -> T {
        guard let token = supabase.accessToken else {
            throw APIError.unauthorized
        }

        guard
            let url = URL(string: endpoint.path, relativeTo: AppConfig.apiBaseURL)?.absoluteURL
        else {
            throw APIError.invalidResponse
        }
        var requestURL = url
        if let queryItems = endpoint.queryItems {
            var components = URLComponents(url: requestURL, resolvingAgainstBaseURL: false)
            components?.queryItems = queryItems
            if let composed = components?.url {
                requestURL = composed
            }
        }

        var request = URLRequest(url: requestURL)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("CRMPGApp/iOS", forHTTPHeaderField: "User-Agent")
        if body != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        request.httpBody = body

        do {
            let (data, response) = try await session.data(for: request)

            if let http = response as? HTTPURLResponse, http.statusCode == 401 {
                try await supabase.refreshSessionIfNeeded()
                if let refreshed = supabase.accessToken {
                    request.setValue("Bearer \(refreshed)", forHTTPHeaderField: "Authorization")
                    let (retryData, retryResponse) = try await session.data(for: request)
                    return try decodeResponse(retryData, response: retryResponse, as: type)
                }
                throw APIError.unauthorized
            }

            return try decodeResponse(data, response: response, as: type)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.network(error)
        }
    }

    private func decodeResponse<T: Decodable>(
        _ data: Data,
        response: URLResponse,
        as type: T.Type
    ) throws -> T {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200 ... 299).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            throw APIError.server(status: http.statusCode, message: message)
        }

        if data.isEmpty, T.self == APIOkResponse.self {
            return APIOkResponse(ok: true, success: true) as! T
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }
}

struct APIOkResponse: Codable {
    var ok: Bool?
    var success: Bool?
}

struct CheckoutResponse: Codable, Sendable {
    let checkoutUrl: String?
    let orderNumber: String?
    let paymentIntentId: String?
    let amount: Double?

    enum CodingKeys: String, CodingKey {
        case checkoutUrl
        case orderNumber
        case paymentIntentId
        case amount
    }
}

struct CustomersListResponse: Codable {
    let customers: [Customer]?
    let data: [Customer]?
    let total: Int?

    var items: [Customer] {
        customers ?? data ?? []
    }
}

struct CustomerStatsAPIResponse: Decodable, Sendable {
    let counts: [String: Int]?
    let total: Int?
    let error: String?

    var asStats: CustomerStats {
        var stats = CustomerStats()
        stats.total = total ?? counts?.values.reduce(0, +) ?? 0
        for key in AccountStatusKey.allCases {
            if let value = counts?[key.rawValue] {
                stats.byAccountStatus[key] = value
            }
        }
        return stats
    }
}
