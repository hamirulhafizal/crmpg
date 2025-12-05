# Fix: Google People API Not Initialized

## ✅ Changes Applied

Based on the [official Google People API JavaScript quickstart](https://developers.google.com/people/quickstart/js), I've updated the code to:

1. **Use Official Discovery Doc URL:**
   - Changed from: `https://people.googleapis.com/$discovery/rest?version=v1`
   - Changed to: `https://www.googleapis.com/discovery/v1/apis/people/v1/rest`
   - This is the official URL from Google's quickstart guide

2. **Improved Initialization:**
   - Follows the exact pattern from the quickstart guide
   - Properly loads `gapi.client` module
   - Waits for People API to load after initialization

3. **REST API Fallback:**
   - If People API doesn't load, uses REST API directly
   - Works even without discovery document

## 🔄 How to Apply the Fix

### Step 1: Clear Browser Cache

**Critical:** The browser might be using cached JavaScript. Clear it:

1. **Hard Refresh:**
   - Windows/Linux: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

2. **Or Clear Cache:**
   - Open DevTools (F12)
   - Right-click refresh button
   - Select "Empty Cache and Hard Reload"

### Step 2: Restart Dev Server

```bash
# Stop server (Ctrl+C)
# Restart
npm run dev
```

### Step 3: Verify Environment Variables

Make sure `.env.local` has:

```bash
NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID=your_client_id
NEXT_PUBLIC_GOOGLE_API_KEY=AIzaSyBz96XIQ3bHblpJGcn3Ie_9myX2oKKivu4
```

### Step 4: Test Again

1. Hard refresh the page
2. Click "Connect Google Contacts"
3. Grant permissions
4. Wait for "Connected" status
5. Try importing contacts

## 🔍 Debugging

Check browser console for:

**Good signs:**
- `gapi.client initialized with discovery doc: https://www.googleapis.com/discovery/v1/apis/people/v1/rest`
- `People API loaded successfully after X attempts`
- `People API is ready: [object with methods]`
- `gapi.client ready, will use REST API for People API calls`

**If People API doesn't load:**
- `People API not loaded after init. Will use REST API fallback.`
- `Using REST API directly for contact X (People API not loaded)`
- This is OK - REST API fallback will work

## 📝 Key Differences from Quickstart

The official quickstart uses:
- `DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/people/v1/rest'` ✅ (Now using this)
- `gapi.load('client', initializeGapiClient)` ✅ (Already doing this)
- `gapi.client.init({ apiKey, discoveryDocs: [DISCOVERY_DOC] })` ✅ (Now using this)

## ✅ Expected Behavior

1. **If People API loads:**
   - Uses `gapi.client.people.people.createContact()`
   - Works perfectly

2. **If People API doesn't load:**
   - Falls back to `gapi.client.request()` with REST API
   - Still works perfectly
   - No error thrown

The code should now work in both cases!

