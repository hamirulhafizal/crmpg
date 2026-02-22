'use client'

import { useAuth } from '@/app/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

/** Replace with your user guide video ID (e.g. from YouTube) or set to empty to hide. */
const USER_GUIDE_VIDEO_ID = ''

export default function ExtensionDownloadPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

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
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200/50 mb-8">
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Chrome Extension (CRMPG by KEM)</h1>
          <p className="text-slate-600 mb-6">
            Download the extension to sync customer data from the PG Mall business center page into CRMPG, with OpenAI processing and Supabase auth.
          </p>

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-2 min-w-[200px] px-6 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl shadow-md hover:shadow-lg border border-blue-700/50 transition-all duration-200 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
          >
            {downloading ? (
              <>
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Preparing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download extension (ZIP)
              </>
            )}
          </button>

          <div className="mt-8 pt-6 border-t border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Install steps</h2>
            <ol className="list-decimal list-inside space-y-2 text-slate-600 text-sm">
              <li>Unzip the downloaded file.</li>
              <li>Open Chrome and go to <code className="bg-slate-100 px-1.5 py-0.5 rounded">chrome://extensions/</code>.</li>
              <li>Turn on <strong>Developer mode</strong> (top right).</li>
              <li>Click <strong>Load unpacked</strong> and select the unzipped folder.</li>
              <li>Pin the extension to the toolbar for easy access.</li>
              <li>Open the PG Mall business center Group Detail page and click the extension icon.</li>
              <li>Login with your email and password.</li>
              <li>Click the "Sync to CRMPG" button to sync the customer data to CRMPG.</li>
            </ol>
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

        {/* {!USER_GUIDE_VIDEO_ID && (
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200/50">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">User guide</h2>
            <div className="aspect-video w-full max-w-3xl rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
              <p className="text-slate-500 text-sm">Video placeholder. Set <code className="bg-slate-200 px-1.5 py-0.5 rounded">USER_GUIDE_VIDEO_ID</code> in this page to embed a YouTube guide.</p>
            </div>
          </div>
        )} */}
      </main>
    </div>
  )
}
