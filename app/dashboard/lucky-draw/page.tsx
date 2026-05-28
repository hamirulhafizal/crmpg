'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/app/contexts/auth-context'
import { luckyDrawPublicPath } from '@/app/lib/lucky-draw/slug'
import type {
  LuckyDrawPage,
  LuckyDrawPrize,
  LuckyDrawQuestion,
  LuckyDrawQuestionType,
} from '@/app/lib/lucky-draw/types'

const QUESTION_TYPES: { value: LuckyDrawQuestionType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'tag_picker', label: 'Tag picker' },
]

const emptyQuestion = (): LuckyDrawQuestion => ({
  sort_order: 0,
  question_type: 'text',
  question_text: '',
  is_required: true,
})

type EditorState = {
  id?: string
  title: string
  page_slug: string
  status: 'draft' | 'active' | 'closed'
  prizes: LuckyDrawPrize[]
  terms_and_conditions: string
  target_audience: string
  questions: LuckyDrawQuestion[]
}

function emptyEditor(): EditorState {
  return {
    title: 'Lucky Draw',
    page_slug: 'lucky-draw',
    status: 'draft',
    prizes: [{ name: '', description: '' }],
    terms_and_conditions: '',
    target_audience: '',
    questions: [],
  }
}

export default function LuckyDrawDashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [pages, setPages] = useState<LuckyDrawPage[]>([])
  const [dealerSlug, setDealerSlug] = useState('')
  const [slugDraft, setSlugDraft] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [copiedPageId, setCopiedPageId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setListLoading(true)
    try {
      const [listRes, slugRes] = await Promise.all([
        fetch('/api/lucky-draw'),
        fetch('/api/lucky-draw/dealer-slug'),
      ])
      const listJson = await listRes.json()
      const slugJson = await slugRes.json()
      if (!listRes.ok) throw new Error(listJson.error || 'Failed to load pages')
      setPages(listJson.data ?? [])
      const slug = slugJson.data?.dealer_slug ?? ''
      setDealerSlug(slug)
      setSlugDraft(slug)
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Failed to load',
      })
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (user) void load()
  }, [user, load])

  const saveDealerSlug = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/lucky-draw/dealer-slug', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealer_slug: slugDraft }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update URL')
      setDealerSlug(json.data.dealer_slug)
      setMessage({ type: 'success', text: 'Dealer URL updated.' })
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Update failed',
      })
    } finally {
      setSaving(false)
    }
  }

  const openCreate = () => setEditor(emptyEditor())

  const openEdit = async (id: string) => {
    setMessage(null)
    try {
      const res = await fetch(`/api/lucky-draw/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load page')
      const p = json.data
      setEditor({
        id: p.id,
        title: p.title,
        page_slug: p.page_slug,
        status: p.status,
        prizes: p.prizes?.length ? p.prizes : [{ name: '', description: '' }],
        terms_and_conditions: p.terms_and_conditions ?? '',
        target_audience: p.target_audience ?? '',
        questions: p.questions ?? [],
      })
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Failed to open editor',
      })
    }
  }

  const saveEditor = async () => {
    if (!editor) return
    setSaving(true)
    setMessage(null)
    try {
      const payload = {
        title: editor.title.trim(),
        page_slug: editor.page_slug.trim(),
        status: editor.status,
        prizes: editor.prizes.filter((p) => p.name.trim()),
        terms_and_conditions: editor.terms_and_conditions,
        target_audience: editor.target_audience,
        questions: editor.questions.filter((q) => q.question_text.trim()),
      }

      const res = await fetch(editor.id ? `/api/lucky-draw/${editor.id}` : '/api/lucky-draw', {
        method: editor.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      setEditor(null)
      setMessage({ type: 'success', text: 'Lucky draw page saved.' })
      await load()
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Save failed',
      })
    } finally {
      setSaving(false)
    }
  }

  const copyPageUrl = async (pageId: string, pageSlug: string) => {
    if (!dealerSlug) return
    const url = `${window.location.origin}${luckyDrawPublicPath(dealerSlug, pageSlug)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedPageId(pageId)
      window.setTimeout(() => setCopiedPageId((cur) => (cur === pageId ? null : cur)), 2000)
    } catch {
      setMessage({ type: 'error', text: 'Could not copy URL.' })
    }
  }

  const deletePage = async (id: string) => {
    if (!confirm('Delete this lucky draw page? This cannot be undone.')) return
    const res = await fetch(`/api/lucky-draw/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const json = await res.json()
      setMessage({ type: 'error', text: json.error || 'Delete failed' })
      return
    }
    setMessage({ type: 'success', text: 'Page deleted.' })
    await load()
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:text-blue-700">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Lucky Draw</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        {message && (
          <p
            className={`rounded-xl px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-red-50 text-red-800'
            }`}
            role="alert"
          >
            {message.text}
          </p>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Your public URL</h2>
          <p className="mt-1 text-sm text-slate-600">
            Customers visit{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              /{dealerSlug || '…'}/your-page-name
            </code>
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={slugDraft}
              onChange={(e) => setSlugDraft(e.target.value)}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
              placeholder="dealer-slug"
            />
            <button
              type="button"
              onClick={() => void saveDealerSlug()}
              disabled={saving || !slugDraft.trim()}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Save slug
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Your pages</h2>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              New page
            </button>
          </div>
          {listLoading ? (
            <p className="px-6 py-8 text-sm text-slate-500">Loading…</p>
          ) : pages.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500">
              No lucky draw pages yet. Create your first one.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pages.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{p.title}</p>
                    <p className="text-sm text-slate-500">
                      /{dealerSlug}/{p.page_slug} · {p.status} · {p.entry_count ?? 0} entries
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {dealerSlug && (
                      <Link
                        href={luckyDrawPublicPath(dealerSlug, p.page_slug)}
                        target="_blank"
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        View
                      </Link>
                    )}
                    {dealerSlug && (
                      <button
                        type="button"
                        onClick={() => void copyPageUrl(p.id, p.page_slug)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        {copiedPageId === p.id ? 'Copied!' : 'Copy URL'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void openEdit(p.id)}
                      className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void deletePage(p.id)}
                      className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {editor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {editor.id ? 'Edit lucky draw' : 'New lucky draw'}
              </h2>
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="text-sm text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
                  <input
                    value={editor.title}
                    onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Page slug</label>
                  <input
                    value={editor.page_slug}
                    onChange={(e) => setEditor({ ...editor, page_slug: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    placeholder="lucky-draw"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                <select
                  value={editor.status}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      status: e.target.value as EditorState['status'],
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">Prizes</label>
                  <button
                    type="button"
                    onClick={() =>
                      setEditor({
                        ...editor,
                        prizes: [...editor.prizes, { name: '', description: '' }],
                      })
                    }
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    + Add prize
                  </button>
                </div>
                <div className="space-y-2">
                  {editor.prizes.map((prize, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={prize.name}
                        onChange={(e) => {
                          const prizes = [...editor.prizes]
                          prizes[i] = { ...prizes[i], name: e.target.value }
                          setEditor({ ...editor, prizes })
                        }}
                        placeholder="Prize name"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                      <input
                        value={prize.description ?? ''}
                        onChange={(e) => {
                          const prizes = [...editor.prizes]
                          prizes[i] = { ...prizes[i], description: e.target.value }
                          setEditor({ ...editor, prizes })
                        }}
                        placeholder="Description (optional)"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Target audience
                </label>
                <textarea
                  value={editor.target_audience}
                  onChange={(e) => setEditor({ ...editor, target_audience: e.target.value })}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Terms &amp; conditions
                </label>
                <textarea
                  value={editor.terms_and_conditions}
                  onChange={(e) => setEditor({ ...editor, terms_and_conditions: e.target.value })}
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <p className="mb-1 text-sm font-medium text-slate-700">Built-in questions</p>
                <p className="mb-3 text-xs text-slate-500">
                  Saving purpose (all tags) and location (Locate me) are always included.
                </p>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">Custom questions</label>
                  <button
                    type="button"
                    onClick={() =>
                      setEditor({
                        ...editor,
                        questions: [...editor.questions, emptyQuestion()],
                      })
                    }
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    + Add question
                  </button>
                </div>
                <div className="space-y-4">
                  {editor.questions.map((q, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-2 grid gap-2 sm:grid-cols-2">
                        <select
                          value={q.question_type}
                          onChange={(e) => {
                            const questions = [...editor.questions]
                            questions[i] = {
                              ...questions[i],
                              question_type: e.target.value as LuckyDrawQuestionType,
                            }
                            setEditor({ ...editor, questions })
                          }}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        >
                          {QUESTION_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const questions = editor.questions.filter((_, idx) => idx !== i)
                            setEditor({ ...editor, questions })
                          }}
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        value={q.question_text}
                        onChange={(e) => {
                          const questions = [...editor.questions]
                          questions[i] = { ...questions[i], question_text: e.target.value }
                          setEditor({ ...editor, questions })
                        }}
                        placeholder="Question text"
                        className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                      {q.question_type === 'multiple_choice' && (
                        <textarea
                          value={(q.options ?? []).join('\n')}
                          onChange={(e) => {
                            const questions = [...editor.questions]
                            questions[i] = {
                              ...questions[i],
                              options: e.target.value
                                .split('\n')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            }
                            setEditor({ ...editor, questions })
                          }}
                          rows={3}
                          placeholder="One option per line"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => void saveEditor()}
                disabled={saving}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save page'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
