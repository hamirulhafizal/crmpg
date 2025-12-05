# Email/Password Login Troubleshooting

## Common Issues

### 1. Account Doesn't Exist
**Symptom:** "Invalid email or password" error

**Solution:**
- Make sure you've registered with email/password (not just Google OAuth)
- Go to `/register` and create an account with email/password
- Or use Google OAuth login if you only have a Google account

### 2. Email/Password Auth Not Enabled in Supabase
**Symptom:** Login fails silently or with "Email provider not enabled"

**Check:**
1. Go to Supabase Dashboard
2. Navigate to **Authentication** → **Providers**
3. Make sure **Email** provider is enabled
4. Check that **Enable email confirmations** is configured correctly

### 3. Wrong Credentials
**Symptom:** "Invalid email or password"

**Solution:**
- Double-check email and password
- Use "Forgot password?" link to reset if needed
- Make sure you're using the correct account

### 4. Session Not Being Set
**Symptom:** Login succeeds but redirects back to login

**Check:**
- Browser console for errors
- Network tab for failed requests
- Cookies are enabled in browser

## Debugging Steps

1. **Check Browser Console:**
   - Open DevTools (F12)
   - Look for "Login error:" or "Login successful:" messages
   - Check for any Supabase-related errors

2. **Check Network Tab:**
   - Look for POST request to `/auth/v1/token?grant_type=password`
   - Check response status and error messages

3. **Verify Environment Variables:**
   ```bash
   # Make sure these are set in .env.local
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

4. **Test Registration:**
   - Try registering a new account at `/register`
   - If registration fails, email/password auth might not be enabled

## Quick Fixes

### Fix 1: Enable Email Provider in Supabase
1. Go to Supabase Dashboard
2. **Authentication** → **Providers**
3. Enable **Email** provider
4. Save changes
5. Try logging in again

### Fix 2: Register New Account
1. Go to `/register`
2. Create account with email/password
3. Check email for confirmation (if enabled)
4. Try logging in

### Fix 3: Use Google OAuth
If email/password doesn't work, use Google OAuth:
1. Click "Sign in with Google"
2. Complete OAuth flow
3. You'll be logged in

## Current Implementation

The login page:
- ✅ Uses `supabase.auth.signInWithPassword()`
- ✅ Shows error messages
- ✅ Redirects to `/dashboard` on success
- ✅ Has proper error handling

If login still fails, check:
1. Browser console for specific error messages
2. Supabase Dashboard → Authentication → Logs
3. Network tab for API responses

