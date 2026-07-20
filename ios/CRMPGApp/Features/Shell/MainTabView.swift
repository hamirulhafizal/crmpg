import SwiftUI

struct MainTabView: View {
    @Environment(AppState.self) private var appState
    @State private var selectedTab = 0
    @State private var showOnboarding = false

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                DashboardView(selectedTab: $selectedTab)
            }
            .tabItem {
                Label("Home", systemImage: "house.fill")
            }
            .tag(0)

            NavigationStack {
                CustomerListView()
            }
            .tabItem {
                Label("Customers", systemImage: "person.2.fill")
            }
            .tag(1)

            NavigationStack {
                WhatsAppSessionsView()
            }
            .tabItem {
                Label("WhatsApp", systemImage: "message.fill")
            }
            .tag(2)

            NavigationStack {
                ProfileView()
            }
            .tabItem {
                Label("Profile", systemImage: "person.crop.circle.fill")
            }
            .tag(3)
        }
        .tint(PGColors.gold)
        .sheet(isPresented: $showOnboarding) {
            OnboardingSheet()
        }
        .sheet(isPresented: Binding(
            get: { appState.showPGSync },
            set: { appState.showPGSync = $0 }
        )) {
            NavigationStack {
                PGSyncView()
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close") { appState.showPGSync = false }
                        }
                    }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .openPGSync)) { _ in
            appState.showPGSync = true
        }
        .onAppear {
            showOnboarding = !(appState.profile?.isProfileComplete ?? true)
        }
        .onChange(of: appState.profile?.isProfileComplete) { _, isComplete in
            if isComplete == true {
                showOnboarding = false
            }
        }
        .onChange(of: appState.accountSessionID) { _, _ in
            guard appState.isSwitchingAccount else { return }
            selectedTab = 0
            showOnboarding = false
        }
        .onChange(of: appState.pendingCustomersTab) { _, pending in
            if pending {
                selectedTab = 1
            }
        }
    }
}

struct OnboardingSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var showEdit = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Complete your profile")
                        .font(PGTypography.title)

                    Text("Add your PG code, phone, and pg2u.my username to unlock sync and other tools.")
                        .foregroundStyle(PGColors.secondaryText)

                    if let profile = appState.profile {
                        PGCard {
                            VStack(alignment: .leading, spacing: 8) {
                                profileRow("PG code", value: profile.pgcode)
                                profileRow("Phone", value: profile.phone)
                                profileRow("Username PGO", value: profile.usernamePbo)
                                profileRow("Full name", value: profile.fullName)
                            }
                        }
                    }

                    Button {
                        showEdit = true
                    } label: {
                        Label("Edit profile", systemImage: "person.text.rectangle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(PGColors.gold)
                }
                .padding(24)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Continue") { dismiss() }
                }
            }
            .navigationDestination(isPresented: $showEdit) {
                ProfileEditView()
            }
        }
        .presentationDetents([.medium, .large])
        .interactiveDismissDisabled(false)
    }

    private func profileRow(_ label: String, value: String?) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(PGColors.secondaryText)
            Spacer()
            Image(systemName: (value?.isEmpty == false) ? "checkmark.circle.fill" : "circle")
                .foregroundStyle((value?.isEmpty == false) ? PGColors.success : PGColors.secondaryText)
        }
        .font(PGTypography.body)
    }
}
