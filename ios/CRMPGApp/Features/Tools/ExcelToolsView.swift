import SwiftUI
import UniformTypeIdentifiers

struct ExcelToolsView: View {
    @State private var showImporter = false
    @State private var showWeb = false
    @State private var pickedFileName: String?
    @State private var statusMessage: String?
    @State private var isUploading = false

    private var webURL: URL {
        URL(string: "/excel-processor", relativeTo: AppConfig.apiBaseURL)!.absoluteURL
    }

    var body: some View {
        List {
            Section {
                Text("Pick a spreadsheet on your phone, then finish AI row processing on the web tool for full accuracy.")
                    .font(PGTypography.body)
                    .foregroundStyle(PGColors.secondaryText)
            }

            Section("File") {
                Button {
                    showImporter = true
                } label: {
                    Label("Choose Excel or CSV", systemImage: "doc.badge.plus")
                }
                if let pickedFileName {
                    LabeledContent("Selected", value: pickedFileName)
                }
                if isUploading {
                    ProgressView("Uploading…")
                }
                if let statusMessage {
                    Text(statusMessage)
                        .font(PGTypography.caption)
                        .foregroundStyle(PGColors.secondaryText)
                }
            }

            Section("Web processor") {
                Button {
                    showWeb = true
                } label: {
                    Label("Open Excel processor", systemImage: "safari")
                }
            }
        }
        .navigationTitle("Excel")
        .fileImporter(
            isPresented: $showImporter,
            allowedContentTypes: [
                .commaSeparatedText,
                UTType(filenameExtension: "xlsx") ?? .data,
                UTType(filenameExtension: "xls") ?? .data,
            ],
            allowsMultipleSelection: false
        ) { result in
            handleImport(result)
        }
        .sheet(isPresented: $showWeb) {
            CampaignWebEditorSheet(title: "Excel processor", url: webURL)
        }
    }

    private func handleImport(_ result: Result<[URL], Error>) {
        switch result {
        case .failure(let error):
            statusMessage = error.localizedDescription
        case .success(let urls):
            guard let url = urls.first else { return }
            pickedFileName = url.lastPathComponent
            statusMessage = "File ready. Open the web processor to upload and run AI row processing."
            // Security-scoped access for Files app picks.
            let accessed = url.startAccessingSecurityScopedResource()
            defer {
                if accessed { url.stopAccessingSecurityScopedResource() }
            }
            Task {
                await uploadIfPossible(url: url)
            }
        }
    }

    private func uploadIfPossible(url: URL) async {
        isUploading = true
        defer { isUploading = false }

        do {
            let data = try Data(contentsOf: url)
            let response = try await ExcelUploadClient.upload(
                fileName: url.lastPathComponent,
                data: data
            )
            if let rows = response.rowCount {
                statusMessage = "Parsed \(rows) rows. Continue on web to process and import."
            } else {
                statusMessage = response.message ?? "Upload accepted. Continue on web to process rows."
            }
            showWeb = true
        } catch {
            statusMessage = "Could not upload from the app (\(error.localizedDescription)). Use the web processor instead."
        }
    }
}

enum ExcelUploadClient {
    struct UploadResponse: Decodable {
        var rowCount: Int?
        var totalRows: Int?
        var message: String?
        var error: String?

        enum CodingKeys: String, CodingKey {
            case message, error, rowCount
            case totalRows
        }
    }

    static func upload(fileName: String, data: Data) async throws -> UploadResponse {
        guard let token = SupabaseManager.shared.accessToken else {
            throw APIError.unauthorized
        }
        guard let url = URL(string: "/api/excel/upload", relativeTo: AppConfig.apiBaseURL)?.absoluteURL else {
            throw APIError.invalidResponse
        }

        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue("CRMPGApp/iOS", forHTTPHeaderField: "User-Agent")

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: application/octet-stream\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (responseData, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200 ... 299).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode([String: String].self, from: responseData))?["error"]
            throw APIError.server(status: http.statusCode, message: message)
        }
        return try JSONDecoder().decode(UploadResponse.self, from: responseData)
    }
}

#Preview {
    NavigationStack {
        ExcelToolsView()
    }
}
