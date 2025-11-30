# Google Contacts Service Account - Quick Start

## ✅ What's Already Done

- ✅ Service account authentication implemented
- ✅ "Import to Google Contacts" button added to UI
- ✅ Data mapping configured (SenderName → First Name)
- ✅ Batch processing ready
- ✅ Error handling implemented

---

## 📋 What You Need (3 Steps)

### Step 1: Create Service Account (5 minutes)

1. **Google Cloud Console** → https://console.cloud.google.com/
2. **Enable People API**
   - APIs & Services → Library → Search "People API" → Enable
3. **Create Service Account**
   - IAM & Admin → Service Accounts → Create Service Account
   - Name: "CRM Excel Processor Service"
4. **Create Key**
   - Click service account → Keys tab → Add Key → Create new key → JSON
   - **Download the JSON file**

### Step 2: Enable Domain-Wide Delegation (Google Workspace Required)

1. **In Service Account**
   - Check "Enable Google Workspace Domain-wide Delegation"
   - Note the **Client ID**

2. **Google Workspace Admin** → https://admin.google.com/
   - Security → API Controls → Domain-wide Delegation
   - Add new:
     - Client ID: (from above)
     - OAuth Scopes: `https://www.googleapis.com/auth/contacts`

### Step 3: Add Environment Variables

Add to `.env.local`:

**Option A: JSON File Path (Recommended)**
```env
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./service-account-key.json
GOOGLE_CONTACTS_TARGET_USER_EMAIL=user@yourdomain.com
```

**Option B: Individual Values**
```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CONTACTS_TARGET_USER_EMAIL=user@yourdomain.com
```

**Important**: Place JSON file in project root or specify full path.

---

## 🎯 How to Use

1. Process Excel file (as usual)
2. Click **"Import to Google Contacts"** button
3. Contacts imported directly (no OAuth needed!)

---

## ⚠️ Important Requirements

- ✅ **Google Workspace Account Required** - Personal Gmail accounts won't work
- ✅ **Domain-Wide Delegation Required** - Must be enabled and authorized
- ✅ **Target User Email** - Must be in your Google Workspace domain

---

## 📊 Data Mapping

- `SenderName` → **First Name** in Google Contacts
- `Name` → Display Name
- `Email` → Email Address
- `Phone` → Phone Number

---

## 🔗 Full Documentation

- `GOOGLE_CONTACTS_SERVICE_ACCOUNT_SETUP.md` - Complete setup guide
- `GOOGLE_CONTACTS_REQUIREMENTS.md` - Requirements summary

