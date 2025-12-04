# Google Contacts Import - Troubleshooting Guide

## Error: "unauthorized_client: Client is unauthorized to retrieve access tokens using this method"

This error typically occurs when:

### **Scenario 1: Using OAuth (Recommended)**

**Symptoms:**
- Error mentions "unauthorized_client"
- Error shows a service account email (e.g., `hamirulhafizal.pg@gmail.com`)

**Root Cause:**
- OAuth credentials not configured, OR
- User hasn't connected via OAuth yet, so system falls back to service account

**Solution:**

1. **Set up OAuth credentials in `.env.local`:**
   ```env
   GOOGLE_CONTACTS_CLIENT_ID=your_client_id_here
   GOOGLE_CONTACTS_CLIENT_SECRET=your_client_secret_here
   NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID=your_client_id_here
   GOOGLE_CONTACTS_REDIRECT_URI=http://localhost:3001/auth/google-contacts/callback
   ```

2. **Click "Connect Google Contacts" button** in the Excel Processor page
   - You'll see the Google Sign-in consent screen
   - Grant permissions
   - You'll be redirected back with a "Connected" status

3. **Then click "Import to Google Contacts"** - it should work!

---

### **Scenario 2: Using Service Account**

**Symptoms:**
- Same error but you're trying to use service account
- Error mentions domain-wide delegation

**Root Cause:**
- Service account not configured properly
- Domain-wide delegation not enabled
- Wrong scopes authorized

**Solution:**

1. **Enable Domain-Wide Delegation:**
   - In Google Cloud Console → Service Account
   - Enable "Domain-Wide Delegation"
   - Note the Client ID

2. **Authorize in Google Workspace Admin:**
   - Go to Google Workspace Admin Console
   - Security → API Controls → Domain-wide Delegation
   - Add new authorization:
     - Client ID: (from step 1)
     - OAuth Scopes: `https://www.googleapis.com/auth/contacts`

3. **Set environment variables:**
   ```env
   GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   GOOGLE_CONTACTS_TARGET_USER_EMAIL=user@yourdomain.com
   ```

---

## Quick Fix (Recommended: Use OAuth)

**For personal Gmail accounts or easier setup, use OAuth:**

1. **Remove service account environment variables** (if any):
   - Remove `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - Remove `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
   - Remove `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`

2. **Add OAuth credentials** (see Scenario 1 above)

3. **Restart your dev server:**
   ```bash
   npm run dev
   ```

4. **Connect via UI:**
   - Go to Excel Processor page
   - Click "Connect Google Contacts"
   - Grant permissions
   - Import contacts!

---

## Common Issues

### Issue: "OAuth credentials not configured"
**Fix:** Add `GOOGLE_CONTACTS_CLIENT_ID` and `GOOGLE_CONTACTS_CLIENT_SECRET` to `.env.local`

### Issue: "Authorization expired"
**Fix:** Click "Connect Google Contacts" again to get a fresh token

### Issue: "Insufficient permissions"
**Fix:** Make sure you granted the contacts scope during OAuth authorization

### Issue: Error shows service account email instead of OAuth
**Fix:** Clear service account env vars and use OAuth instead (see Quick Fix above)

---

## Verify Your Setup

### Check OAuth Configuration:
```bash
# In your .env.local, you should have:
GOOGLE_CONTACTS_CLIENT_ID=xxx
GOOGLE_CONTACTS_CLIENT_SECRET=xxx
NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID=xxx
```

### Check Connection Status:
- Open Excel Processor page
- Look for green "Connected" indicator
- If not connected, click "Connect Google Contacts"

---

## Need Help?

1. **Check browser console** for detailed error messages
2. **Check server logs** for authentication errors
3. **Verify Google Cloud Console**:
   - People API is enabled
   - OAuth consent screen is configured
   - OAuth client ID has correct redirect URI
   - Required scopes are added

---

## Environment Variables Reference

### OAuth (Recommended):
```env
GOOGLE_CONTACTS_CLIENT_ID=your_client_id
GOOGLE_CONTACTS_CLIENT_SECRET=your_client_secret
NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID=your_client_id
GOOGLE_CONTACTS_REDIRECT_URI=http://localhost:3001/auth/google-contacts/callback
```

### Service Account (Advanced):
```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n"
GOOGLE_CONTACTS_TARGET_USER_EMAIL=user@domain.com
```

**Note:** You don't need both - use either OAuth OR Service Account, not both!


