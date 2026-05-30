'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Gift, Sparkles, Users } from 'lucide-react'
import type { LuckyDrawPrize, LuckyDrawQuestion } from '@/app/lib/lucky-draw/types'
import { LuckyDrawQuestionnaire } from '@/app/[dealerSlug]/[pageSlug]/_components/LuckyDrawQuestionnaire'
import { ParticipationSuccess } from '@/app/[dealerSlug]/[pageSlug]/_components/ParticipationSuccess'
import { CustomerPortalLoginSheet } from '@/app/pg-gold-saver/_components/CustomerPortalLoginSheet'

type TagRow = { id: string; category_id: string; label: string }
type TagCategory = { id: string; name: string; allows_multiple: boolean; tags: TagRow[] }

export type PublicLuckyDrawPage = {
  id: string
  title: string
  status: string
  prizes: LuckyDrawPrize[]
  terms_and_conditions: string | null
  target_audience: string | null
  dealer_slug: string
  dealer_name: string | null
  page_slug: string
  questions: LuckyDrawQuestion[]
}

type Props = {
  page: PublicLuckyDrawPage
  dealerSlug: string
  pageSlug: string
}

export function LuckyDrawPublicClient({ page, dealerSlug, pageSlug }: Props) {
  const searchParams = useSearchParams()

  const [loggedIn, setLoggedIn] = useState(false)
  const [entered, setEntered] = useState(false)
  const [participatedAt, setParticipatedAt] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [tagCatalog, setTagCatalog] = useState<TagCategory[]>([])
  const [signingOut, setSigningOut] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)

  const loadStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const res = await fetch(`/api/customer-portal/lucky-draw/${page.id}/status`)
      const json = await res.json()
      setLoggedIn(!!json.loggedIn)
      setEntered(!!json.entered)
      setParticipatedAt(json.participated_at ?? null)
      setCustomerName(json.customer?.name ?? null)
    } finally {
      setStatusLoading(false)
    }
  }, [page.id])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    const tagsRes = fetch('/api/customer-portal/tags')
      .then((r) => r.json())
      .then((json) => setTagCatalog(json.categories ?? []))
      .catch(() => setTagCatalog([]))
    void tagsRes
  }, [])

  useEffect(() => {
    if (searchParams.get('joined') === '1' && loggedIn && !entered && page.status === 'active') {
      setQuestionnaireOpen(true)
    }
    if (searchParams.get('joined') === '1' && !loggedIn && !statusLoading) {
      setLoginOpen(true)
    }
  }, [searchParams, loggedIn, entered, page.status, statusLoading])

  useEffect(() => {
    if (entered && participatedAt) {
      setSuccessOpen(true)
    }
  }, [entered, participatedAt])

  const openLogin = () => setLoginOpen(true)

  const handleLoginSuccess = async () => {
    try {
      const res = await fetch(`/api/customer-portal/lucky-draw/${page.id}/status`)
      const json = await res.json()
      setLoggedIn(!!json.loggedIn)
      setEntered(!!json.entered)
      setParticipatedAt(json.participated_at ?? null)
      setCustomerName(json.customer?.name ?? null)
      if (page.status === 'active' && !json.entered) {
        setQuestionnaireOpen(true)
      }
    } catch {
      await loadStatus()
    }
  }

  const handleJoin = () => {
    if (closed) return
    if (!loggedIn) {
      openLogin()
      return
    }
    if (page.status !== 'active') return
    if (entered) {
      setSuccessOpen(true)
      return
    }
    setQuestionnaireOpen(true)
  }

  const handleComplete = (at: string) => {
    setParticipatedAt(at)
    setEntered(true)
    setQuestionnaireOpen(false)
    setSuccessOpen(true)
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await fetch('/api/customer-portal/logout', { method: 'POST' })
      setLoggedIn(false)
      setEntered(false)
      setParticipatedAt(null)
      setCustomerName(null)
      setQuestionnaireOpen(false)
      setSuccessOpen(false)
    } finally {
      setSigningOut(false)
    }
  }

  const closed = page.status === 'closed'
  const draft = page.status === 'draft'

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-slate-50">
      <header className="border-b border-amber-100/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
              Lucky Draw
            </p>
            <h1 className="text-xl font-bold text-slate-900">{page.title}</h1>
            {page.dealer_name && (
              <p className="text-sm text-slate-500">by {page.dealer_name}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {loggedIn && !statusLoading ? (
              <>
                {customerName && (
                  <p className="max-w-[140px] truncate text-right text-xs text-slate-500 sm:max-w-[180px]">
                    Hi, {customerName}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={signingOut}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60"
                >
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </>
            ) : (
              <Sparkles className="size-8 text-amber-500" aria-hidden />
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-5 py-8 pb-28">
        {draft && (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">
            Preview mode — set status to <strong>Active</strong> in your dashboard to accept entries.
          </p>
        )}

        <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Gift className="size-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-slate-900">Prizes</h2>
          </div>
          {page.prizes.length === 0 ? (
            <p className="text-sm text-slate-500">Prizes will be announced soon.</p>
          ) : (
            <ul className="space-y-3">
              {page.prizes.map((prize, i) => (
                <li
                  key={`${prize.name}-${i}`}
                  className="rounded-2xl border border-amber-100 bg-amber-50/50 px-4 py-3"
                >
                  <p className="font-semibold text-slate-900">{prize.name}</p>
                  {prize.description && (
                    <p className="mt-1 text-sm text-slate-600">{prize.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {page.target_audience && (
          <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Users className="size-5 text-slate-600" />
              <h2 className="text-lg font-semibold text-slate-900">Target audience</h2>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {page.target_audience}
            </p>
          </section>
        )}

        {page.terms_and_conditions && (
          <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Terms &amp; conditions</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
              {page.terms_and_conditions}
            </p>
          </section>
        )}

        <section className="sticky bottom-0 z-10 -mx-5 border-t border-amber-100/80 bg-white/95 px-5 py-4 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur-md sm:bottom-4 sm:mx-0 sm:rounded-3xl sm:border sm:border-slate-200 sm:shadow-lg">
          {closed ? (
            <p className="text-center text-sm font-medium text-slate-600">
              This lucky draw is closed. Thank you for your interest.
            </p>
          ) : entered ? (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium text-emerald-700">You have already joined!</p>
              <button
                type="button"
                onClick={() => setSuccessOpen(true)}
                className="w-full rounded-xl bg-amber-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 active:scale-[0.98]"
              >
                Show participation proof
              </button>
            </div>
          ) : draft && loggedIn ? (
            <p className="text-center text-sm font-medium text-slate-600">
              This lucky draw is not open for entries yet.
            </p>
          ) : !loggedIn ? (
            <button
              type="button"
              onClick={openLogin}
              disabled={statusLoading}
              className="flex w-full items-center justify-center rounded-xl bg-amber-600 px-4 py-3.5 text-center text-sm font-bold text-white shadow-sm transition hover:bg-amber-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {statusLoading ? 'Loading…' : 'Sign in to join'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleJoin}
              disabled={statusLoading}
              className="w-full rounded-xl bg-amber-600 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-amber-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {statusLoading ? 'Loading…' : 'Join lucky draw'}
            </button>
          )}
          {!loggedIn && !closed && !entered && !statusLoading && (
            <p className="mt-3 text-center text-xs text-slate-500">
              Sign in with your PG code via{' '}
              <span className="font-medium text-amber-800">PG Gold Saver</span>
            </p>
          )}
        </section>
      </main>

      <CustomerPortalLoginSheet
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => void handleLoginSuccess()}
        title="Sign in to join"
        description="Enter your PG code to join this lucky draw. We will send a one-time code to your WhatsApp or email."
      />

      <LuckyDrawQuestionnaire
        open={questionnaireOpen}
        pageId={page.id}
        pageTitle={page.title}
        customQuestions={page.questions}
        tagCatalog={tagCatalog}
        onClose={() => setQuestionnaireOpen(false)}
        onComplete={handleComplete}
      />

      {participatedAt && (
        <ParticipationSuccess
          open={successOpen}
          participatedAt={participatedAt}
          pageTitle={page.title}
          customerName={customerName}
          onDismiss={() => setSuccessOpen(false)}
        />
      )}
    </div>
  )
}
