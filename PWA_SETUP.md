# PWA Setup Instructions

This project includes Progressive Web App (PWA) features. Follow these steps to complete the setup.

## Required Icon Files

You need to create the following icon files in the `public` directory:

- `icon-192.png` - 192x192 pixels
- `icon-512.png` - 512x512 pixels

### Creating Icons

1. **Using an existing image:**
   - Use your `pg-logo.png` or any existing logo
   - Resize it to 192x192 and 512x512 pixels
   - Save as `icon-192.png` and `icon-512.png` in the `public` directory

2. **Using online tools:**
   - Visit https://realfavicongenerator.net/
   - Upload your logo/image
   - Generate icons in the required sizes
   - Download and place them in the `public` directory

3. **Using ImageMagick (command line):**
   ```bash
   # Convert existing image to 192x192
   convert pg-logo.png -resize 192x192 icon-192.png
   
   # Convert existing image to 512x512
   convert pg-logo.png -resize 512x512 icon-512.png
   ```

## PWA Features Implemented

### 1. Installation

- **Android**: Users will see an install prompt on the dashboard
- **iOS**: Users see instructions to add to home screen
- Install prompt automatically appears when user is logged in
- App can be installed to home screen/desktop

### 2. Declarative Web Push

- Test page available at `/pwa-test/push`
- Only works when app is installed as PWA
- Requires Safari 18.4+ on iOS for full support
- Allows push notifications without service worker

### 3. View Transitions

- Cross-fade animations between pages
- Automatically applied when navigating between routes
- Smooth transitions using View Transitions API
- CSS animations defined in `globals.css`

## Service Worker

The service worker (`public/sw.js`) is automatically registered when the app loads. It provides:

- Offline support
- Caching of static assets
- Background sync capabilities

## Manifest Configuration

The `manifest.json` file is configured with:

- App name: "Public Gold CRM"
- Start URL: `/dashboard` (protected route, redirects to login if not authenticated)
- Display mode: Standalone
- Theme color: Blue (#2563eb)
- Icons: 192x192 and 512x512 (you need to create these)

## Testing PWA Features

1. **Install the app:**
   - Run `npm run dev`
   - Open http://localhost:3000
   - Log in to your account
   - Look for the install prompt on the dashboard

2. **Test Declarative Web Push:**
   - After installing, visit `/pwa-test/push`
   - Subscribe to push notifications
   - Send a test notification

3. **Test View Transitions:**
   - Navigate between pages (Dashboard, Profile, etc.)
   - You should see smooth cross-fade transitions

## Production Deployment

For production:

1. Ensure your site is served over HTTPS (required for PWA)
2. Create and add the icon files (`icon-192.png`, `icon-512.png`)
3. Update the manifest.json with your production URL if needed
4. Test installation on both Android and iOS devices

## Browser Support

- **Installation**: Chrome, Edge, Safari (iOS), Samsung Internet
- **Declarative Web Push**: Safari 18.4+ on iOS (when installed)
- **View Transitions**: Chrome 111+, Edge 111+, Safari 18+

## References

- [PWA Installation Guide](https://whatpwacando.today/installation)
- [Declarative Web Push](https://whatpwacando.today/declarative-web-push)
- [View Transitions API](https://whatpwacando.today/view-transitions)

