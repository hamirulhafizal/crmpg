# Push Notifications Setup Guide

This guide will help you set up web push notifications using the `web-push` package.

## Prerequisites

- Node.js installed
- `web-push` package (already installed)

## Step 1: Generate VAPID Keys

VAPID (Voluntary Application Server Identification) keys are required to send push notifications.

### Option 1: Using the provided script

```bash
node scripts/generate-vapid-keys.js
```

This will generate keys and display instructions.

### Option 2: Using web-push CLI

First, install web-push globally (if not already installed):

```bash
npm install -g web-push
```

Then generate keys:

```bash
web-push generate-vapid-keys
```

### Option 3: Using Node.js directly

```javascript
const webpush = require('web-push');
const vapidKeys = webpush.generateVAPIDKeys();
console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);
```

## Step 2: Configure Environment Variables

Add the following to your `.env.local` file:

```env
# VAPID Keys for Web Push Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_key_here
VAPID_PRIVATE_KEY=your_private_key_here
VAPID_SUBJECT=mailto:your-email@example.com
```

**Important Notes:**
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` - Used on the client side, safe to expose
- `VAPID_PRIVATE_KEY` - **NEVER** commit this to git or expose it publicly
- `VAPID_SUBJECT` - Must be a mailto: URL or HTTPS URL

## Step 3: Restart Development Server

After adding the environment variables, restart your Next.js development server:

```bash
npm run dev
```

## API Routes

The following API routes are available:

### POST `/api/push/subscribe`
Save a push subscription.

**Request Body:**
```json
{
  "subscription": {
    "endpoint": "https://...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  },
  "userAgent": "...",
  "deviceInfo": {
    "isIOS": false,
    "isStandalone": true,
    "displayMode": "standalone"
  }
}
```

### DELETE `/api/push/subscribe`
Remove a push subscription.

**Request Body:**
```json
{
  "subscription": {
    "endpoint": "https://...",
    "keys": { ... }
  }
}
```

### POST `/api/push/send-test`
Send a test push notification to a specific subscription.

**Request Body:**
```json
{
  "subscription": { ... },
  "title": "Test Notification",
  "message": "This is a test",
  "delay": 0
}
```

**Parameters:**
- `subscription` - Push subscription object
- `title` - Notification title
- `message` - Notification message
- `delay` - Delay in milliseconds (optional, for testing delayed notifications)

### POST `/api/push/broadcast`
Send a push notification to all subscribed devices.

**Request Body:**
```json
{
  "title": "Broadcast Notification",
  "message": "Message to all users"
}
```

**Response:**
```json
{
  "success": true,
  "sent": 5,
  "failed": 0,
  "total": 5,
  "errors": []
}
```

## Storage

Currently, subscriptions are stored in memory (using `app/lib/push-subscriptions.ts`). This means:

- ✅ Simple setup, no database required
- ⚠️ Subscriptions are lost when the server restarts
- ⚠️ Not suitable for production with multiple server instances

### For Production

For production use, consider storing subscriptions in a database:

1. **Supabase** (recommended if already using it):
   - Create a `push_subscriptions` table
   - Store subscription JSON, user ID, device info
   - Update `app/lib/push-subscriptions.ts` to use Supabase client

2. **Other options:**
   - PostgreSQL
   - MongoDB
   - Redis (for temporary storage)

## Testing

1. Visit `/pwa-test/push` page
2. Subscribe to push notifications
3. Send a test notification
4. Try broadcast notifications (requires multiple subscribed devices)

## Troubleshooting

### "VAPID keys not configured"
- Make sure environment variables are set in `.env.local`
- Restart your development server after adding variables

### "VAPID key mismatch"
- This means the keys have changed since subscription
- User needs to unsubscribe and resubscribe
- Keep VAPID keys consistent across deployments

### "Subscription expired"
- Subscriptions can expire or become invalid
- User needs to resubscribe
- Handle this gracefully in your UI

### Notifications not appearing
- Check browser notification permissions
- Verify service worker is registered
- Check browser console for errors
- Test with different browsers/devices

## Security Considerations

1. **Never expose private key**: Only the public key should be in client-side code
2. **Validate subscriptions**: Always validate subscription data on the server
3. **Rate limiting**: Consider adding rate limiting to prevent abuse
4. **User consent**: Always request permission before subscribing users

## Resources

- [web-push npm package](https://www.npmjs.com/package/web-push)
- [Web Push Protocol](https://tools.ietf.org/html/rfc8030)
- [VAPID Protocol](https://tools.ietf.org/html/rfc8292)
- [MDN Web Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)

