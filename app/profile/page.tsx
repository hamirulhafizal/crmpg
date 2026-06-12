'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/app/contexts/auth-context'
import { createClient } from '@/app/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type ProfileRow = {
  id: string
  full_name: string | null
  avatar_url: string | null
  pgcode: string | null
  phone: string | null
  username_pbo: string | null
  timezone: string | null
  locale: string | null
  gmail_message: string | null
  gmail_app_password: string | null
}

export default function ProfilePage() {
  const { user, loading: authLoading, refreshUser } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toasts, setToasts] = useState<Array<{ id: number; type: 'success' | 'error'; text: string }>>([])
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [fullName, setFullName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [pgcode, setPgcode] = useState('')
  const [usernamePbo, setUsernamePbo] = useState('')
  const [timezone, setTimezone] = useState('')
  const [locale, setLocale] = useState('en')
  const [gmailMessage, setGmailMessage] = useState('')
  const [gmailAppPassword, setGmailAppPassword] = useState('')

  const pushToast = (type: 'success' | 'error', text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((prev) => [...prev, { id, type, text }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      setEmail(user.email || '')
      const fallbackPhone = user.user_metadata?.phone || ''
      setPhone(fallbackPhone)
    }
  }, [user])

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.id) return
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select(
            'id, full_name, avatar_url, pgcode, phone, username_pbo, timezone, locale, gmail_message, gmail_app_password'
          )
          .eq('id', user.id)
          .maybeSingle()

        if (error) throw error
        if (!data) return

        const row = data as ProfileRow
        setProfile(row)
        setFullName(row.full_name || '')
        setAvatarUrl(row.avatar_url || '')
        setPgcode(row.pgcode || '')
        setUsernamePbo(row.username_pbo || '')
        setPhone(row.phone || user.user_metadata?.phone || '')
        setTimezone(row.timezone || '')
        setLocale(row.locale || 'en')
        setGmailMessage(row.gmail_message || '')
        setGmailAppPassword(row.gmail_app_password || '')
      } catch (err) {
        console.error('Failed to load profile:', err)
      } finally {
        setLoading(false)
      }
    }

    void loadProfile()
  }, [user?.id, supabase, user?.user_metadata?.phone])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const emailChanged = email !== user?.email
      const phoneChanged = phone !== (profile?.phone || user?.user_metadata?.phone || '')
      const profileChanged =
        fullName !== (profile?.full_name || '') ||
        avatarUrl !== (profile?.avatar_url || '') ||
        pgcode !== (profile?.pgcode || '') ||
        usernamePbo !== (profile?.username_pbo || '') ||
        timezone !== (profile?.timezone || '') ||
        locale !== (profile?.locale || 'en') ||
        gmailMessage !== (profile?.gmail_message || '') ||
        gmailAppPassword !== (profile?.gmail_app_password || '') ||
        phoneChanged
      
      // Only proceed if there are changes
      if (!emailChanged && !profileChanged) {
        pushToast('error', 'No changes detected.')
        setSaving(false)
        return
      }

      const updates: { email?: string; data?: Record<string, any> } = {}

      // Update email if changed
      if (emailChanged) {
        updates.email = email
      }

      // Update phone in metadata if changed (always include existing metadata)
      if (phoneChanged) {
        updates.data = {
          ...user?.user_metadata,
          phone: phone || null,
        }
      } else if (emailChanged && user?.user_metadata) {
        // Preserve existing metadata when only email changes
        updates.data = user.user_metadata
      }

      const { error } = await supabase.auth.updateUser(updates)

      if (error) throw error

      if (profileChanged) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: fullName.trim() || null,
            avatar_url: avatarUrl.trim() || null,
            pgcode: pgcode.trim() || null,
            username_pbo: usernamePbo.trim() || null,
            phone: phone.trim() || null,
            timezone: timezone.trim() || null,
            locale: locale.trim() || 'en',
            gmail_message: gmailMessage.trim() || null,
            gmail_app_password: gmailAppPassword.trim() || null,
          })
          .eq('id', user!.id)

        if (profileError) throw profileError
      }

      const successMessage =
        email !== user?.email
          ? 'Profile updated! Please check your email to verify the new email address.'
          : 'Profile updated successfully!'
      pushToast('success', successMessage)

      // Refresh user data
      await refreshUser()
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              full_name: fullName.trim() || null,
              avatar_url: avatarUrl.trim() || null,
              pgcode: pgcode.trim() || null,
              username_pbo: usernamePbo.trim() || null,
              phone: phone.trim() || null,
              timezone: timezone.trim() || null,
              locale: locale.trim() || 'en',
              gmail_message: gmailMessage.trim() || null,
              gmail_app_password: gmailAppPassword.trim() || null,
            }
          : prev
      )

    } catch (error: any) {
      pushToast('error', error.message || 'Failed to update profile.')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 text-blue-600 mx-auto"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="fixed right-4 top-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`min-w-[260px] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg ${
              toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-slate-600 hover:text-slate-900 transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </Link>
              <h1 className="text-2xl font-semibold text-slate-900">Edit Profile</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200">
          {/* Profile Form */}
          <form onSubmit={handleUpdateProfile} className="space-y-6">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={saving}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all duration-200 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="mt-2 text-xs text-slate-500">
                {email !== user.email
                  ? 'You will receive a verification email at the new address.'
                  : 'Your current email address'}
              </p>
            </div>

          {/* Profile Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-slate-700 mb-2">
                Display Name
              </label>
              <input
                id="full_name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Personal branding (e.g Hamirul Hafizal / Dr Muaz)"
                disabled={saving || loading}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all duration-200 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label htmlFor="avatar_url" className="block text-sm font-medium text-slate-700 mb-2">
                Avatar URL
              </label>
              <input
                id="avatar_url"
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                disabled={saving || loading}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all duration-200 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label htmlFor="pgcode" className="block text-sm font-medium text-slate-700 mb-2">
                PG Code
              </label>
              <input
                id="pgcode"
                type="text"
                value={pgcode}
                onChange={(e) => setPgcode(e.target.value)}
                placeholder="PG00123456"
                disabled={saving || loading}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all duration-200 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label htmlFor="username_pbo" className="block text-sm font-medium text-slate-700 mb-2">
                pg2u.my/your-username
              </label>
              <input
                id="username_pbo"
                type="text"
                value={usernamePbo}
                onChange={(e) => setUsernamePbo(e.target.value)}
                placeholder="Dealer display username"
                disabled={saving || loading}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all duration-200 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Phone Field */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-2">
                Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+60123456789"
                disabled={saving}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all duration-200 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="mt-2 text-xs text-slate-500">
                Used for account recovery and lead routing.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="timezone" className="block text-sm font-medium text-slate-700 mb-2">
                  Timezone
                </label>
                <input
                  id="timezone"
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Asia/Kuala_Lumpur"
                  disabled={saving || loading}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all duration-200 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label htmlFor="locale" className="block text-sm font-medium text-slate-700 mb-2">
                  Locale
                </label>
                <input
                  id="locale"
                  type="text"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  placeholder="en"
                  disabled={saving || loading}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all duration-200 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label htmlFor="gmail_message" className="block text-sm font-medium text-slate-700 mb-2">
                Gmail Signature / Message
              </label>
              <textarea
                id="gmail_message"
                value={gmailMessage}
                onChange={(e) => setGmailMessage(e.target.value)}
                rows={3}
                placeholder="Optional footer message for Gmail flows"
                disabled={saving || loading}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all duration-200 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label htmlFor="gmail_app_password" className="block text-sm font-medium text-slate-700 mb-2">
                Gmail App Password
              </label>
              <input
                id="gmail_app_password"
                type="password"
                value={gmailAppPassword}
                onChange={(e) => setGmailAppPassword(e.target.value)}
                placeholder="Optional app password"
                disabled={saving || loading}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all duration-200 text-slate-900 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Submit Button */}
            <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-200">
              <Link
                href="/dashboard"
                className="px-6 py-3 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all duration-200"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving || loading}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40"
              >
                {saving ? (
                  <span className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Saving...
                  </span>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </form>

          {/* Account Information */}
          <div className="mt-8 pt-8 border-t border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Account Information</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">User ID</span>
                <span className="text-slate-900 font-mono text-xs">{user.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Account Created</span>
                <span className="text-slate-900">
                  {new Date(user.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Last Sign In</span>
                <span className="text-slate-900">
                  {user.last_sign_in_at
                    ? new Date(user.last_sign_in_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Never'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

