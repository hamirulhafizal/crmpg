# iOS App Development Prompt Template

Use this prompt when asking an AI assistant or developer to build your iOS app:

---

## Prompt

I need to build a native iOS app (Swift/SwiftUI) for a CRM system with the following features:

### 1. Authentication & User Management
- **Supabase Authentication** with Google OAuth
- User login/logout
- User profile management
- Session management

**Requirements:**
- Use Supabase Swift SDK
- Integrate Google Sign-In SDK
- Store user session securely
- Handle token refresh automatically

### 2. Excel/CSV Processor
- Upload Excel (.xlsx, .xls) or CSV files
- Process each row with OpenAI API to extract:
  - Gender (Male/Female)
  - Ethnicity (Malay/Chinese/Indian/Other)
  - Age (calculated from D.O.B.)
  - Prefix (En, Pn, Cik, Tn based on age)
  - FirstName (extracted from full name)
  - SenderName (Prefix + FirstName)
- Show processing progress
- Download processed data as Excel file
- Share/save processed Excel file

**API Endpoints:**
- `POST /api/excel/upload` - Upload file, returns parsed JSON
- `POST /api/openai/process-row` - Process single row with OpenAI
- `POST /api/excel/generate` - Generate Excel file from processed data

**Requirements:**
- Use iOS document picker for file selection
- Show progress bar during processing
- Handle errors gracefully
- Support background processing
- Include Supabase auth token in API requests

### 3. Google Contacts Integration
- Import processed contacts to user's Google Contacts
- Request Google Contacts API permissions
- Map processed data to Google Contacts format:
  - Name → names.givenName
  - Email → emailAddresses
  - Phone → phoneNumbers
  - D.O.B → birthdays
- Show import progress and results

**API Endpoint:**
- `POST /api/google-contacts/import` - Import contacts to Google

**Requirements:**
- Request Google Contacts scope during OAuth
- Handle batch imports (500 contacts per batch)
- Show success/failure counts
- Handle permission errors

### Technical Stack:
- **Language**: Swift 5.9+
- **UI Framework**: SwiftUI
- **Authentication**: Supabase + Google OAuth
- **Networking**: URLSession with async/await
- **File Handling**: iOS Document Picker, FileManager
- **Dependencies**: 
  - Supabase Swift SDK
  - Google Sign-In SDK

### API Base URL:
`https://your-nextjs-app.com/api`

### Authentication:
- All API requests must include Supabase access token in Authorization header
- Format: `Authorization: Bearer {supabase_access_token}`

### App Structure:
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

### Design Requirements:
- Follow Apple's Human Interface Guidelines
- Modern, clean UI with smooth animations
- Responsive layout for iPhone and iPad
- Dark mode support
- Loading states and error handling
- Intuitive navigation

### Key Features:
1. **Login Screen**: Google Sign-In button, email/password option
2. **Dashboard**: Navigation to Excel Processor, Contacts, Profile
3. **Excel Processor**: File upload → Processing → Download
4. **Contacts Import**: Import processed contacts to Google
5. **Profile**: View and edit user information

### Error Handling:
- Network errors: Show user-friendly messages
- Authentication errors: Redirect to login
- File processing errors: Show specific error messages
- API errors: Display error details

### Testing Requirements:
- Test on iOS 16+
- Test with real Supabase project
- Test Google OAuth flow
- Test file upload/download
- Test contacts import

Please provide:
1. Complete Swift code for all files
2. Configuration instructions (Info.plist, GoogleService-Info.plist)
3. Step-by-step setup guide
4. Testing checklist

---

## Additional Context

**Backend API Details:**
- Next.js 15 application
- Supabase for authentication and database
- OpenAI API for data processing
- Google People API for contacts

**Expected User Flow:**
1. User opens app → Login screen
2. User signs in with Google → Dashboard
3. User navigates to Excel Processor
4. User uploads Excel file → File parsed
5. User clicks "Process" → Rows processed with OpenAI (shows progress)
6. User clicks "Download" → Excel file generated and shared
7. User clicks "Import to Google Contacts" → Contacts imported

**Data Format:**
- Input Excel: Name, D.O.B columns (case-insensitive)
- Output Excel: Name, D.O.B, Gender, Ethnicity, Age, Prefix, FirstName, SenderName + original columns

---

## Quick Start Checklist

When building, ensure:
- [ ] Supabase project created and configured
- [ ] Google Cloud Console OAuth client created (iOS)
- [ ] GoogleService-Info.plist added to project
- [ ] Supabase URL and keys added to Info.plist
- [ ] API base URL configured
- [ ] Google Sign-In URL scheme configured
- [ ] All dependencies installed
- [ ] Authentication flow tested
- [ ] File upload/download tested
- [ ] Contacts import tested

