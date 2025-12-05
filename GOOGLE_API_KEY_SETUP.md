# Google API Key Setup Guide

## Your API Key

```
AIzaSyBz96XIQ3bHblpJGcn3Ie_9myX2oKKivu4
```

## How to Add It

### Step 1: Create `.env.local` file

In your project root (`/Users/hamirulhafizal/Desktop/crmpg`), create or edit `.env.local`:

```bash
# Google Contacts Integration
NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID=your_client_id_here
NEXT_PUBLIC_GOOGLE_API_KEY=AIzaSyBz96XIQ3bHblpJGcn3Ie_9myX2oKKivu4
```

### Step 2: Restart Dev Server

**Important:** After adding environment variables, you MUST restart your dev server:

```bash
# Stop the server (Ctrl+C)
# Then restart
npm run dev
```

### Step 3: Verify It's Loaded

1. Open browser console (F12)
2. Type: `window.googleContactsIntegration?.getStatus()`
3. Check `hasApiKey` - should be `true`

## Why API Key Helps

The API key helps with:
- ✅ Loading Google API discovery documents faster
- ✅ Better initialization of People API
- ✅ More reliable API calls

## Important Notes

- ✅ API key is **public** (safe to expose in browser)
- ✅ It's prefixed with `NEXT_PUBLIC_` so it's available in the browser
- ✅ It's used alongside OAuth token (doesn't replace it)
- ✅ OAuth token is still required for user-specific operations

## Troubleshooting

If it still doesn't work after adding the API key:

1. **Check environment variable is set:**
   ```bash
   # In terminal
   echo $NEXT_PUBLIC_GOOGLE_API_KEY
   ```

2. **Restart dev server** (required after env changes)

3. **Hard refresh browser** (Ctrl+Shift+R or Cmd+Shift+R)

4. **Check console** for "hasApiKey: true" in status

## Current Status

The code now:
- ✅ Uses API key when initializing `gapi.client`
- ✅ Uses API key when re-initializing (if already initialized)
- ✅ Falls back to REST API if People API doesn't load (works without discovery doc)

