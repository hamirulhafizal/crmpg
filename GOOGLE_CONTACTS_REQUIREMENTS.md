# Google Contacts Import - Service Account Requirements

## ✅ Implementation Complete (Using Service Account)

All code has been implemented to use **Service Account** authentication instead of OAuth.

---

## 📋 Requirements Summary

### 1. **Google Cloud Console Setup** ✅ Required

1. **Enable People API**
   - Console → APIs & Services → Library
   - Search "People API" → Enable

2. **Create Service Account**
   - IAM & Admin → Service Accounts → Create Service Account
   - Name: "CRM Excel Processor Service"

3. **Create Service Account Key**
   - Download JSON key file
   - Extract `client_email` and `private_key`

4. **Enable Domain-Wide Delegation** (For Google Workspace)
   - Enable in service account settings
   - Note the Client ID
   - Configure in Google Workspace Admin Console

### 2. **Environment Variables** ✅ Required

Add to `.env.local`:

```env
# Option 1: Using JSON Key File Path (Recommended)
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=path/to/service-account-key.json

# OR Option 2: Using Individual Values
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project-id.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Target User Email (whose contacts to import to)
GOOGLE_CONTACTS_TARGET_USER_EMAIL=user@yourdomain.com
```

### 3. **Domain-Wide Delegation Setup** ✅ Required (For Google Workspace)

1. **Enable in Service Account**
   - Check "Enable Google Workspace Domain-wide Delegation"

2. **Authorize in Google Workspace Admin**
   - Go to: admin.google.com → Security → API Controls → Domain-wide Delegation
   - Add new authorization:
     - Client ID: (from service account)
     - OAuth Scopes: `https://www.googleapis.com/auth/contacts`

---

## 🎯 Data Mapping

| Excel Field | → | Google Contact Field |
|------------|---|---------------------|
| `Name` | → | Display Name |
| `SenderName` | → | **First Name** (givenName) |
| `FirstName` | → | First Name (fallback) |
| `Email` | → | Email Address |
| `Phone` or `Telephone` | → | Phone Number |

---

## ⚠️ Important Notes

### Service Account Limitations

1. **Domain-Wide Delegation Required** for Google Workspace
   - Service account must impersonate users to access their contacts
   - Requires Google Workspace admin approval

2. **Personal Google Accounts** 
   - Cannot use domain-wide delegation
   - Only works with Google Workspace

3. **Target User Email**
   - Must be in the same Google Workspace domain
   - Contacts will be imported to this user's account

---

## 🚀 Quick Start

1. Create service account in Google Cloud Console
2. Download JSON key file
3. Enable domain-wide delegation
4. Add environment variables
5. Restart server
6. Click "Import to Google Contacts" button

---

## 📚 Detailed Setup Guide

See `GOOGLE_CONTACTS_SERVICE_ACCOUNT_SETUP.md` for complete step-by-step instructions.

---

## 🔧 How It Works

1. **No OAuth Flow** - Service account authenticates directly
2. **Server-Side Only** - More secure, no client tokens
3. **Direct Import** - Contacts imported to target user's account
4. **Batch Processing** - Handles up to 500 contacts per batch
