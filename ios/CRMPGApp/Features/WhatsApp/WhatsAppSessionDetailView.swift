import SwiftUI
import UIKit

@MainActor
@Observable
final class WhatsAppSessionDetailViewModel {
    let sessionName: String
    var session: WhatsAppSession?
    var qrImage: UIImage?
    var alreadyConnected = false
    var pairingCode: String?
    var isLoading = false
    var isActing = false
    var isLoadingQR = false
    var errorMessage: String?
    var infoMessage: String?
    var pollTask: Task<Void, Never>?

    init(sessionName: String) {
        self.sessionName = sessionName
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            session = try await APIClient.shared.get(.wahaSession(name: sessionName))
            if session?.statusKind.needsQR == true || session?.statusKind == .stopped {
                await refreshQR(force: false)
            }
            if case .working = session?.statusKind {
                alreadyConnected = true
                qrImage = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshQR(force: Bool) async {
        isLoadingQR = true
        errorMessage = nil
        defer { isLoadingQR = false }

        do {
            let response: WhatsAppQRResponse = try await APIClient.shared.get(
                .wahaSessionQr(name: sessionName, force: force)
            )
            if response.alreadyConnected == true {
                alreadyConnected = true
                qrImage = nil
                infoMessage = response.message ?? "WhatsApp is already linked."
                await reloadSessionOnly()
                return
            }
            alreadyConnected = false
            if let raw = response.qrcode, let image = Self.decodeQRImage(raw) {
                qrImage = image
                startPolling()
            } else {
                errorMessage = response.error ?? "No QR code available yet. Try Start, then Refresh QR."
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func start() async {
        await act {
            session = try await APIClient.shared.post(
                .wahaSessionStart(name: sessionName),
                body: EmptyDetailBody()
            )
            infoMessage = "Session starting…"
            await refreshQR(force: false)
        }
    }

    func stop() async {
        await act {
            session = try await APIClient.shared.post(
                .wahaSessionStop(name: sessionName),
                body: EmptyDetailBody()
            )
            qrImage = nil
            stopPolling()
            infoMessage = "Session stopped."
        }
    }

    func requestPairingCode(phone: String) async {
        let digits = phone.filter(\.isNumber)
        guard digits.count >= 8 else {
            errorMessage = "Enter the phone number with country code."
            return
        }
        await act {
            let response: PairingCodeResponse = try await APIClient.shared.post(
                .wahaSessionRequestCode(name: sessionName),
                body: PairingCodeBody(phoneNumber: digits)
            )
            if let code = response.code, !code.isEmpty {
                pairingCode = code
                infoMessage = "Enter this code in WhatsApp → Linked devices."
            } else {
                errorMessage = response.error ?? "No pairing code returned (WAHA only)."
            }
        }
    }

    func sendTest(to: String, text: String) async {
        let phone = to.filter(\.isNumber)
        guard phone.count >= 8 else {
            errorMessage = "Enter a valid destination number."
            return
        }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "Message cannot be empty."
            return
        }
        await act {
            try await APIClient.shared.postEmptyOk(
                .wahaSend,
                body: SendWhatsAppBody(session: sessionName, to: phone, text: text)
            )
            infoMessage = "Test message sent."
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    private func startPolling() {
        stopPolling()
        pollTask = Task {
            for _ in 0 ..< 40 {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                guard !Task.isCancelled else { return }
                await reloadSessionOnly()
                if case .working = session?.statusKind {
                    alreadyConnected = true
                    qrImage = nil
                    infoMessage = "WhatsApp connected."
                    stopPolling()
                    return
                }
            }
        }
    }

    private func reloadSessionOnly() async {
        do {
            session = try await APIClient.shared.get(.wahaSession(name: sessionName))
        } catch {
            // keep last known
        }
    }

    private func act(_ work: () async throws -> Void) async {
        isActing = true
        errorMessage = nil
        defer { isActing = false }
        do {
            try await work()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private static func decodeQRImage(_ raw: String) -> UIImage? {
        var base64 = raw
        if let range = raw.range(of: "base64,") {
            base64 = String(raw[range.upperBound...])
        }
        guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else {
            return nil
        }
        return UIImage(data: data)
    }
}

private struct EmptyDetailBody: Encodable {}

struct WhatsAppSessionDetailView: View {
    @State private var viewModel: WhatsAppSessionDetailViewModel
    @State private var showSendSheet = false
    @State private var showPairingSheet = false
    @State private var pairingPhone = ""
    @State private var sendTo = ""
    @State private var sendText = "Hello from Public Gold CRM"

    init(sessionName: String) {
        _viewModel = State(initialValue: WhatsAppSessionDetailViewModel(sessionName: sessionName))
    }

    var body: some View {
        List {
            Section("Status") {
                if let session = viewModel.session {
                    LabeledContent("Name", value: session.name)
                    LabeledContent("Status") {
                        Label(session.statusKind.title, systemImage: session.statusKind.systemImage)
                            .foregroundStyle(statusTint(session.statusKind))
                    }
                    if let provider = session.provider {
                        LabeledContent("Provider", value: provider.capitalized)
                    }
                    if let push = session.me?.pushName {
                        LabeledContent("WhatsApp name", value: push)
                    }
                } else if viewModel.isLoading {
                    ProgressView()
                }
            }

            Section("QR / Link") {
                if viewModel.alreadyConnected {
                    Label("Already linked", systemImage: "checkmark.seal.fill")
                        .foregroundStyle(PGColors.success)
                } else if let image = viewModel.qrImage {
                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 260)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .accessibilityLabel("WhatsApp QR code")
                } else if viewModel.isLoadingQR {
                    ProgressView("Loading QR…")
                } else {
                    Text("Start the session, then refresh QR. Scan with WhatsApp → Linked devices.")
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.secondaryText)
                }

                Button {
                    Task { await viewModel.refreshQR(force: true) }
                } label: {
                    Label("Refresh QR", systemImage: "qrcode.viewfinder")
                }
                .disabled(viewModel.isLoadingQR || viewModel.isActing)

                Button {
                    showPairingSheet = true
                } label: {
                    Label("Pairing code…", systemImage: "number")
                }

                if let code = viewModel.pairingCode {
                    LabeledContent("Code", value: code)
                        .font(PGTypography.headline)
                }
            }

            Section("Actions") {
                Button {
                    Task { await viewModel.start() }
                } label: {
                    Label("Start", systemImage: "play.fill")
                }
                .disabled(viewModel.isActing)

                Button {
                    Task { await viewModel.stop() }
                } label: {
                    Label("Stop", systemImage: "pause.fill")
                }
                .disabled(viewModel.isActing)

                Button {
                    showSendSheet = true
                } label: {
                    Label("Send test message", systemImage: "paperplane.fill")
                }
                .disabled(viewModel.isActing)
            }

            if let message = viewModel.errorMessage {
                Section {
                    Text(message)
                        .foregroundStyle(PGColors.destructive)
                        .font(PGTypography.caption)
                }
            } else if let info = viewModel.infoMessage {
                Section {
                    Text(info)
                        .foregroundStyle(PGColors.secondaryText)
                        .font(PGTypography.caption)
                }
            }
        }
        .navigationTitle(viewModel.sessionName)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.load()
        }
        .onDisappear {
            viewModel.stopPolling()
        }
        .refreshable {
            await viewModel.load()
        }
        .sheet(isPresented: $showSendSheet) {
            NavigationStack {
                Form {
                    TextField("To (6012…)", text: $sendTo)
                        .keyboardType(.phonePad)
                    TextField("Message", text: $sendText, axis: .vertical)
                        .lineLimit(3 ... 6)
                }
                .navigationTitle("Test message")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showSendSheet = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Send") {
                            Task {
                                await viewModel.sendTest(to: sendTo, text: sendText)
                                showSendSheet = false
                            }
                        }
                        .disabled(viewModel.isActing)
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $showPairingSheet) {
            NavigationStack {
                Form {
                    TextField("Phone for pairing code", text: $pairingPhone)
                        .keyboardType(.phonePad)
                    Text("WAHA only. Enter the number you want to link, then use the code in WhatsApp.")
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.secondaryText)
                }
                .navigationTitle("Pairing code")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showPairingSheet = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Request") {
                            Task {
                                await viewModel.requestPairingCode(phone: pairingPhone)
                                showPairingSheet = false
                            }
                        }
                    }
                }
            }
            .presentationDetents([.medium])
        }
    }
}

#Preview {
    NavigationStack {
        WhatsAppSessionDetailView(sessionName: "60123456789")
    }
}
