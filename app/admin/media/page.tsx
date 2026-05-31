'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { adminFetch } from '@/app/lib/admin-api-client'

type MediaType = 'all' | 'image' | 'audio' | 'video' | 'pdf'

type MediaAsset = {
  id: string
  title: string
  originalFilename: string
  mediaType: Exclude<MediaType, 'all'>
  mimeType: string
  sizeBytes: number
  publicUrl: string
  folder: string
  createdAt: string
}

type SizeLimitsMb = {
  image: number
  audio: number
  pdf: number
  video: number
}

const TABS: { id: MediaType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'pdf', label: 'PDF' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function typeBadgeClass(type: MediaAsset['mediaType']): string {
  switch (type) {
    case 'image':
      return 'bg-sky-50 text-sky-700 ring-sky-200'
    case 'audio':
      return 'bg-violet-50 text-violet-700 ring-violet-200'
    case 'video':
      return 'bg-rose-50 text-rose-700 ring-rose-200'
    case 'pdf':
      return 'bg-amber-50 text-amber-800 ring-amber-200'
  }
}

export default function AdminMediaPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [tab, setTab] = useState<MediaType>('all')
  const [search, setSearch] = useState('')
  const [folderFilter, setFolderFilter] = useState('')
  const [uploadFolder, setUploadFolder] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [r2Configured, setR2Configured] = useState(false)
  const [secretConfigured, setSecretConfigured] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [s3Endpoint, setS3Endpoint] = useState('')
  const [publicUrl, setPublicUrl] = useState('')
  const [bucketName, setBucketName] = useState('publicgolds')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [sizeLimitsMb, setSizeLimitsMb] = useState<SizeLimitsMb>({
    image: 10,
    audio: 25,
    pdf: 20,
    video: 100,
  })

  const [editOpen, setEditOpen] = useState(false)
  const [editAsset, setEditAsset] = useState<MediaAsset | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editFolder, setEditFolder] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const [copiedId, setCopiedId] = useState<string | null>(null)

  const loadAssets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (tab !== 'all') params.set('type', tab)
      if (folderFilter.trim()) params.set('folder', folderFilter.trim())
      if (search.trim()) params.set('q', search.trim())
      const res = await adminFetch(`/api/admin/media?${params.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load media')
      setAssets(data.assets ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load media')
    } finally {
      setLoading(false)
    }
  }, [folderFilter, search, tab])

  useEffect(() => {
    void loadAssets()
  }, [loadAssets])

  useEffect(() => {
    void (async () => {
      try {
        const res = await adminFetch('/api/admin/media/settings')
        const data = await res.json().catch(() => ({}))
        if (res.ok) setR2Configured(Boolean(data.configured))
      } catch {
        // ignore
      }
    })()
  }, [])

  const folders = useMemo(() => {
    const set = new Set<string>()
    for (const asset of assets) {
      if (asset.folder) set.add(asset.folder)
    }
    return [...set].sort()
  }, [assets])

  const openSettings = async () => {
    setSettingsOpen(true)
    setSettingsLoading(true)
    setSettingsError(null)
    setSecretAccessKey('')
    try {
      const res = await adminFetch('/api/admin/media/settings')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load settings')
      setAccountId(data.settings?.accountId ?? '')
      setS3Endpoint(data.settings?.s3Endpoint ?? '')
      setPublicUrl(data.settings?.publicUrl ?? '')
      setBucketName(data.settings?.bucketName ?? 'publicgolds')
      setAccessKeyId(data.settings?.accessKeyId ?? '')
      setSizeLimitsMb(data.settings?.sizeLimitsMb ?? sizeLimitsMb)
      setR2Configured(Boolean(data.configured))
      setSecretConfigured(Boolean(data.secretConfigured))
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setSettingsLoading(false)
    }
  }

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSettingsSaving(true)
    setSettingsError(null)
    try {
      const res = await adminFetch('/api/admin/media/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          s3Endpoint,
          publicUrl,
          bucketName,
          accessKeyId,
          secretAccessKey,
          sizeLimitsMb,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setR2Configured(Boolean(data.configured))
      setSecretConfigured(Boolean(data.secretConfigured))
      setSecretAccessKey('')
      setMessage('R2 media settings saved.')
      setSettingsOpen(false)
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSettingsSaving(false)
    }
  }

  const uploadFiles = async (files: FileList | File[]) => {
    if (!files.length) return
    setUploading(true)
    setError(null)
    setMessage(null)
    try {
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append('file', file)
        if (uploadFolder.trim()) form.append('folder', uploadFolder.trim())
        const res = await adminFetch('/api/admin/media', { method: 'POST', body: form })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `Upload failed: ${file.name}`)
      }
      setMessage(`Uploaded ${files.length} file(s).`)
      await loadAssets()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const copyUrl = async (asset: MediaAsset) => {
    try {
      await navigator.clipboard.writeText(asset.publicUrl)
      setCopiedId(asset.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setError('Could not copy URL')
    }
  }

  const deleteAsset = async (asset: MediaAsset) => {
    if (!confirm(`Delete "${asset.title}"? This removes the file from R2.`)) return
    setError(null)
    try {
      const res = await adminFetch(`/api/admin/media/${asset.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      setMessage('Media deleted.')
      await loadAssets()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const openEdit = (asset: MediaAsset) => {
    setEditAsset(asset)
    setEditTitle(asset.title)
    setEditFolder(asset.folder)
    setEditOpen(true)
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editAsset) return
    setEditSaving(true)
    setError(null)
    try {
      const res = await adminFetch(`/api/admin/media/${editAsset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim(), folder: editFolder.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Update failed')
      setEditOpen(false)
      setEditAsset(null)
      setMessage('Media updated.')
      await loadAssets()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">Media library</h1>
            <button
              type="button"
              onClick={() => void openSettings()}
              aria-label="R2 media settings"
              title="R2 media settings"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Upload and manage public media on Cloudflare R2 (images, audio, video, PDF).
          </p>
        </div>
        {!r2Configured && (
          <button
            type="button"
            onClick={() => void openSettings()}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
          >
            Configure R2 first
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {message}
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files)
          }}
          className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
            dragOver ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 bg-slate-50/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,audio/*,video/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void uploadFiles(e.target.files)
            }}
          />
          <p className="text-sm font-medium text-slate-800">Drop files here or choose from device</p>
          <p className="mt-1 text-xs text-slate-500">Image, audio, video, PDF — limits adjustable in settings</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <input
              value={uploadFolder}
              onChange={(e) => setUploadFolder(e.target.value)}
              placeholder="Folder (optional) e.g. promos/2026"
              className="w-full max-w-xs rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={uploading || !r2Configured}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Choose files'}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
                  tab === t.id
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or filename"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              placeholder="Filter folder"
              list="media-folders"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <datalist id="media-folders">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Loading media…</p>
        ) : assets.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">No media yet. Upload your first file above.</p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {assets.map((asset) => (
              <article
                key={asset.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex aspect-video items-center justify-center bg-slate-100">
                  {asset.mediaType === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.publicUrl} alt={asset.title} className="h-full w-full object-cover" />
                  ) : asset.mediaType === 'video' ? (
                    <video src={asset.publicUrl} className="h-full w-full object-cover" controls preload="metadata" />
                  ) : asset.mediaType === 'audio' ? (
                    <div className="w-full p-4">
                      <audio src={asset.publicUrl} controls className="w-full" preload="metadata" />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 p-4 text-slate-600">
                      <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs font-medium uppercase">PDF</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{asset.title}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ring-1 ${typeBadgeClass(asset.mediaType)}`}>
                      {asset.mediaType}
                    </span>
                  </div>
                  <p className="truncate text-xs text-slate-500">{asset.originalFilename}</p>
                  <p className="text-xs text-slate-400">
                    {formatBytes(asset.sizeBytes)}
                    {asset.folder ? ` · ${asset.folder}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void copyUrl(asset)}
                      className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    >
                      {copiedId === asset.id ? 'Copied!' : 'Copy URL'}
                    </button>
                    <a
                      href={asset.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    >
                      Open
                    </a>
                    <button
                      type="button"
                      onClick={() => openEdit(asset)}
                      className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteAsset(asset)}
                      className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm top-[-2rem]">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">R2 media settings</h3>
                <p className="mt-1 text-sm text-slate-600">Stored in Supabase. Bucket: publicgolds</p>
              </div>
              <button type="button" onClick={() => setSettingsOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">×</button>
            </div>
            {settingsLoading ? (
              <p className="mt-6 text-sm text-slate-500">Loading…</p>
            ) : (
              <form onSubmit={saveSettings} className="mt-5 space-y-4">
                {settingsError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{settingsError}</p>}
                <div>
                  <label className="block text-sm font-medium text-slate-700">Account ID</label>
                  <input value={accountId} onChange={(e) => setAccountId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">S3 API endpoint</label>
                  <input value={s3Endpoint} onChange={(e) => setS3Endpoint(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Public URL</label>
                  <input value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Bucket name</label>
                  <input value={bucketName} onChange={(e) => setBucketName(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Access key ID</label>
                  <input value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Secret access key</label>
                  <input
                    type="password"
                    value={secretAccessKey}
                    onChange={(e) => setSecretAccessKey(e.target.value)}
                    placeholder={secretConfigured ? 'Leave blank to keep current' : 'Required'}
                    required={!secretConfigured}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(['image', 'audio', 'pdf', 'video'] as const).map((key) => (
                    <div key={key}>
                      <label className="block text-xs font-medium capitalize text-slate-700">{key} limit (MB)</label>
                      <input
                        type="number"
                        min={1}
                        max={2048}
                        value={sizeLimitsMb[key]}
                        onChange={(e) =>
                          setSizeLimitsMb((prev) => ({
                            ...prev,
                            [key]: Number(e.target.value) || prev[key],
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setSettingsOpen(false)} className="rounded-xl px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">Cancel</button>
                  <button type="submit" disabled={settingsSaving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                    {settingsSaving ? 'Saving…' : 'Save settings'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {editOpen && editAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Edit media</h3>
            <form onSubmit={saveEdit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Title</label>
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Folder</label>
                <input value={editFolder} onChange={(e) => setEditFolder(e.target.value)} placeholder="e.g. promos/2026" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <p className="mt-1 text-xs text-slate-500">Moving folder re-organizes the file in R2.</p>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditOpen(false)} className="rounded-xl px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={editSaving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
