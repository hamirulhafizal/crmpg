import SwiftUI

@main
struct CRMPGApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
                .onAppear {
                    appState.bootstrap()
                }
                .onOpenURL { url in
                    appState.handleDeepLink(url)
                }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                    Task {
                        await SupabaseManager.shared.refreshSessionIfNeeded()
                        await appState.refreshProfile()
                        if appState.authStatus == .signedIn {
                            await WidgetSnapshotSync.refreshCurrentDealerStats(profile: appState.profile)
                            await KeyboardCacheSync.refreshFromApp(profile: appState.profile)
                        }
                    }
                }
        }
    }
}

struct RootView: View {
    @Environment(AppState.self) private var appState
    @State private var showBrandSplash = true

    var body: some View {
        ZStack {
            Group {
                switch appState.authStatus {
                case .loading:
                    PGColors.brandPurple
                        .ignoresSafeArea()
                case .signedOut:
                    LoginView()
                case .signedIn:
                    MainTabView()
                }
            }
            .animation(.easeInOut(duration: 0.25), value: appState.authStatus)

            if showBrandSplash {
                BrandSplashView(isContentReady: appState.authStatus != .loading) {
                    showBrandSplash = false
                }
                .transition(.opacity)
                .zIndex(1)
            }
        }
    }
}
