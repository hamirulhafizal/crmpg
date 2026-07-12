'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { adminFetch } from '@/app/lib/admin-api-client'

type MediaAsset = {
  id: string
  title: string
  originalFilename: string
  publicUrl: string
  folder: string
}

type Props = {
  value: string
  onChange: (publicUrl: string) => void
  label?: string
  uploadFolder?: string
}

export function AdminMediaImagePicker({
  value,
  onChange,
  label = 'Notification image (optional)',
  uploadFolder = 'push-notifications',
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const loadImages = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ type: 'image' })
      if (search.trim()) params.set('q', search.trim())
      const res = await adminFetch(`/api/admin/media?${params.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? 'Admin access required to browse the media library.'
            : data.error || 'Failed to load media'
        )
      }
      setAssets(data.assets ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load media')
      setAssets([])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    if (!open) return
    void loadImages()
  }, [open, loadImages])

  const uploadImage = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('folder', uploadFolder)
      form.append('title', file.name.replace(/\.[^.]+$/, '') || 'Push image')

      const res = await adminFetch('/api/admin/media', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Upload failed')

      const url = data.asset?.publicUrl as string | undefined
      if (!url) throw new Error('Upload succeeded but no public URL returned')

      onChange(url)
      setOpen(false)
      await loadImages()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-slate-700">{label}</span>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
        >
          Choose from media library
        </button>
        <Link
          href="/admin/media"
          target="_blank"
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          Open media library
        </Link>
        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
          >
            Remove
          </button>
        ) : null}
      </div>

      {value ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Selected notification" className="max-h-40 w-full rounded-lg object-contain" />
          <p className="mt-2 break-all text-xs text-slate-500">{value}</p>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Pick an image from{' '}
          <Link href="/admin/media" className="font-medium text-blue-600 hover:underline">
            Admin → Media
          </Link>
          . Uses the public R2 URL in the push payload.
        </p>
      )}

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

      {open ? (
        <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close media picker"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900 sm:text-lg">Choose image</h3>
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">From admin media library</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search images…"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void loadImages()}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Search
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : 'Upload new'}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              ) : null}

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading images…
                </div>
              ) : assets.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">
                  No images found. Upload one in{' '}
                  <Link href="/admin/media" target="_blank" className="font-medium text-blue-600 hover:underline">
                    Media library
                  </Link>
                  .
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {assets.map((asset) => {
                    const selected = value === asset.publicUrl
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => {
                          onChange(asset.publicUrl)
                          setOpen(false)
                        }}
                        className={`overflow-hidden rounded-xl border text-left transition ${
                          selected
                            ? 'border-blue-500 ring-2 ring-blue-200'
                            : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="aspect-video bg-slate-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={asset.publicUrl}
                            alt={asset.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <p className="line-clamp-2 px-2 py-2 text-xs font-medium text-slate-800">
                          {asset.title}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
