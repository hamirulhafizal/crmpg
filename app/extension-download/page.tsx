'use client'

import { useAuth } from '@/app/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { UserProfileMenu } from '@/app/components/UserProfileMenu'

/** Replace with your user guide video ID (e.g. from YouTube) or set to empty to hide. */
const USER_GUIDE_VIDEO_ID = ''

type ExtensionVersionResponse = {
  latestVersion: string
  minVersion: string
  storeUrl: string
}

export default function ExtensionDownloadPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [downloading, setDownloading] = useState(false)
  const [versionInfo, setVersionInfo] = useState<ExtensionVersionResponse | null>(null)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return

    fetch('/api/extension/version')
      .then((res) => res.json())
      .then((data: ExtensionVersionResponse) => setVersionInfo(data))
      .catch(() => setVersionInfo(null))
  }, [user])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await fetch('/api/extension/download', { credentials: 'include' })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'CRMPG-by-KEM.zip'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      window.open('/api/extension/download', '_blank')
    } finally {
      setDownloading(false)
    }
  }

  const storeUrl = versionInfo?.storeUrl || ''

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
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="text-slate-600 hover:text-slate-900 flex items-center gap-2 text-sm font-medium">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </Link>
            <UserProfileMenu />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200/50 mb-8">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h1 className="text-2xl font-semibold text-slate-900">Chrome Extension (CRMPG by KEM)</h1>
            {versionInfo?.latestVersion && (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                Latest v{versionInfo.latestVersion}
              </span>
            )}
          </div>
          <p className="text-slate-600 mb-6">
            Install the extension from the Chrome Web Store to sync customer data from the PG Mall business center page into CRMPG. Updates are delivered automatically by Chrome.
          </p>

          {storeUrl ? (
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 min-w-[240px] px-6 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl shadow-md hover:shadow-lg border border-blue-700/50 transition-all duration-200 active:scale-[0.98]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Install from Chrome Web Store
            </a>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-4">
              Chrome Web Store URL is not configured yet. Set `CHROME_WEB_STORE_EXTENSION_URL` in Vercel after the first publish.
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Install steps</h2>
            <ol className="list-decimal list-inside space-y-2 text-slate-600 text-sm">
              <li>Open the Chrome Web Store link above.</li>
              <li>Click <strong>Add to Chrome</strong>.</li>
              <li>Pin the extension to the toolbar for easy access.</li>
              <li>Open the PG Mall business center Group Detail page and click the extension icon.</li>
              <li>Login with your CRMPG email and password.</li>
              <li>Click <strong>Sync to CRMPG</strong> to sync customer data.</li>
              <li>Use <strong>Check for updates</strong> in the popup if you need to refresh immediately.</li>
            </ol>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Developer fallback (ZIP)</h2>
            <p className="text-slate-600 text-sm mb-4">
              Only use the ZIP flow for local development. End users should install from the Chrome Web Store so updates are automatic.
            </p>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center justify-center gap-2 min-w-[200px] px-6 py-3 bg-white hover:bg-slate-50 text-slate-800 font-medium rounded-xl border border-slate-300 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {downloading ? 'Preparing...' : 'Download extension ZIP (dev only)'}
            </button>
          </div>
        </div>

        {USER_GUIDE_VIDEO_ID && (
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200/50">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">User guide</h2>
            <div className="aspect-video w-full max-w-3xl rounded-xl overflow-hidden bg-slate-900">
              <iframe
                title="Extension user guide"
                src={`https://www.youtube.com/embed/${USER_GUIDE_VIDEO_ID}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
