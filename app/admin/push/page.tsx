'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { adminFetch } from '@/app/lib/admin-api-client'
import {
  buildDeclarativePushPayloadObject,
  type DeclarativePushPayload,
} from '@/app/lib/push/payload'
import { AdminPushDeviceTest } from '@/app/admin/push/AdminPushDeviceTest'

type BroadcastResult = {
  sent: number
  failed: number
  total: number
  pruned?: number
  errors?: string[]
  message?: string
}

function ClearAllSubscriptionsButton({
  count,
  onCleared,
}: {
  count: number
  onCleared: () => void
}) {
  const [clearing, setClearing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleClear = async () => {
    setClearing(true)
    try {
      const res = await adminFetch('/api/admin/push/subscriptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to clear subscriptions')
      setConfirmOpen(false)
      onCleared()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to clear subscriptions')
    } finally {
      setClearing(false)
    }
  }

  if (!confirmOpen) {
    return (
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
      >
        Clear all from database
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p className="font-medium">Delete all {count} subscription record(s)?</p>
      <p className="mt-1 text-xs text-red-800">
        This only removes database rows. Devices must also reset their browser subscription to subscribe again.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void handleClear()}
          disabled={clearing}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {clearing ? 'Deleting…' : 'Yes, delete all'}
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(false)}
          disabled={clearing}
          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function AdminPushPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('PG CRM test')
  const [message, setMessage] = useState('')
  const [navigateUrl, setNavigateUrl] = useState('/dashboard')
  const [imageUrl, setImageUrl] = useState('')
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BroadcastResult | null>(null)

  const payloadPreview: DeclarativePushPayload = buildDeclarativePushPayloadObject({
    title: title.trim() || 'Title',
    body: message.trim() || 'Message body',
    navigateUrl: navigateUrl.trim() || '/dashboard',
    imageUrl: imageUrl.trim() || undefined,
    tag: 'admin-broadcast',
  })

  const loadCount = useCallback(async () => {
    setLoadingCount(true)
    try {
      const res = await adminFetch('/api/admin/push/broadcast')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load subscribers')
      setSubscriberCount(data.count ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load subscribers')
    } finally {
      setLoadingCount(false)
    }
  }, [])

  useEffect(() => {
    void loadCount()
  }, [loadCount])

  const uploadImage = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('folder', 'push-notifications')
      form.append('title', file.name.replace(/\.[^.]+$/, '') || 'Push image')

      const res = await adminFetch('/api/admin/media', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Upload failed')

      const url = data.asset?.publicUrl as string | undefined
      if (!url) throw new Error('Upload succeeded but no public URL returned')
      setImageUrl(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    setError(null)
    setResult(null)

    try {
      const res = await adminFetch('/api/admin/push/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          navigateUrl: navigateUrl.trim(),
          imageUrl: imageUrl.trim() || undefined,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Broadcast failed')

      setResult(data as BroadcastResult)
      await loadCount()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Broadcast failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Declarative Web Push</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
          Broadcast RFC 8030 declarative push messages. The operating system displays notifications
          directly from the JSON payload — no service worker push handler required on installed PWAs
          (iOS 18.4+).{' '}
          <a
            href="https://progressier.com/pwa-capabilities/declarative-web-push"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 hover:underline"
          >
            Learn more
          </a>
        </p>
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-5 text-sm text-blue-950">
        <p className="font-medium">How it works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-blue-900">
          <li>Users install the PWA and enable notifications (via <code className="text-xs">window.pushManager</code>).</li>
          <li>You send a declarative JSON payload with <code className="text-xs">web_push: 8030</code>.</li>
          <li>The OS shows the notification even if the app is killed — no SW JavaScript runs.</li>
        </ol>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Active subscribers</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
              {loadingCount ? '…' : (subscriberCount ?? 0)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Device-only subscriptions (not linked to user accounts)</p>
          </div>
          {(subscriberCount ?? 0) > 0 ? (
            <ClearAllSubscriptionsButton
              count={subscriberCount ?? 0}
              onCleared={() => void loadCount()}
            />
          ) : null}
        </div>
      </div>

      <AdminPushDeviceTest title={title} message={message} onSubscriptionsChanged={() => void loadCount()} />

      <form onSubmit={handleSend} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        <div>
          <label htmlFor="push-title" className="mb-2 block text-sm font-medium text-slate-700">
            Title
          </label>
          <input
            id="push-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div>
          <label htmlFor="push-message" className="mb-2 block text-sm font-medium text-slate-700">
            Message
          </label>
          <textarea
            id="push-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            rows={4}
            maxLength={500}
            placeholder="Notification body text"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div>
          <label htmlFor="push-url" className="mb-2 block text-sm font-medium text-slate-700">
            Open URL when tapped
          </label>
          <input
            id="push-url"
            value={navigateUrl}
            onChange={(e) => setNavigateUrl(e.target.value)}
            placeholder="/dashboard or https://…"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Image (optional)</label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void uploadImage(file)
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload to media library'}
            </button>
            {imageUrl ? (
              <button
                type="button"
                onClick={() => setImageUrl('')}
                className="text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                Remove image
              </button>
            ) : null}
          </div>
          {imageUrl ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Notification preview" className="max-h-40 rounded-lg object-contain" />
              <p className="mt-2 truncate text-xs text-slate-500">{imageUrl}</p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Uploaded to R2 folder: push-notifications</p>
          )}
        </div>

        <button
          type="submit"
          disabled={sending || !title.trim() || !message.trim()}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
        >
          {sending ? 'Sending…' : 'Send declarative push to all subscribers'}
        </button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <p className="text-sm font-medium text-slate-700">Declarative payload preview (RFC 8030)</p>
        <pre className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-800">
          {JSON.stringify(payloadPreview, null, 2)}
        </pre>
      </div>

      {result ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
          <p className="font-semibold">{result.message || 'Broadcast complete'}</p>
          <p className="mt-2 tabular-nums">
            Sent: {result.sent} · Failed: {result.failed} · Total: {result.total}
            {result.pruned ? ` · Removed expired: ${result.pruned}` : ''}
          </p>
          {result.errors?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-emerald-800">
              {result.errors.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
