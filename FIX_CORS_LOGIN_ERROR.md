# Fix: CORS Error on Email/Password Login

## The Problem

```
Access to fetch at 'https://vbihbetdiddyzdyhdxli.supabase.co/auth/v1/token...' 
from origin 'http://localhost:3000' has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: 
It does not have HTTP ok status.
```

## Root Causes

1. **Supabase Project Paused** - Most common cause
2. **Incorrect Supabase URL** - Wrong project URL in environment variables
3. **CORS Not Configured** - Supabase project settings
4. **Network/Proxy Issues** - Local network blocking requests

## ✅ Solutions

### Solution 1: Check if Supabase Project is Paused

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Check your project status
3. If paused, **resume** the project
4. Wait a few minutes for it to fully start
5. Try logging in again

### Solution 2: Verify Environment Variables

Check your `.env.local` file:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://vbihbetdiddyzdyhdxli.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

**Important:**
- ✅ URL should start with `https://`
- ✅ No trailing slash
- ✅ Anon key should be the full key from Supabase Dashboard

### Solution 3: Check Supabase Project Settings

1. Go to Supabase Dashboard
2. **Settings** → **API**
3. Verify:
   - Project URL matches your `.env.local`
   - Anon key matches your `.env.local`
   - Project is **active** (not paused)

### Solution 4: Restart Dev Server

After changing environment variables:

```bash
# Stop server (Ctrl+C)
# Restart
npm run dev
```

### Solution 5: Test Supabase Connection

In browser console, test if Supabase is accessible:

```javascript
// Test Supabase URL
fetch('https://vbihbetdiddyzdyhdxli.supabase.co/auth/v1/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

If this fails, the project might be paused or URL is wrong.

## Quick Fix Checklist

- [ ] Check Supabase Dashboard - is project paused?
- [ ] Verify `.env.local` has correct `NEXT_PUBLIC_SUPABASE_URL`
- [ ] Verify `.env.local` has correct `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Restart dev server after changing env vars
- [ ] Hard refresh browser (Ctrl+Shift+R)
- [ ] Try Google OAuth login (works if CORS is the only issue)

## Alternative: Use Google OAuth

If email/password login still doesn't work due to CORS:
- Use "Sign in with Google" button
- This uses OAuth redirect flow (no CORS issues)
- Works even if email/password has CORS problems

## Still Not Working?

1. **Check Supabase Status Page:**
   - https://status.supabase.com
   - See if there are any outages

2. **Check Network Tab:**
   - Open DevTools → Network tab
   - Try logging in
   - Look for the failed request
   - Check response status code

3. **Contact Supabase Support:**
   - If project is active but CORS still fails
   - They can check project-specific issues

