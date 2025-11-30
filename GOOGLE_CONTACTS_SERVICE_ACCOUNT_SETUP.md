# Google Contacts Service Account Setup Guide

This guide explains how to set up Google Contacts import using a **Service Account** instead of OAuth.

## ✅ Advantages of Service Account

- ✅ **No user interaction required** - No OAuth flow needed
- ✅ **Always authenticated** - No token expiration issues
- ✅ **Server-side only** - More secure, no client-side tokens
- ✅ **Better for automation** - Perfect for batch imports

## ⚠️ Important Limitations

**Service accounts can only access contacts if:**
1. **Google Workspace with Domain-Wide Delegation** (Recommended)
   - Service account can impersonate any user in the domain
   - Requires admin approval
   - Access to all users' contacts

2. **Shared Contacts**
   - Contacts must be shared with the service account
   - Limited to shared contacts only

## 📋 Step-by-Step Setup

### Step 1: Google Cloud Console Setup

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Select your project

2. **Enable People API**
   - Navigate to: APIs & Services → Library
   - Search for: "People API"
   - Click "Enable"

3. **Create Service Account**
   - Navigate to: IAM & Admin → Service Accounts
   - Click "Create Service Account"
   - Fill in:
     - Name: "CRM Excel Processor Service"
     - Description: "Service account for importing contacts to Google Contacts"
   - Click "Create and Continue"
   - Skip roles (not needed) → Click "Continue"
   - Click "Done"

4. **Create Service Account Key**
   - Click on the service account you just created
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key"
   - Select "JSON" format
   - Click "Create"
   - **IMPORTANT**: Download the JSON file (you'll need this!)

5. **Enable Domain-Wide Delegation** (For Google Workspace)
   - In the service account details, check "Enable Google Workspace Domain-wide Delegation"
   - Note the **Client ID** shown
   - Click "Save"

6. **Configure Domain-Wide Delegation** (Google Workspace Admin)
   - Go to: https://admin.google.com/
   - Navigate to: Security → API Controls → Domain-wide Delegation
   - Click "Add new"
   - Enter:
     - Client ID: (from step 5)
     - OAuth Scopes: `https://www.googleapis.com/auth/contacts`
   - Click "Authorize"

### Step 2: Environment Variables

Add to your `.env.local` file:

**Option 1: Using JSON Key File Content**
```env
# Service Account Email (from JSON file: "client_email")
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project-id.iam.gserviceaccount.com

# Service Account Private Key (from JSON file: "private_key")
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Target User Email (whose contacts to import to)
GOOGLE_CONTACTS_TARGET_USER_EMAIL=user@yourdomain.com
```

**Option 2: Using JSON File Path** (Alternative)
```env
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=path/to/service-account-key.json
GOOGLE_CONTACTS_TARGET_USER_EMAIL=user@yourdomain.com
```

### Step 3: Extract Values from JSON Key File

Open the downloaded JSON file and extract:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "service-account@project-id.iam.gserviceaccount.com",
  ...
}
```

Copy:
- `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (keep the newlines as `\n`)

## 🔧 Implementation Details

The service account authentication uses JWT (JSON Web Token) with:
- **Email**: Service account email
- **Private Key**: Service account private key
- **Subject**: Target user email (for domain-wide delegation)
- **Scopes**: `https://www.googleapis.com/auth/contacts`

## 🎯 How It Works

1. **User processes Excel file** (as usual)
2. **User clicks "Import to Google Contacts"**
3. **Server authenticates** using service account credentials
4. **Server impersonates** target user (via domain-wide delegation)
5. **Contacts imported** directly to target user's Google Contacts

## ⚙️ Configuration Options

### Target User Email

Set `GOOGLE_CONTACTS_TARGET_USER_EMAIL` to:
- Specific user: `john@yourdomain.com` (imports to John's contacts)
- Service account: Leave empty for shared contacts only

### Multiple Users

To import to different users, you can:
- Change `GOOGLE_CONTACTS_TARGET_USER_EMAIL` environment variable
- Or add user selection UI (future enhancement)

## 🔒 Security Best Practices

1. **Never commit JSON key file** to git
2. **Store private key** in environment variables (never in code)
3. **Use secrets manager** in production (e.g., Vercel Environment Variables)
4. **Rotate keys** regularly
5. **Limit scopes** to minimum required

## 📝 Notes

- **Domain-Wide Delegation** is only available for Google Workspace accounts
- **Personal Google accounts** cannot use domain-wide delegation
- Service account must be in the **same Google Cloud Project** where People API is enabled
- The target user email must be in the **same Google Workspace domain**

## 🆘 Troubleshooting

### "Service Account not configured"
- Check environment variables are set correctly
- Verify private key includes newlines as `\n`

### "Permission denied"
- Verify domain-wide delegation is enabled
- Check admin has authorized the client ID
- Verify target user email is correct

### "Invalid credentials"
- Check private key format (must include `\n` for newlines)
- Verify service account email is correct
- Check service account key hasn't been revoked

## 🚀 Quick Start

1. Create service account in Google Cloud Console
2. Download JSON key file
3. Enable domain-wide delegation (if using Google Workspace)
4. Add environment variables to `.env.local`
5. Restart development server
6. Import contacts!

