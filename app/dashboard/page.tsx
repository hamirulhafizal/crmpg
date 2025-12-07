'use client'

import { useAuth } from '@/app/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import PWAInstallPrompt from '@/app/components/PWAInstallPrompt'
import PWAInstallButton from '@/app/components/PWAInstallButton'

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
            <div className="flex items-center gap-3">
              <Link
                href="/excel-processor"
                className="hidden px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all duration-200 active:scale-[0.98] flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Excel Processor
              </Link>
              <PWAInstallButton />
              <button
                onClick={handleSignOut}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-200 active:scale-[0.98]"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-col gap-5 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200/50">
          <h2 className="text-3xl font-semibold text-slate-900 mb-2">
            Welcome back{user.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}!
          </h2>
          <p className="text-slate-600">You&apos;re successfully signed in to your account.</p>
        </div>

        {/* Tools Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200/50">
          <h3 className="text-xl font-semibold text-slate-900 mb-6">Tools</h3>
          <div className="space-y-3">
            <Link
              href="/excel-processor"
              className="block px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 text-slate-700 font-medium rounded-xl transition-all duration-200 active:scale-[0.98] border border-blue-200"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <span className="font-semibold text-slate-900">Excel Processor</span>
                    <p className="text-xs text-slate-600">Upload Excel/CSV and process with OpenAI</p>
                  </div>
                </div>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
            <Link
              href="/pwa-test/push"
              className="hidden md:block px-4 py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium rounded-xl transition-all duration-200 active:scale-[0.98]"
            >
              <div className="hidden md:flex items-center justify-between">
                <span>Test Declarative Web Push</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          </div>
        </div>

        {/* User Info Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200/50">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-slate-900">Account Information</h3>
            <Link
              href="/profile"
              className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all duration-200 active:scale-[0.98]"
            >
              Edit Profile
            </Link>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <p className="text-slate-900">{user.email}</p>
            </div>
            {user.user_metadata?.phone && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <p className="text-slate-900">{user.user_metadata.phone}</p>
              </div>
            )}
            {user.user_metadata?.avatar_url && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Profile Picture</label>
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Profile"
                  className="w-16 h-16 rounded-full border-2 border-slate-200"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">User ID</label>
              <p className="text-sm text-slate-600 font-mono">{user.id}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Account Created</label>
              <p className="text-slate-600">
                {new Date(user.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>

      </main>

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
    </div>
  )
}

