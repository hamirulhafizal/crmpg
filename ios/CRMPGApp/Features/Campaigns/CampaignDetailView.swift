import SwiftUI

@MainActor
@Observable
final class CampaignDetailViewModel {
    let campaignId: UUID
    var seed: Campaign?
    var detail: CampaignDetailPayload?
    var isLoading = false
    var isActing = false
    var errorMessage: String?
    var infoMessage: String?

    init(campaignId: UUID, seed: Campaign? = nil) {
        self.campaignId = campaignId
        self.seed = seed
    }

    var campaign: Campaign? {
        detail?.campaign ?? seed
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let envelope: CampaignDetailEnvelope = try await APIClient.shared.get(.campaign(id: campaignId))
            if let data = envelope.data {
                detail = data
                seed = data.campaign
            } else {
                errorMessage = envelope.error ?? "Could not load campaign detail."
            }
        } catch let error as APIError {
            errorMessage = error.localizedDescription
            if case .unauthorized = error {
                infoMessage = "Full analytics need Bearer `/api/campaigns/[id]` deployed. Status actions still work via list."
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setStatus(_ status: String) async {
        isActing = true
        errorMessage = nil
        defer { isActing = false }

        do {
            let envelope: CampaignPatchEnvelope = try await APIClient.shared.patch(
                .campaign(id: campaignId),
                body: CampaignStatusPatch(status: status)
            )
            if let updated = envelope.data {
                seed = updated
                detail?.campaign = updated
                infoMessage = "Status set to \(status)."
            }
            await load()
        } catch {
            do {
                try await SupabaseRepository.updateCampaignStatus(id: campaignId, status: status)
                if let updated = (detail?.campaign ?? seed)?.withStatus(status) {
                    seed = updated
                    detail?.campaign = updated
                }
                infoMessage = "Status set to \(status)."
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

struct CampaignDetailView: View {
    @State private var viewModel: CampaignDetailViewModel
    @State private var showEditWeb = false

    init(campaignId: UUID, seed: Campaign? = nil) {
        _viewModel = State(initialValue: CampaignDetailViewModel(campaignId: campaignId, seed: seed))
    }

    var body: some View {
        List {
            if let campaign = viewModel.campaign {
                Section("Overview") {
                    LabeledContent("Name", value: campaign.name)
                    LabeledContent("Status") {
                        Label(campaign.statusKind.title, systemImage: campaign.statusKind.systemImage)
                            .foregroundStyle(campaignStatusTint(campaign.statusKind))
                    }
                    LabeledContent("Trigger", value: campaign.triggerLabel)
                    if let tz = campaign.timezone {
                        LabeledContent("Timezone", value: tz)
                    }
                    if let limit = campaign.dailySendLimit {
                        LabeledContent("Daily send limit", value: "\(limit)")
                    }
                    if let desc = campaign.description, !desc.isEmpty {
                        Text(desc)
                            .font(PGTypography.caption)
                            .foregroundStyle(PGColors.secondaryText)
                    }
                }
            }

            if let stats = viewModel.detail?.stats {
                Section("Analytics") {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        statCard("Enrolled", value: stats.enrolled ?? 0)
                        statCard("Sent", value: stats.sent ?? 0)
                        statCard("Failed", value: stats.failed ?? 0)
                        statCard("Completed", value: stats.completed ?? 0)
                    }
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)

                    if let rate = stats.successRate {
                        LabeledContent("Success rate", value: String(format: "%.1f%%", rate))
                    }
                }
            }

            if let audience = viewModel.detail?.audience {
                Section("Audience") {
                    if let total = audience.eligible?.matchingTotal {
                        LabeledContent("Eligible", value: "\(total)")
                    }
                    if let due = audience.dueNow?.total {
                        LabeledContent("Due now", value: "\(due)")
                    }
                    if let lines = audience.criteriaLines, !lines.isEmpty {
                        ForEach(lines, id: \.self) { line in
                            Text(line)
                                .font(PGTypography.caption)
                                .foregroundStyle(PGColors.secondaryText)
                        }
                    }
                }
            }

            if let steps = viewModel.detail?.steps, !steps.isEmpty {
                Section("Steps") {
                    ForEach(steps) { step in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("Step \(step.stepOrder ?? 0)")
                                    .font(PGTypography.headline)
                                Spacer()
                                if let delay = step.delayDays {
                                    Text("+\(delay)d")
                                        .font(PGTypography.caption)
                                        .foregroundStyle(PGColors.secondaryText)
                                }
                            }
                            Text(step.messageTemplate ?? "")
                                .font(PGTypography.caption)
                                .foregroundStyle(PGColors.secondaryText)
                                .lineLimit(3)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }

            if let logs = viewModel.detail?.recentLogs, !logs.isEmpty {
                Section("Recent sends") {
                    ForEach(logs) { log in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text((log.sendStatus ?? "—").capitalized)
                                    .font(PGTypography.headline)
                                Spacer()
                                if let created = log.createdAt {
                                    Text(created.prefix(16))
                                        .font(PGTypography.caption)
                                        .foregroundStyle(PGColors.secondaryText)
                                }
                            }
                            if let err = log.errorMessage, !err.isEmpty {
                                Text(err)
                                    .font(PGTypography.caption)
                                    .foregroundStyle(PGColors.destructive)
                                    .lineLimit(2)
                            }
                        }
                    }
                }
            }

            Section("Actions") {
                if let campaign = viewModel.campaign {
                    switch campaign.statusKind {
                    case .active:
                        Button {
                            Task { await viewModel.setStatus("paused") }
                        } label: {
                            Label("Pause campaign", systemImage: "pause.fill")
                        }
                        .disabled(viewModel.isActing)
                    case .paused, .draft:
                        Button {
                            Task { await viewModel.setStatus("active") }
                        } label: {
                            Label("Activate campaign", systemImage: "play.fill")
                        }
                        .disabled(viewModel.isActing)
                    default:
                        EmptyView()
                    }

                    if campaign.statusKind != .archived {
                        Button {
                            Task { await viewModel.setStatus("archived") }
                        } label: {
                            Label("Archive", systemImage: "archivebox")
                        }
                        .disabled(viewModel.isActing)
                    }
                }

                Button {
                    showEditWeb = true
                } label: {
                    Label("Edit workflow on web", systemImage: "safari")
                }
            }

            if let message = viewModel.errorMessage {
                Section {
                    Text(message)
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.destructive)
                }
            } else if let info = viewModel.infoMessage {
                Section {
                    Text(info)
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.secondaryText)
                }
            }
        }
        .navigationTitle(viewModel.campaign?.name ?? "Campaign")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
        .sheet(isPresented: $showEditWeb) {
            CampaignWebEditorSheet(
                title: "Edit campaign",
                url: URL(string: "https://www.publicgolds.com/dashboard/campaigns/\(viewModel.campaignId.uuidString)/edit")!
            )
        }
        .overlay {
            if viewModel.isLoading && viewModel.detail == nil && viewModel.seed == nil {
                LoadingView()
            }
        }
    }

    private func statCard(_ label: String, value: Int) -> some View {
        PGCard {
            VStack(alignment: .leading, spacing: 4) {
                Text(label.uppercased())
                    .font(PGTypography.caption)
                    .foregroundStyle(PGColors.secondaryText)
                Text("\(value)")
                    .font(PGTypography.title)
                    .foregroundStyle(PGColors.primaryText)
            }
        }
    }
}

#Preview {
    NavigationStack {
        CampaignDetailView(campaignId: UUID())
    }
}
