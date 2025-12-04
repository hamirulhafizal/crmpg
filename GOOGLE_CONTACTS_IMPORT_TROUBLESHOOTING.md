# Google Contacts Import Troubleshooting

## Issue: "Service account authentication failed" Error

If you're seeing this error when trying to import contacts, it means the client-side OAuth token isn't being used correctly.

## Quick Fix

1. **Disconnect and Reconnect:**
   - Click "Connect Google Contacts" again
   - Grant permissions when prompted
   - Wait for "Connected" status to appear
   - Try importing again

2. **Check Browser Console:**
   - Open DevTools (F12)
   - Go to Console tab
   - Look for errors related to Google API or OAuth
   - Check if you see "Google OAuth token set successfully"

3. **Verify Token:**
   - In Console, type: `window.gapi.client.getToken()`
   - You should see an object with `access_token`
   - If it's `null` or missing `access_token`, reconnect

## Common Causes

### 1. Token Not Set Correctly
**Symptom:** Error says "Service account authentication failed"

**Fix:**
- The OAuth token might not be set in `gapi.client`
- Reconnect your Google account
- Check console for "Google OAuth token set successfully"

### 2. Token Expired
**Symptom:** 401 errors or "unauthorized" messages

**Fix:**
- OAuth tokens expire after 1 hour
- Reconnect to get a new token
- The token should auto-refresh, but if not, reconnect

### 3. Missing Permissions
**Symptom:** 403 errors or "permission denied"

**Fix:**
- Disconnect and reconnect
- Make sure you grant **contacts** permission during OAuth
- Check that `https://www.googleapis.com/auth/contacts` scope is requested

### 4. API Not Initialized
**Symptom:** "Google People API not initialized"

**Fix:**
- Refresh the page
- Wait a few seconds for Google APIs to load
- Check console for initialization errors

## Debugging Steps

1. **Check Integration Status:**
   ```javascript
   // In browser console
   window.googleContactsIntegration?.getStatus()
   ```
   Should show:
   - `isInitialized: true`
   - `isSignedIn: true`
   - `hasGoogle: true`
   - `hasGapi: true`

2. **Check Token:**
   ```javascript
   // In browser console
   window.gapi.client.getToken()
   ```
   Should return an object with `access_token`

3. **Test API Call:**
   ```javascript
   // In browser console (after connecting)
   window.gapi.client.people.people.createContact({
     resource: {
       names: [{ givenName: "Test", familyName: "Contact" }],
       emailAddresses: [{ value: "test@example.com" }]
     }
   })
   ```

## Expected Behavior

✅ **Correct Flow:**
1. Click "Connect Google Contacts"
2. Google sign-in popup appears
3. Grant permissions
4. "Connected" status appears
5. Click "Import to Google Contacts"
6. Contacts are created using client-side API
7. Success message appears

❌ **Wrong Flow (Current Issue):**
1. Click "Import to Google Contacts"
2. Error: "Service account authentication failed"
3. This suggests server-side route is being called instead of client-side

## Solution

The client-side integration should be working. If you're still seeing the error:

1. **Clear browser cache and reload**
2. **Disconnect and reconnect Google account**
3. **Check console for any errors**
4. **Verify environment variables are set:**
   - `NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID` (required)
   - `NEXT_PUBLIC_GOOGLE_API_KEY` (optional but recommended)

## Still Not Working?

Check the browser console for:
- Token errors
- API initialization errors
- Network errors
- Permission errors

Share the console errors for further debugging.

