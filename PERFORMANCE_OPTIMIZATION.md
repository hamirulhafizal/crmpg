# Performance Optimization Guide

## Current Strategy: Dynamic Rendering (No Caching)

This application uses **Dynamic Rendering** with no caching for real-time content updates.

### Key Benefits of Dynamic Rendering:

1. **Real-time Updates**: Content is fetched fresh on every request
2. **No Cache Issues**: Eliminates stale content problems
3. **Fair Rotation**: All users see the same dealer at the same time
4. **Immediate Updates**: Changes are reflected immediately
5. **Consistent Experience**: No cache-related inconsistencies

### Configuration:

- **Rendering Strategy**: `dynamic = 'force-dynamic'`
- **Caching Strategy**: `cache: 'no-store'` for all data fetching
- **Image Optimization**: Enabled with WebP and AVIF formats
- **Bundle Optimization**: Package imports optimized for React

### How It Works:

1. **Every Request**: Fresh data is fetched from APIs
2. **Server-side Rendering**: Pages are rendered on each request
3. **Real-time Content**: No cached content is served
4. **Fair Rotation**: Current index determines dealer selection

### Data Flow:

```
User Request → Fresh API Calls → Server-side Rendering → Dynamic Page Served
     ↓
Next Request → Fresh API Calls → Server-side Rendering → Updated Page Served
```

### Performance Features:

- **Server Components**: Reduced client-side JavaScript
- **Image Optimization**: Automatic WebP/AVIF conversion
- **Bundle Splitting**: Optimized package imports
- **Compression**: Enabled for faster transfers
- **Hydration Control**: Prevents hydration mismatches

### Monitoring:

- Check console logs for dealer rotation updates
- Monitor API response times
- Verify fair rotation across different users

### Deployment:

- Use `npm run build` to build the application
- Use `npm run start` to serve with dynamic rendering
- Pages fetch fresh content on every request