'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ensureQuestionIds,
  LuckyDrawQuestionsEditor,
} from '@/app/dashboard/lucky-draw/_components/LuckyDrawQuestionsEditor'
import type { LuckyDrawPrize, LuckyDrawQuestion } from '@/app/lib/lucky-draw/types'

type DefaultsForm = {
  title: string
  page_slug: string
  prizes: LuckyDrawPrize[]
  terms_and_conditions: string
  target_audience: string
  questions: LuckyDrawQuestion[]
}

export default function AdminLuckyDrawDefaultsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncedDealerPages, setSyncedDealerPages] = useState(0)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [form, setForm] = useState<DefaultsForm>({
    title: 'Lucky Draw',
    page_slug: 'lucky-draw',
    prizes: [{ name: '', description: '' }],
    terms_and_conditions: '',
    target_audience: '',
    questions: [],
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lucky-draw-defaults')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load defaults')

      const data = json.data
      setForm({
        title: data.title ?? 'Lucky Draw',
        page_slug: data.page_slug ?? 'lucky-draw',
        prizes: data.prizes?.length ? data.prizes : [{ name: '', description: '' }],
        terms_and_conditions: data.terms_and_conditions ?? '',
        target_audience: data.target_audience ?? '',
        questions: ensureQuestionIds(data.questions ?? []),
      })
      setSyncedDealerPages(json.synced_dealer_pages ?? 0)
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Failed to load',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/lucky-draw-defaults', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          page_slug: form.page_slug.trim(),
          prizes: form.prizes.filter((p) => p.name.trim()),
          terms_and_conditions: form.terms_and_conditions,
          target_audience: form.target_audience,
          questions: form.questions
            .filter((q) => q.question_text.trim())
            .map((q, i) => ({ ...q, sort_order: i })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')

      setSyncedDealerPages(json.synced_pages ?? 0)
      setMessage({
        type: 'success',
        text: `Platform defaults saved. Synced ${json.synced_pages ?? 0} dealer page(s) that still use the default template.`,
      })
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Lucky draw defaults</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every dealer gets a <strong>Lucky Draw</strong> page automatically from this template.
          Saving here updates all dealer pages that have not customized their copy yet (
          {syncedDealerPages} currently synced).
        </p>
      </div>

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

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Page slug</label>
              <input
                value={form.page_slug}
                onChange={(e) => setForm({ ...form, page_slug: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700">Prizes</label>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    prizes: [...form.prizes, { name: '', description: '' }],
                  })
                }
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                + Add prize
              </button>
            </div>
            <div className="space-y-2">
              {form.prizes.map((prize, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={prize.name}
                    onChange={(e) => {
                      const prizes = [...form.prizes]
                      prizes[i] = { ...prizes[i], name: e.target.value }
                      setForm({ ...form, prizes })
                    }}
                    placeholder="Prize name"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={prize.description ?? ''}
                    onChange={(e) => {
                      const prizes = [...form.prizes]
                      prizes[i] = { ...prizes[i], description: e.target.value }
                      setForm({ ...form, prizes })
                    }}
                    placeholder="Description (optional)"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Target audience</label>
            <textarea
              value={form.target_audience}
              onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Terms &amp; conditions
            </label>
            <textarea
              value={form.terms_and_conditions}
              onChange={(e) => setForm({ ...form, terms_and_conditions: e.target.value })}
              rows={4}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
          </div>

          <LuckyDrawQuestionsEditor
            questions={form.questions}
            onChange={(questions) => setForm({ ...form, questions })}
          />

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save & sync to dealers'}
          </button>
        </div>
      )}
    </div>
  )
}
