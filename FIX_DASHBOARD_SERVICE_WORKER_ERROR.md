# Fix: Dashboard Service Worker Error After Google Login

## The Problem

After logging in with Google Auth, you see:
- "This site can't be reached" error for `/dashboard`
- Service worker error: "a redirected response was used for a request whose redirect mode is not 'follow'"

## Root Cause

The service worker was intercepting `/dashboard` requests. When the middleware redirects unauthenticated users from `/dashboard` to `/login`, the service worker tried to handle that redirect, causing the error.

## ✅ Solution Applied

Updated the service worker to **bypass protected routes** that require authentication:

1. **Bypassed `/dashboard`** - No longer intercepted by service worker
2. **Bypassed other protected routes** - `/profile`, `/pwa-test`, `/excel-processor`
3. **Bypassed API routes** - All `/api/*` routes go directly to network
4. **Removed from cache** - `/dashboard`, `/login`, `/register` are no longer cached

## How to Apply the Fix

### Step 1: Clear Service Worker Cache

**Option A: Using Browser DevTools (Recommended)**

1. Open Chrome DevTools (F12)
2. Go to **Application** tab
3. Click **Service Workers** in the left sidebar
4. Click **Unregister** for your service worker
5. Click **Clear storage** → **Clear site data**
6. Close DevTools
7. **Hard refresh** the page (Ctrl+Shift+R or Cmd+Shift+R)

**Option B: Using Browser Settings**

1. Go to `chrome://settings/content/all`
2. Search for `localhost:3000` (or your domain)
3. Click on it
4. Click **Clear data**
5. Refresh the page

### Step 2: Restart Dev Server

```bash
# Stop the server (Ctrl+C)
# Then restart
npm run dev
```

### Step 3: Test the Login Flow

1. Go to login page
2. Click "Sign in with Google"
3. Complete Google OAuth
4. You should be redirected to `/dashboard` without errors

## What Changed

**Before:**
- Service worker intercepted `/dashboard` requests
- Middleware redirects caused service worker errors
- Redirects failed with "redirect mode is not 'follow'"

**After:**
- Service worker **skips** `/dashboard` and protected routes
- These routes go directly to the network
- Middleware redirects work correctly
- No service worker interference

## Routes Now Bypassed by Service Worker

- `/auth/*` - OAuth callbacks
- `/login`, `/register` - Auth pages
- `/dashboard` - Protected route (may redirect)
- `/profile` - Protected route
- `/pwa-test` - Protected route
- `/excel-processor` - Protected route
- `/api/*` - All API routes

## ✅ Verification

After clearing the service worker:
1. ✅ `/dashboard` should load without errors
2. ✅ Google OAuth should complete successfully
3. ✅ Redirects should work correctly
4. ✅ No service worker errors in console

## 🆘 Still Not Working?

1. **Check if service worker is still active:**
   - DevTools → Application → Service Workers
   - Make sure it's unregistered

2. **Try incognito mode:**
   - Service workers are disabled in incognito
   - If it works in incognito, the service worker was the issue

3. **Check server logs:**
   - Make sure your dev server is running
   - Check for any errors in the terminal

4. **Verify the route exists:**
   - The route is at `app/dashboard/page.tsx`
   - Middleware should handle authentication

