import SwiftUI

/// Cold-start splash inspired by Netflix: dark field, bold wordmark zoom, then dissolve into the app.
struct BrandSplashView: View {
    /// Becomes true once auth bootstrap finished (signed in or out).
    var isContentReady: Bool
    var onFinished: () -> Void

    @State private var logoScale: CGFloat = 1
    @State private var logoOpacity: Double = 1
    @State private var glowOpacity: Double = 0
    @State private var backdropOpacity: Double = 1
    @State private var animationComplete = false
    @State private var didFinish = false

    var body: some View {
        ZStack {
            PGColors.brandPurple
                .ignoresSafeArea()

            // Keeps the native launch screen and animated splash visually continuous.
            RadialGradient(
                colors: [
                    Color.white.opacity(0.13),
                    Color.white.opacity(0.03),
                    .clear
                ],
                center: .center,
                startRadius: 20,
                endRadius: 280
            )
            .opacity(glowOpacity)
            .ignoresSafeArea()

            Text("CRMPG")
                .font(.system(size: 54, weight: .bold, design: .rounded))
                .tracking(4)
                .foregroundStyle(.white)
                .scaleEffect(logoScale)
                .opacity(logoOpacity)
                .accessibilityLabel("Public Gold CRM")
        }
        .opacity(backdropOpacity)
        .ignoresSafeArea()
        .onAppear { runIntro() }
        .onChange(of: isContentReady) { _, ready in
            if ready { tryFinish() }
        }
        .onChange(of: animationComplete) { _, done in
            if done { tryFinish() }
        }
        .preferredColorScheme(.light)
    }

    private func runIntro() {
        // Beat 1 — continue smoothly from the static iOS launch logo.
        withAnimation(.easeOut(duration: 0.85)) {
            logoScale = 1.08
            logoOpacity = 1
            glowOpacity = 1
        }

        // Beat 2 — hold, then dramatic zoom-out dissolve.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.35) {
            withAnimation(.easeIn(duration: 0.55)) {
                logoScale = 3.2
                logoOpacity = 0
                glowOpacity = 0
                backdropOpacity = 0
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.55) {
                animationComplete = true
            }
        }
    }

    private func tryFinish() {
        guard isContentReady, animationComplete, !didFinish else { return }
        didFinish = true
        onFinished()
    }
}
