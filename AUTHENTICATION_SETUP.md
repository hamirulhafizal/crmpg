# Authentication Setup Guide

This project uses Supabase for authentication with support for:
- Magic Link (passwordless email authentication)
- Google OAuth
- Email/Password registration
- Forgot Password / Password Reset

## Environment Variables

Add the following to your `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

You can find these values in your Supabase project dashboard under Settings → API.

## Supabase Configuration

### 1. Enable Email Provider
1. Go to your Supabase dashboard
2. Navigate to Authentication → Providers
3. Enable the "Email" provider

### 2. Configure Magic Link
1. In the Email provider settings, enable "Enable email confirmations"
2. Set up your email templates (optional, Supabase provides defaults)
3. Configure the redirect URL to: `http://localhost:3000/auth/callback` (for development) and your production URL

### 3. Enable Google OAuth
1. Go to Authentication → Providers in your Supabase dashboard
2. Enable the "Google" provider
3. You'll need to set up OAuth credentials:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable Google+ API
   - Create OAuth 2.0 credentials (OAuth client ID)
   - Add authorized redirect URIs:
     - Development: `https://your-project-ref.supabase.co/auth/v1/callback`
     - Production: `https://your-project-ref.supabase.co/auth/v1/callback`
   - Copy the Client ID and Client Secret to your Supabase Google provider settings

### 4. Configure Redirect URLs
In your Supabase dashboard under Authentication → URL Configuration:
- Add your site URL (e.g., `http://localhost:3000` for development)
- Add redirect URLs:
  - `http://localhost:3000/auth/callback` (development)
  - `http://localhost:3000/reset-password` (development - for password reset)
  - `https://yourdomain.com/auth/callback` (production)
  - `https://yourdomain.com/reset-password` (production - for password reset)

## Pages Created

### `/login`
- Magic link authentication
- Google OAuth sign-in
- Redirects to `/dashboard` if already authenticated

### `/register`
- Email/password registration
- Magic link option
- Google OAuth sign-up
- Redirects to `/dashboard` if already authenticated

### `/dashboard`
- Protected route (requires authentication)
- Shows user information
- Sign out functionality
- Redirects to `/login` if not authenticated

### `/forgot-password`
- Allows users to request a password reset link
- Sends reset email via Supabase
- White theme design

### `/reset-password`
- Allows users to set a new password after clicking the reset link from email
- Validates password requirements
- Redirects to login after successful reset
- White theme design

### `/auth/callback`
- Handles OAuth and magic link callbacks
- Redirects users after successful authentication

## Authentication Flow

1. **Magic Link**: User enters email → receives email with magic link → clicks link → redirected to `/auth/callback` → authenticated

2. **Google OAuth**: User clicks "Sign in with Google" → redirected to Google → grants permission → redirected to `/auth/callback` → authenticated

3. **Email/Password**: User enters email and password → account created → confirmation email sent → user confirms → can sign in

4. **Forgot Password**: User clicks "Forgot password?" on login page → enters email → receives reset link → clicks link → redirected to `/reset-password` → sets new password → redirected to login

## Middleware Protection

The middleware automatically:
- Protects `/dashboard` routes (redirects to `/login` if not authenticated)
- Redirects authenticated users away from `/login` and `/register` pages
- Allows access to `/forgot-password` and `/reset-password` pages for all users

## Using Authentication in Components

```tsx
'use client'

import { useAuth } from '@/app/contexts/auth-context'

export default function MyComponent() {
  const { user, loading, signOut } = useAuth()

  if (loading) return <div>Loading...</div>
  if (!user) return <div>Please sign in</div>

  return (
    <div>
      <p>Welcome, {user.email}!</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  )
}
```

## Server Components

For server components, use the server client:

```tsx
import { createClient } from '@/app/lib/supabase/server'

export default async function ServerComponent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <div>Welcome, {user.email}!</div>
}
```

