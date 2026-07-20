import Foundation

struct IosHandoffResponse: Decodable, Sendable {
    let url: String
}

enum AuthenticatedWebSession {
    /// Builds a Safari URL that signs the current native session into web cookies, then opens `path`.
    static func url(opening path: String) async -> URL {
        let destination = normalizedPath(path)
        let fallback = URL(string: destination, relativeTo: AppConfig.apiBaseURL)!.absoluteURL

        guard let session = SupabaseManager.shared.session
            ?? SupabaseManager.shared.client.auth.currentSession
        else {
            return fallback
        }

        if let sealed = await sealedHandoffURL(
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            next: destination
        ) {
            return sealed
        }

        return hashFallbackURL(
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            next: destination
        ) ?? fallback
    }

    private static func sealedHandoffURL(
        accessToken: String,
        refreshToken: String,
        next: String
    ) async -> URL? {
        guard let endpoint = URL(string: "/api/auth/ios-handoff", relativeTo: AppConfig.apiBaseURL)?.absoluteURL
        else { return nil }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("CRMPGApp/iOS", forHTTPHeaderField: "User-Agent")

        let body: [String: String] = [
            "next": next,
            "accessToken": accessToken,
            "refreshToken": refreshToken,
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200 ... 299).contains(http.statusCode) else {
                return nil
            }
            let decoded = try JSONDecoder().decode(IosHandoffResponse.self, from: data)
            return URL(string: decoded.url)
        } catch {
            return nil
        }
    }

    /// Works even before `/api/auth/ios-handoff` is deployed (tokens stay in the URL hash).
    private static func hashFallbackURL(
        accessToken: String,
        refreshToken: String,
        next: String
    ) -> URL? {
        guard var components = URLComponents(
            url: URL(string: "/auth/ios-session", relativeTo: AppConfig.apiBaseURL)!.absoluteURL,
            resolvingAgainstBaseURL: false
        ) else { return nil }

        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "+&=")
        let access = accessToken.addingPercentEncoding(withAllowedCharacters: allowed) ?? accessToken
        let refresh = refreshToken.addingPercentEncoding(withAllowedCharacters: allowed) ?? refreshToken
        let nextEncoded = next.addingPercentEncoding(withAllowedCharacters: allowed) ?? next
        components.fragment = "access_token=\(access)&refresh_token=\(refresh)&next=\(nextEncoded)"
        return components.url
    }

    private static func normalizedPath(_ path: String) -> String {
        let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "/dashboard" }
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            guard let url = URL(string: trimmed), let comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
                return "/dashboard"
            }
            let pathPart = comps.path.isEmpty ? "/dashboard" : comps.path
            if let query = comps.query, !query.isEmpty {
                return "\(pathPart)?\(query)"
            }
            return pathPart
        }
        return trimmed.hasPrefix("/") ? trimmed : "/\(trimmed)"
    }
}
