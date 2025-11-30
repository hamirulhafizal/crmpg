# Google Contacts Import Setup Guide

This guide explains how to set up Google Contacts import functionality using the Google People API.

## Requirements

### 1. Google Cloud Console Setup

1. **Create/Select a Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one

2. **Enable People API**
   - Navigate to "APIs & Services" → "Library"
   - Search for "People API"
   - Click "Enable"

3. **Configure OAuth Consent Screen**
   - Go to "APIs & Services" → "OAuth consent screen"
   - Select "External" (or "Internal" if using Google Workspace)
   - Fill in app information
   - Add required scopes:
     - `https://www.googleapis.com/auth/contacts` (Read and modify contacts)
     - OR `https://www.googleapis.com/auth/contacts.readwrite` (Same as above)

4. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Select "Web application"
   - Add authorized redirect URIs:
     - Development: `http://localhost:3001/auth/google-contacts/callback`
     - Production: `https://yourdomain.com/auth/google-contacts/callback`
   - Save the **Client ID** and **Client Secret**

### 2. Environment Variables

Add to your `.env.local`:

```env
# Google Contacts API
GOOGLE_CONTACTS_CLIENT_ID=your_google_client_id_here
GOOGLE_CONTACTS_CLIENT_SECRET=your_google_client_secret_here
NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID=your_google_client_id_here

# Optional: For storing OAuth tokens
GOOGLE_CONTACTS_REDIRECT_URI=http://localhost:3001/auth/google-contacts/callback
```

### 3. Required OAuth Scopes

For importing contacts, you need:
- `https://www.googleapis.com/auth/contacts` - Read and modify contacts
- Or `https://www.googleapis.com/auth/contacts.readwrite` - Same access

## How It Works

1. **User clicks "Import to Google Contacts"**
2. **OAuth Flow**:
   - Redirect to Google OAuth consent screen
   - User grants permission for contacts access
   - Google redirects back with authorization code
   - Exchange code for access token
3. **Import Process**:
   - Map processed data to Google Contacts format
   - Use `batchCreateContacts` API to import
   - Show progress and results

## API Endpoints

### POST `/api/google-contacts/import`
- Imports processed Excel data to Google Contacts
- Requires: `processedData` array
- Returns: Import results with success/failure counts

### GET `/auth/google-contacts/callback`
- Handles OAuth callback
- Exchanges code for access token
- Stores token in session/cookies

## Data Mapping

Processed data fields → Google Contacts:
- `Name` → `names[0].givenName` / `names[0].familyName`
- `SenderName` → `names[0].displayName`
- `FirstName` → `names[0].givenName`
- Email addresses → `emailAddresses[].value`
- Phone → `phoneNumbers[].value`
- Other fields → `organizations[]` or `userDefined[]`

## Limitations

- **Rate Limits**: 
  - 100,000 quota units per day per project
  - Batch create uses 6 quota units per contact
- **Batch Size**: Max 500 contacts per batch request
- **Sequential Requests**: Mutate requests should be sent sequentially

## Security Notes

- Store OAuth tokens securely (encrypted, in database or secure cookies)
- Never expose client secret to client-side code
- Implement token refresh logic
- Handle token expiration gracefully

## Testing

1. Test with 1-2 contacts first
2. Verify contacts appear in Google Contacts
3. Test with larger batches
4. Test error handling (expired tokens, rate limits, etc.)

