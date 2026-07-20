import SwiftUI

struct NotificationSettingsView: View {
    @State private var push = PushNotificationService.shared

    var body: some View {
        List {
            Section("Status") {
                LabeledContent("Permission", value: push.statusLabel)
            }

            Section {
                Text("Push alerts will be enabled after you enroll in the Apple Developer Program and add an APNs key. The backend register API (`/api/push/ios/register`) is already in the repo.")
                    .font(PGTypography.caption)
                    .foregroundStyle(PGColors.secondaryText)
            }

            if let error = push.lastError {
                Section {
                    ErrorBanner(message: error) { push.lastError = nil }
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
            }
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        NotificationSettingsView()
    }
}
