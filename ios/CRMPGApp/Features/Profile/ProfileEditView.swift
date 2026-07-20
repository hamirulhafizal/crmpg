import SwiftUI

struct ProfileEditView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var fullName = ""
    @State private var phone = ""
    @State private var pgcode = ""
    @State private var usernamePbo = ""
    @State private var avatarURL = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var didSave = false

    var body: some View {
        Form {
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .font(PGTypography.caption)
                        .foregroundStyle(.red)
                }
            }

            Section("Dealer") {
                TextField("Full name", text: $fullName)
                    .textContentType(.name)
                TextField("Phone", text: $phone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                TextField("PG code", text: $pgcode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                TextField("Username PGO (pg2u.my)", text: $usernamePbo)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }

            Section("Avatar") {
                TextField("Avatar image URL", text: $avatarURL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                Text("Paste a hosted image URL. Camera upload lands with Apple Developer storage later.")
                    .font(PGTypography.caption)
                    .foregroundStyle(PGColors.secondaryText)
            }

            Section {
                Button {
                    Task { await save() }
                } label: {
                    if isSaving {
                        ProgressView()
                    } else {
                        Text("Save profile")
                    }
                }
                .disabled(isSaving)
            }
        }
        .navigationTitle("Edit profile")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: hydrate)
        .alert("Saved", isPresented: $didSave) {
            Button("OK") { dismiss() }
        } message: {
            Text("Your dealer profile was updated.")
        }
    }

    private func hydrate() {
        let profile = appState.profile
        fullName = profile?.fullName ?? ""
        phone = profile?.phone ?? ""
        pgcode = profile?.pgcode ?? ""
        usernamePbo = profile?.usernamePbo ?? ""
        avatarURL = profile?.avatarURL ?? ""
    }

    private func save() async {
        guard let userId = appState.profile?.id ?? SupabaseManager.shared.currentUser?.id else {
            errorMessage = "Sign in required."
            return
        }

        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        let patch = ProfilePatch(
            fullName: trimmedOrNil(fullName),
            phone: trimmedOrNil(phone),
            pgcode: trimmedOrNil(pgcode)?.uppercased(),
            usernamePbo: trimmedOrNil(usernamePbo),
            avatarURL: trimmedOrNil(avatarURL)
        )

        do {
            let updated = try await SupabaseRepository.updateProfile(userId: userId, patch: patch)
            appState.profile = updated
            if let email = SupabaseManager.shared.currentUser?.email {
                SavedAccountsStore.upsert(from: updated, email: email, userId: userId)
            }
            didSave = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func trimmedOrNil(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

#Preview {
    NavigationStack {
        ProfileEditView()
            .environment(AppState())
    }
}
