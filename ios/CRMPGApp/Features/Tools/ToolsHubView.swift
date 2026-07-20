import SwiftUI

struct ToolsHubView: View {
    var body: some View {
        List {
            Section {
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
                NavigationLink {
                    ExcelToolsView()
                } label: {
                    Label("Excel processor", systemImage: "tablecells")
                }
                NavigationLink {
                    GoogleContactsStubView()
                } label: {
                    Label("Google Contacts", systemImage: "person.crop.circle.badge.plus")
                }
            } footer: {
                Text("Sync and lucky draw run natively. Excel and Google Contacts open the web tools when needed.")
            }
        }
        .navigationTitle("Tools")
    }
}

struct GoogleContactsStubView: View {
    @State private var showWeb = false

    private var webURL: URL {
        URL(string: "/excel-processor", relativeTo: AppConfig.apiBaseURL)!.absoluteURL
    }

    var body: some View {
        List {
            Section {
                Text("Google Contacts import uses Google OAuth, which is deferred on iOS until Sign in with Google ships.")
                    .font(PGTypography.body)
                    .foregroundStyle(PGColors.secondaryText)
            }
            Section {
                Button {
                    showWeb = true
                } label: {
                    Label("Open import on web", systemImage: "safari")
                }
            }
        }
        .navigationTitle("Google Contacts")
        .sheet(isPresented: $showWeb) {
            CampaignWebEditorSheet(title: "Google Contacts", url: webURL)
        }
    }
}

#Preview {
    NavigationStack {
        ToolsHubView()
    }
}
