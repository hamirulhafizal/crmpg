import Foundation
import UIKit

/// Push registration is deferred until Apple Developer + APNs are configured.
/// Avoid UNUserNotificationCenter at launch — it can trap on a background call-out queue
/// under the debugger (`dispatch_assert_queue_fail`).
@MainActor
@Observable
final class PushNotificationService {
    static let shared = PushNotificationService()

    var authorizationStatusLabel = "Not configured yet"
    var deviceTokenHex: String?
    var lastError: String?
    var isRegistering = false

    private init() {}

    func refreshAuthorizationStatus() async {
        // Intentionally no-op at runtime for now.
        authorizationStatusLabel = "Enable after Apple Developer + APNs setup"
    }

    func requestPermissionAndRegister() async {
        lastError = "Push notifications need the Apple Developer Program, an APNs key, and a physical iPhone. Permission UI is disabled until that is ready."
        isRegistering = false
    }

    func handleDeviceToken(_ deviceToken: Data) {
        deviceTokenHex = deviceToken.map { String(format: "%02x", $0) }.joined()
    }

    func handleRegistrationError(_ error: Error) {
        lastError = error.localizedDescription
    }

    func registerTokenWithBackend(_ token: String? = nil) async {}

    func unregisterFromBackend() async {}

    var statusLabel: String { authorizationStatusLabel }
}
