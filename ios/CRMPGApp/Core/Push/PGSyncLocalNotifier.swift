import Foundation
import UserNotifications
import UIKit

/// Local alerts for PG Sync TAC — permission is requested only when a sync starts,
/// never at cold launch (avoids debugger queue assertion crashes).
enum PGSyncLocalNotifier {
    static let categoryId = "pg_sync_tac"
    static let jobIdKey = "job_id"
    static let routeKey = "route"
    static let routePgSync = "pg_sync"

    @MainActor private static var didConfigure = false
    @MainActor private static var notifiedJobIds = Set<String>()

    @MainActor
    static func prepareForActiveSync() async {
        await configureIfNeeded()
        let status = await authorizationStatus()
        guard status == .notDetermined else { return }
        _ = try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])
    }

    @MainActor
    static func notifyAwaitingTac(jobId: String, pgCode: String?) async {
        await configureIfNeeded()
        guard !notifiedJobIds.contains(jobId) else { return }

        let status = await authorizationStatus()
        guard status == .authorized || status == .provisional else { return }

        let content = UNMutableNotificationContent()
        content.title = "PG sync — enter TAC"
        content.body = pgCode.map { "SMS TAC required for \($0). Open the app and submit the code." }
            ?? "SMS TAC required. Open the app and submit the code to continue syncing."
        content.sound = .default
        content.categoryIdentifier = categoryId
        content.userInfo = [
            jobIdKey: jobId,
            routeKey: routePgSync,
        ]

        let request = UNNotificationRequest(
            identifier: "pg-sync-tac-\(jobId)",
            content: content,
            trigger: nil
        )
        do {
            try await UNUserNotificationCenter.current().add(request)
            notifiedJobIds.insert(jobId)
        } catch {
            // Non-fatal — TAC UI still works in-app.
        }
    }

    @MainActor
    static func clearTacNotification(jobId: String) {
        notifiedJobIds.remove(jobId)
        UNUserNotificationCenter.current()
            .removeDeliveredNotifications(withIdentifiers: ["pg-sync-tac-\(jobId)"])
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: ["pg-sync-tac-\(jobId)"])
    }

    private static func authorizationStatus() async -> UNAuthorizationStatus {
        await withCheckedContinuation { cont in
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                cont.resume(returning: settings.authorizationStatus)
            }
        }
    }

    @MainActor
    private static func configureIfNeeded() async {
        guard !didConfigure else { return }
        didConfigure = true

        let center = UNUserNotificationCenter.current()
        let action = UNNotificationAction(
            identifier: "OPEN_PG_SYNC",
            title: "Enter TAC",
            options: [.foreground]
        )
        let category = UNNotificationCategory(
            identifier: categoryId,
            actions: [action],
            intentIdentifiers: [],
            options: []
        )
        center.setNotificationCategories([category])
        center.delegate = PGSyncNotificationDelegate.shared
    }
}

final class PGSyncNotificationDelegate: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let shared = PGSyncNotificationDelegate()

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        let route = userInfo[PGSyncLocalNotifier.routeKey] as? String
        let jobId = userInfo[PGSyncLocalNotifier.jobIdKey] as? String
        if route == PGSyncLocalNotifier.routePgSync {
            var payload: [AnyHashable: Any] = [PGSyncLocalNotifier.routeKey: PGSyncLocalNotifier.routePgSync]
            if let jobId {
                payload[PGSyncLocalNotifier.jobIdKey] = jobId
            }
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: .openPGSync, object: nil, userInfo: payload)
            }
        }
        completionHandler()
    }
}

extension Notification.Name {
    static let openPGSync = Notification.Name("crmpg.openPGSync")
}
