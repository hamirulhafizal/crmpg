# Google Contacts Import - Quick Start Guide

## ✅ What's Already Done

- ✅ All code implemented
- ✅ UI buttons added to Excel Processor page
- ✅ OAuth flow implemented
- ✅ Import API created
- ✅ Data mapping configured
- ✅ `googleapis` package installed

---

## 📋 What You Need to Do (3 Steps)

### Step 1: Google Cloud Console Setup (5 minutes)

1. Go to: https://console.cloud.google.com/
2. Create/Select a project
3. Enable "People API" (APIs & Services → Library)
4. Configure OAuth Consent Screen:
   - Add scope: `https://www.googleapis.com/auth/contacts`
5. Create OAuth 2.0 Client ID:
   - Type: Web application
   - Redirect URI: `http://localhost:3001/auth/google-contacts/callback`

### Step 2: Add Environment Variables

Add to `.env.local`:

```env
GOOGLE_CONTACTS_CLIENT_ID=your_client_id_here
GOOGLE_CONTACTS_CLIENT_SECRET=your_client_secret_here
NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID=your_client_id_here
GOOGLE_CONTACTS_REDIRECT_URI=http://localhost:3001/auth/google-contacts/callback
```

### Step 3: Restart Server

```bash
# Stop your dev server (Ctrl+C)
npm run dev
```

---

## 🎯 How to Use

1. Process an Excel file (as usual)
2. Click **"Connect Google Contacts"** button
3. Grant permissions in Google OAuth screen
4. Click **"Import to Google Contacts"** button
5. Done! Contacts are imported to Google Contacts

---

## 📊 Data Mapping

| Excel Field | → | Google Contact |
|------------|---|----------------|
| `Name` | → | Display Name |
| `SenderName` | → | First Name (givenName) |
| `FirstName` | → | First Name (fallback) |
| `Email` | → | Email |
| `Phone` | → | Phone Number |

---

## ⚙️ Requirements Summary

**Minimum Requirements:**
- ✅ Google Cloud Project
- ✅ People API enabled
- ✅ OAuth Client ID with contacts scope
- ✅ Environment variables configured

**Optional but Recommended:**
- Production redirect URI configured
- Test users added (if in testing mode)

---

See `GOOGLE_CONTACTS_REQUIREMENTS.md` for detailed setup instructions.

