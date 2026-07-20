import Foundation

enum AppConfig {
    static let supabaseURL: URL = {
        guard
            let urlString = string(for: "SUPABASE_URL"),
            let url = URL(string: urlString),
            !urlString.contains("$(")
        else {
            fatalError("Missing SUPABASE_URL in Info.plist / xcconfig. Ensure Config/Secrets.xcconfig exists and rebuild.")
        }
        return url
    }()

    static let supabaseAnonKey: String = {
        guard let key = string(for: "SUPABASE_ANON_KEY"), !key.contains("$("), !key.isEmpty else {
            fatalError("Missing SUPABASE_ANON_KEY in Info.plist / xcconfig. Ensure Config/Secrets.xcconfig exists and rebuild.")
        }
        return key
    }()

    static let apiBaseURL: URL = {
        guard
            let urlString = string(for: "API_BASE_URL"),
            let url = URL(string: urlString),
            !urlString.contains("$(")
        else {
            fatalError("Missing API_BASE_URL in Info.plist / xcconfig. Ensure Config/Secrets.xcconfig exists and rebuild.")
        }
        return url
    }()

    static let googleIOSClientID: String? = {
        guard let value = string(for: "GOOGLE_IOS_CLIENT_ID"), !value.isEmpty, !value.contains("$(") else {
            return nil
        }
        return value
    }()

    private static func string(for key: String) -> String? {
        Bundle.main.object(forInfoDictionaryKey: key) as? String
    }
}
