# iOS App Development Guide

## Overview
This guide covers building an iOS app for the Public Gold CRM system with:
1. **Excel/CSV Processor** - Upload, process with OpenAI, download results
2. **Google Contacts Integration** - Import and sync contacts
3. **Authentication & User Management** - Supabase auth with Google OAuth

---

## Architecture Recommendation

### Option 1: Native iOS (Swift/SwiftUI) ⭐ **RECOMMENDED**
- **Pros**: Best performance, native iOS experience, full access to iOS features
- **Cons**: iOS only (need separate Android app)
- **Best for**: Production app, maximum performance

**Recommendation**: Use **Native iOS (Swift/SwiftUI)** for best user experience and performance.

---

## Required Libraries & SDKs

### 1. Supabase iOS SDK
```swift
// Package.swift or Xcode Package Manager
.package(url: "https://github.com/supabase/supabase-swift", from: "2.0.0")
```

### 2. Google Sign-In SDK
```swift
// Add via Swift Package Manager
https://github.com/google/GoogleSignIn-iOS
```

### 3. Google People API (Contacts)
- Use Google Sign-In SDK (includes People API access)
- Or use REST API directly with OAuth tokens

### 4. File Processing
- **Excel**: [ZIPFoundation](https://github.com/weichsel/ZIPFoundation) + custom Excel parser
- **CSV**: Native `String` parsing
- **Alternative**: Use your Next.js API endpoints (recommended)

### 5. Network & JSON
- **URLSession** (native iOS)
- **Codable** (native Swift JSON parsing)

---

## API Endpoints Reference

Your Next.js backend provides these endpoints:

### Authentication Endpoints
```
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/user
```

### Excel Processing Endpoints
```
POST /api/excel/upload          - Upload Excel/CSV file
POST /api/openai/process-row     - Process single row with OpenAI
POST /api/excel/generate         - Generate Excel file from processed data
```

### Google Contacts Endpoints
```
GET  /api/google-contacts/auth   - Get Google OAuth URL
POST /api/google-contacts/import - Import contacts to Google
```

### User Profile Endpoints
```
GET  /api/user/profile
PUT  /api/user/profile
```

---

## Implementation Guide

### Step 1: Project Setup

#### 1.1 Create New iOS Project
1. Open Xcode
2. Create new project → iOS → App
3. Choose **SwiftUI** interface
4. Name: "PublicGoldCRM"

#### 1.2 Add Dependencies
In Xcode:
1. File → Add Package Dependencies
2. Add:
   - `https://github.com/supabase/supabase-swift`
   - `https://github.com/google/GoogleSignIn-iOS`

---

### Step 2: Supabase Authentication Setup

#### 2.1 Install Supabase SDK
```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/supabase/supabase-swift", from: "2.0.0")
]
```

#### 2.2 Create Supabase Client
```swift
// SupabaseManager.swift
import Foundation
import Supabase

class SupabaseManager: ObservableObject {
    static let shared = SupabaseManager()
    
    let client: SupabaseClient
    
    private init() {
        client = SupabaseClient(
            supabaseURL: URL(string: "YOUR_SUPABASE_URL")!,
            supabaseKey: "YOUR_SUPABASE_ANON_KEY"
        )
    }
}
```

#### 2.3 Add to Info.plist
```xml
<key>NEXT_PUBLIC_SUPABASE_URL</key>
<string>https://your-project.supabase.co</string>
<key>NEXT_PUBLIC_SUPABASE_ANON_KEY</key>
<string>your-anon-key</string>
```

---

### Step 3: Google OAuth Setup

#### 3.1 Configure Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 Client ID for **iOS**
3. Add your **Bundle ID** (e.g., `com.publicgold.crm`)
4. Download `GoogleService-Info.plist`
5. Add to Xcode project

#### 3.2 Configure URL Scheme
In Xcode:
1. Select project → Target → Info
2. Add URL Type:
   - Identifier: `com.publicgold.crm`
   - URL Schemes: `com.googleusercontent.apps.YOUR_CLIENT_ID`

#### 3.3 Update Info.plist
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleTypeRole</key>
        <string>Editor</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>com.googleusercontent.apps.YOUR_CLIENT_ID</string>
        </array>
    </dict>
</array>
```

#### 3.4 Implement Google Sign-In
```swift
// AuthService.swift
import Foundation
import GoogleSignIn
import Supabase

class AuthService: ObservableObject {
    @Published var isAuthenticated = false
    @Published var user: User?
    
    private let supabase = SupabaseManager.shared.client
    
    func signInWithGoogle() async throws {
        guard let presentingViewController = await UIApplication.shared.windows.first?.rootViewController else {
            throw AuthError.noPresentingViewController
        }
        
        // Configure Google Sign-In
        guard let clientID = Bundle.main.object(forInfoDictionaryKey: "GOOGLE_CLIENT_ID") as? String else {
            throw AuthError.missingGoogleClientID
        }
        
        let config = GIDConfiguration(clientID: clientID)
        GIDSignIn.sharedInstance.configuration = config
        
        // Sign in with Google
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presentingViewController)
        
        guard let idToken = result.user.idToken?.tokenString else {
            throw AuthError.noIDToken
        }
        
        // Sign in to Supabase with Google token
        let session = try await supabase.auth.signInWithIdToken(
            credentials: .init(
                provider: .google,
                idToken: idToken
            )
        )
        
        self.user = session.user
        self.isAuthenticated = true
    }
    
    func signOut() async throws {
        try await supabase.auth.signOut()
        GIDSignIn.sharedInstance.signOut()
        self.isAuthenticated = false
        self.user = nil
    }
    
    func getCurrentUser() async throws {
        let user = try await supabase.auth.user
        self.user = user
        self.isAuthenticated = user != nil
    }
}
```

---

### Step 4: Excel/CSV Processor Implementation

#### 4.1 File Picker & Upload
```swift
// ExcelProcessorViewModel.swift
import SwiftUI
import UniformTypeIdentifiers

class ExcelProcessorViewModel: ObservableObject {
    @Published var isProcessing = false
    @Published var progress: Double = 0
    @Published var processedData: [[String: Any]] = []
    @Published var errorMessage: String?
    
    private let apiBaseURL = "https://your-nextjs-app.com/api"
    
    func uploadFile(fileURL: URL) async throws {
        isProcessing = true
        progress = 0
        
        // Read file data
        let fileData = try Data(contentsOf: fileURL)
        
        // Create multipart form data
        var request = URLRequest(url: URL(string: "\(apiBaseURL)/excel/upload")!)
        request.httpMethod = "POST"
        
        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileURL.lastPathComponent)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        
        request.httpBody = body
        
        // Get auth token from Supabase
        let session = try await SupabaseManager.shared.client.auth.session
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        
        // Upload file
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw ProcessingError.uploadFailed
        }
        
        let result = try JSONDecoder().decode(UploadResponse.self, from: data)
        
        // Process rows with OpenAI
        try await processRows(result.data, headers: result.headers)
    }
    
    private func processRows(_ rows: [[String: Any]], headers: [String]) async throws {
        let totalRows = rows.count
        
        for (index, row) in rows.enumerated() {
            // Process single row
            var request = URLRequest(url: URL(string: "\(apiBaseURL)/openai/process-row")!)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            
            let session = try await SupabaseManager.shared.client.auth.session
            request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            
            let requestBody = [
                "rowData": row,
                "rowNumber": index + 1
            ]
            
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
            
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                continue // Skip failed rows
            }
            
            let result = try JSONDecoder().decode(ProcessRowResponse.self, from: data)
            
            // Merge processed data with original row
            var processedRow = row
            processedRow.merge(result.result) { (_, new) in new }
            processedData.append(processedRow)
            
            // Update progress
            progress = Double(index + 1) / Double(totalRows)
        }
        
        isProcessing = false
    }
    
    func downloadExcel() async throws -> URL {
        var request = URLRequest(url: URL(string: "\(apiBaseURL)/excel/generate")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let session = try await SupabaseManager.shared.client.auth.session
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        
        let headers = processedData.first?.keys.map { String($0) } ?? []
        let requestBody = [
            "data": processedData,
            "originalHeaders": headers
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw ProcessingError.downloadFailed
        }
        
        // Save to temporary file
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("processed_\(Date().timeIntervalSince1970).xlsx")
        
        try data.write(to: tempURL)
        
        return tempURL
    }
}

// Response Models
struct UploadResponse: Codable {
    let success: Bool
    let data: [[String: Any]]
    let headers: [String]
    let rowCount: Int
}

struct ProcessRowResponse: Codable {
    let success: Bool
    let result: [String: Any]
}
```

#### 4.2 UI Implementation
```swift
// ExcelProcessorView.swift
import SwiftUI
import UniformTypeIdentifiers

struct ExcelProcessorView: View {
    @StateObject private var viewModel = ExcelProcessorViewModel()
    @State private var showFilePicker = false
    @State private var showShareSheet = false
    @State private var downloadedFileURL: URL?
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                // Upload Button
                Button(action: { showFilePicker = true }) {
                    Label("Upload Excel/CSV", systemImage: "doc.badge.plus")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
                .fileImporter(
                    isPresented: $showFilePicker,
                    allowedContentTypes: [.spreadsheet, .commaSeparatedText],
                    allowsMultipleSelection: false
                ) { result in
                    switch result {
                    case .success(let urls):
                        if let url = urls.first {
                            Task {
                                try? await viewModel.uploadFile(fileURL: url)
                            }
                        }
                    case .failure(let error):
                        viewModel.errorMessage = error.localizedDescription
                    }
                }
                
                // Progress Bar
                if viewModel.isProcessing {
                    VStack {
                        ProgressView(value: viewModel.progress)
                        Text("Processing: \(Int(viewModel.progress * 100))%")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                
                // Processed Data Count
                if !viewModel.processedData.isEmpty {
                    Text("\(viewModel.processedData.count) rows processed")
                        .font(.headline)
                }
                
                // Download Button
                if !viewModel.processedData.isEmpty && !viewModel.isProcessing {
                    Button(action: {
                        Task {
                            do {
                                let fileURL = try await viewModel.downloadExcel()
                                downloadedFileURL = fileURL
                                showShareSheet = true
                            } catch {
                                viewModel.errorMessage = error.localizedDescription
                            }
                        }
                    }) {
                        Label("Download Excel", systemImage: "arrow.down.doc")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.green)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                    }
                }
                
                Spacer()
            }
            .padding()
            .navigationTitle("Excel Processor")
            .sheet(isPresented: $showShareSheet) {
                if let url = downloadedFileURL {
                    ShareSheet(items: [url])
                }
            }
        }
    }
}
```

---

### Step 5: Google Contacts Integration

#### 5.1 Request Contacts Permission
```swift
// ContactsService.swift
import Contacts
import Foundation

class ContactsService: ObservableObject {
    func requestAccess() async -> Bool {
        let status = CNContactStore.authorizationStatus(for: .contacts)
        
        if status == .authorized {
            return true
        }
        
        let store = CNContactStore()
        do {
            return try await store.requestAccess(for: .contacts)
        } catch {
            return false
        }
    }
    
    func importToGoogleContacts(_ contacts: [[String: Any]]) async throws {
        // Get Google OAuth token
        guard let accessToken = await getGoogleAccessToken() else {
            throw ContactsError.noAccessToken
        }
        
        // Map contacts to Google Contacts format
        let googleContacts = contacts.map { contact in
            mapToGoogleContact(contact)
        }
        
        // Import via your Next.js API
        var request = URLRequest(url: URL(string: "https://your-nextjs-app.com/api/google-contacts/import")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        
        let requestBody = ["processedData": contacts]
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw ContactsError.importFailed
        }
        
        // Handle response
        let result = try JSONDecoder().decode(ImportResponse.self, from: data)
        print("Imported \(result.results.created) contacts")
    }
    
    private func mapToGoogleContact(_ contact: [String: Any]) -> [String: Any] {
        // Map your contact format to Google Contacts format
        // Similar to your server-side mapping
        return [
            "names": [[
                "givenName": contact["FirstName"] as? String ?? "",
                "familyName": contact["Name"] as? String ?? ""
            ]],
            "emailAddresses": [[
                "value": contact["Email"] as? String ?? ""
            ]],
            "phoneNumbers": [[
                "value": contact["Phone"] as? String ?? ""
            ]]
        ]
    }
    
    private func getGoogleAccessToken() async -> String? {
        // Get access token from Google Sign-In
        guard let user = GIDSignIn.sharedInstance.currentUser else {
            return nil
        }
        
        // Request additional scopes for Contacts
        let scopes = ["https://www.googleapis.com/auth/contacts"]
        
        do {
            let result = try await user.refreshTokensIfNeeded()
            return result.accessToken.tokenString
        } catch {
            return nil
        }
    }
}
```

#### 5.2 Update Google Sign-In Scopes
```swift
// In AuthService.swift, update signInWithGoogle()
func signInWithGoogle() async throws {
    // ... existing code ...
    
    // Add contacts scope
    let config = GIDConfiguration(clientID: clientID)
    config.scopes = ["https://www.googleapis.com/auth/contacts"]
    GIDSignIn.sharedInstance.configuration = config
    
    // ... rest of the code ...
}
```

---

### Step 6: User Profile Management

#### 6.1 Profile View Model
```swift
// ProfileViewModel.swift
import Foundation
import Supabase

class ProfileViewModel: ObservableObject {
    @Published var user: User?
    @Published var profile: UserProfile?
    @Published var isLoading = false
    
    private let supabase = SupabaseManager.shared.client
    
    func loadProfile() async throws {
        isLoading = true
        
        // Get current user
        user = try await supabase.auth.user
        
        // Load profile from your API
        var request = URLRequest(url: URL(string: "https://your-nextjs-app.com/api/user/profile")!)
        request.httpMethod = "GET"
        
        let session = try await supabase.auth.session
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw ProfileError.loadFailed
        }
        
        profile = try JSONDecoder().decode(UserProfile.self, from: data)
        isLoading = false
    }
    
    func updateProfile(_ profile: UserProfile) async throws {
        var request = URLRequest(url: URL(string: "https://your-nextjs-app.com/api/user/profile")!)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let session = try await supabase.auth.session
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        
        request.httpBody = try JSONEncoder().encode(profile)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw ProfileError.updateFailed
        }
        
        self.profile = try JSONDecoder().decode(UserProfile.self, from: data)
    }
}

struct UserProfile: Codable {
    let id: String
    let email: String
    let fullName: String?
    let phone: String?
    let avatarUrl: String?
}
```

---

## Environment Configuration

### Create Config.swift
```swift
// Config.swift
import Foundation

enum Config {
    static var supabaseURL: String {
        guard let url = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String else {
            fatalError("SUPABASE_URL not found in Info.plist")
        }
        return url
    }
    
    static var supabaseAnonKey: String {
        guard let key = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String else {
            fatalError("SUPABASE_ANON_KEY not found in Info.plist")
        }
        return key
    }
    
    static var apiBaseURL: String {
        guard let url = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String else {
            fatalError("API_BASE_URL not found in Info.plist")
        }
        return url
    }
}
```

### Update Info.plist
```xml
<key>SUPABASE_URL</key>
<string>https://your-project.supabase.co</string>
<key>SUPABASE_ANON_KEY</key>
<string>your-anon-key-here</string>
<key>API_BASE_URL</key>
<string>https://your-nextjs-app.com</string>
<key>GOOGLE_CLIENT_ID</key>
<string>your-google-client-id.apps.googleusercontent.com</string>
```

---

## App Structure

```
PublicGoldCRM/
├── App/
│   └── PublicGoldCRMApp.swift
├── Models/
│   ├── User.swift
│   ├── UserProfile.swift
│   └── Contact.swift
├── Services/
│   ├── SupabaseManager.swift
│   ├── AuthService.swift
│   ├── ExcelProcessorViewModel.swift
│   ├── ContactsService.swift
│   └── ProfileViewModel.swift
├── Views/
│   ├── LoginView.swift
│   ├── DashboardView.swift
│   ├── ExcelProcessorView.swift
│   ├── ContactsView.swift
│   └── ProfileView.swift
└── Utilities/
    ├── Config.swift
    └── Extensions.swift
```

---

## Next Steps

1. **Set up Supabase Project**
   - Create Supabase project
   - Get URL and anon key
   - Enable Google OAuth provider

2. **Set up Google Cloud Console**
   - Create iOS OAuth client
   - Download GoogleService-Info.plist
   - Enable People API (Contacts)

3. **Update Next.js API**
   - Add CORS headers for iOS app
   - Verify authentication middleware works with Supabase tokens

4. **Test Authentication Flow**
   - Google Sign-In
   - Supabase session management
   - Token refresh

5. **Implement Features**
   - Excel processor
   - Google Contacts import
   - User profile

6. **Testing**
   - Unit tests for services
   - UI tests for critical flows
   - Test on real devices

---

## Important Notes

1. **Authentication**: Use Supabase's built-in Google OAuth, not direct Google Sign-In
2. **API Security**: Always include Supabase access token in API requests
3. **File Handling**: Use iOS document picker for file selection
4. **Background Processing**: Use async/await for all network calls
5. **Error Handling**: Implement proper error handling and user feedback
6. **Offline Support**: Consider caching processed data locally

---

## Troubleshooting

### Google Sign-In Issues
- Verify Bundle ID matches Google Cloud Console
- Check URL scheme configuration
- Ensure GoogleService-Info.plist is added correctly

### Supabase Auth Issues
- Verify Supabase URL and keys
- Check redirect URLs in Supabase dashboard
- Ensure Google OAuth is enabled in Supabase

### API Connection Issues
- Verify API base URL
- Check CORS configuration on Next.js backend
- Ensure authentication tokens are included

---

## Resources

- [Supabase iOS Documentation](https://supabase.com/docs/reference/swift/introduction)
- [Google Sign-In iOS Guide](https://developers.google.com/identity/sign-in/ios)
- [Google People API](https://developers.google.com/people/api/rest)
- [SwiftUI Documentation](https://developer.apple.com/documentation/swiftui/)

