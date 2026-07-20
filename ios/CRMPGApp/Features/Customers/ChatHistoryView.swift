import SwiftUI

@MainActor
@Observable
final class ChatHistoryViewModel {
    var messages: [ChatMessage] = []
    var isLoading = false
    var errorMessage: String?
    var unavailableHint: String?

    private let customerId: UUID

    init(customerId: UUID) {
        self.customerId = customerId
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        unavailableHint = nil
        defer { isLoading = false }

        do {
            let response: ChatHistoryResponse = try await APIClient.shared.get(.chatHistory(customerId: customerId))
            messages = response.items
            if messages.isEmpty {
                unavailableHint = "No chat messages found for this customer."
            }
        } catch let error as APIError {
            switch error {
            case .unauthorized, .server(status: 401, _):
                unavailableHint = "Chat history needs the Bearer API deployed to production. Use the web CRM for now."
            case .server(status: 404, _):
                unavailableHint = "No WhatsApp chat found for this customer."
            default:
                errorMessage = error.localizedDescription
                unavailableHint = "Could not load chat history from the API."
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct ChatHistoryView: View {
    @State private var viewModel: ChatHistoryViewModel
    let customerName: String

    init(customerId: UUID, customerName: String) {
        _viewModel = State(initialValue: ChatHistoryViewModel(customerId: customerId))
        self.customerName = customerName
    }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.messages.isEmpty {
                LoadingView(message: "Loading chat…")
            } else if viewModel.messages.isEmpty {
                EmptyStateView(
                    icon: "bubble.left.and.bubble.right",
                    title: "No messages",
                    message: viewModel.unavailableHint ?? viewModel.errorMessage ?? "Chat history is empty."
                )
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 10) {
                            ForEach(viewModel.messages) { message in
                                ChatBubble(message: message)
                                    .id(message.id)
                            }
                        }
                        .padding()
                    }
                    .onAppear {
                        if let last = viewModel.messages.last {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }
        }
        .navigationTitle("Chat")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await viewModel.load() }
        .task { await viewModel.load() }
        .overlay(alignment: .top) {
            if let error = viewModel.errorMessage, !viewModel.messages.isEmpty {
                ErrorBanner(message: error) { viewModel.errorMessage = nil }
                    .padding()
            }
        }
    }
}

private struct ChatBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.fromMe { Spacer(minLength: 40) }
            VStack(alignment: message.fromMe ? .trailing : .leading, spacing: 4) {
                Text(message.text)
                    .font(PGTypography.body)
                    .foregroundStyle(message.fromMe ? Color.white : PGColors.primaryText)
                    .padding(12)
                    .background(message.fromMe ? PGColors.goldDark : PGColors.card)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                if let date = message.date {
                    Text(date, style: .time)
                        .font(.caption2)
                        .foregroundStyle(PGColors.secondaryText)
                }
            }
            if !message.fromMe { Spacer(minLength: 40) }
        }
    }
}
