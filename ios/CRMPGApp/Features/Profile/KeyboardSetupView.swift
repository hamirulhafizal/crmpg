import SwiftUI

struct KeyboardSetupView: View {
    var body: some View {
        List {
            Section("Enable") {
                Text("1. Open the CRM app while signed in (syncs customers to the keyboard).")
                Text("2. iOS Settings → General → Keyboard → Keyboards → Add New Keyboard…")
                Text("3. Choose Public Gold CRM / PG CRM.")
                Text("4. Tap the keyboard → Allow Full Access (needed for live search & saving).")
            }

            Section("In any app") {
                Text("Tap the globe key to switch to PG CRM. Search customers, edit full profile, create new, or insert a template into the text field.")
            }

            Section("Templates") {
                Text("Tokens: {name} {phone} {pg} {email} {location} {sender} {save_name}")
                    .font(PGTypography.caption)
                    .foregroundStyle(PGColors.secondaryText)
                Text("Edit templates from the Templates button inside the keyboard.")
            }

            Section("Privacy") {
                Text("Full Access lets the keyboard talk to Public Gold CRM servers with your signed-in session. It does not read what you type in other apps for logging.")
                    .font(PGTypography.caption)
                    .foregroundStyle(PGColors.secondaryText)
            }
        }
        .navigationTitle("CRM keyboard")
        .navigationBarTitleDisplayMode(.inline)
    }
}
