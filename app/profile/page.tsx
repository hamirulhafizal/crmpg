'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/app/contexts/auth-context'
import { createClient } from '@/app/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ProfilePage() {
  const { user, loading: authLoading, refreshUser } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      setEmail(user.email || '')
      setPhone(user.user_metadata?.phone || '')
    }
  }, [user])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const emailChanged = email !== user?.email
      const phoneChanged = phone !== (user?.user_metadata?.phone || '')
      
      // Only proceed if there are changes
      if (!emailChanged && !phoneChanged) {
        setMessage({
          type: 'error',
          text: 'No changes detected.',
        })
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

      setMessage({
        type: 'success',
        text: email !== user?.email
          ? 'Profile updated! Please check your email to verify the new email address.'
          : 'Profile updated successfully!',
      })

      // Refresh user data
      await refreshUser()

      // Clear message after 5 seconds
      setTimeout(() => {
        setMessage(null)
      }, 5000)
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.message || 'An error occurred. Please try again.',
      })
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
          {/* Message Alert */}
          {message && (
            <div
              className={`mb-6 p-4 rounded-xl transition-all duration-300 ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              <p className="text-sm font-medium">{message.text}</p>
            </div>
          )}

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
                Optional: Add your phone number for account recovery
              </p>
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

