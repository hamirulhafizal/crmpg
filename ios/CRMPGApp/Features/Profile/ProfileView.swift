import SwiftUI

struct ProfileView: View {
    @Environment(AppState.self) private var appState
    @State private var isSigningOut = false

    var body: some View {
        List {
            Section {
                HStack(spacing: 16) {
                    avatar
                    VStack(alignment: .leading, spacing: 4) {
                        Text(appState.profile?.displayName ?? "Dealer")
                            .font(PGTypography.headline)
                        if let email = SupabaseManager.shared.currentUser?.email {
                            Text(email)
                                .font(PGTypography.caption)
                                .foregroundStyle(PGColors.secondaryText)
                        }
                    }
                }
                .padding(.vertical, 8)
            }

            Section("Dealer info") {
                NavigationLink {
                    ProfileEditView()
                } label: {
                    Label("Edit profile", systemImage: "person.text.rectangle")
                }
                profileField("PG code", appState.profile?.pgcode)
                profileField("Phone", appState.profile?.phone)
                profileField("Username PGO", appState.profile?.usernamePbo)
                profileField("Role", appState.profile?.role)
            }

            Section("Tools") {
                NavigationLink {
                    ToolsHubView()
                } label: {
                    Label("All tools", systemImage: "wrench.and.screwdriver.fill")
                }
                NavigationLink {
                    PGSyncView()
                } label: {
                    Label("PG Business Center sync", systemImage: "arrow.triangle.2.circlepath")
                }
                NavigationLink {
                    LuckyDrawListView()
                } label: {
                    Label("Lucky draw", systemImage: "gift.fill")
                }
            }

            Section("Account") {
                NavigationLink {
                    CampaignListView()
                } label: {
                    Label("Campaigns", systemImage: "megaphone.fill")
                }
                NavigationLink {
                    BillingView()
                } label: {
                    Label("Billing & plan", systemImage: "creditcard.fill")
                }
                NavigationLink {
                    NotificationSettingsView()
                } label: {
                    Label("Notifications", systemImage: "bell.badge")
                }
            }

            Section("App") {
                LabeledContent("Version", value: appVersion)
                Link("Privacy policy", destination: URL(string: "https://www.publicgolds.com/privacy")!)
                Link("Chrome extension", destination: URL(string: "https://www.publicgolds.com/extension-download")!)
                Link("Manage on web", destination: URL(string: "https://www.publicgolds.com/profile")!)
            }

            Section {
                Button(role: .destructive) {
                    Task {
                        isSigningOut = true
                        await appState.signOut()
                        isSigningOut = false
                    }
                } label: {
                    HStack {
                        if isSigningOut {
                            ProgressView()
                        }
                        Text("Sign out")
                    }
                }
                .disabled(isSigningOut)
            }
        }
        .navigationTitle("Profile")
        .refreshable {
            await appState.refreshProfile()
        }
    }

    @ViewBuilder
    private var avatar: some View {
        if let urlString = appState.profile?.avatarURL, let url = URL(string: urlString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    placeholderAvatar
                }
            }
            .frame(width: 56, height: 56)
            .clipShape(Circle())
        } else {
            placeholderAvatar
        }
    }

    private var placeholderAvatar: some View {
        Circle()
            .fill(PGColors.gold.opacity(0.2))
            .frame(width: 56, height: 56)
            .overlay {
                Image(systemName: "person.fill")
                    .foregroundStyle(PGColors.goldDark)
            }
    }

    @ViewBuilder
    private func profileField(_ label: String, _ value: String?) -> some View {
        LabeledContent(label) {
            Text(value?.isEmpty == false ? value! : "—")
                .foregroundStyle(value?.isEmpty == false ? .primary : PGColors.secondaryText)
        }
    }

    private var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }
}

#Preview {
    NavigationStack {
        ProfileView()
            .environment(AppState())
    }
}
