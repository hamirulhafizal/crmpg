'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, ListChecks, Loader2, MessageCircle, ShieldCheck } from 'lucide-react'
import { PORTAL_BRAND, PORTAL_PROFILE_PATH } from '@/app/lib/customer-portal/brand'
import {
  LoginJourneyAvatarStrip,
  LoginJourneyFloatingFaces,
} from '@/app/pg-gold-saver/_components/LoginJourneyAvatarDecor'

const primaryBtnClass =
  'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#C47A1A] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-8px_rgba(180,83,9,0.55)] transition hover:bg-[#A86412] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-amber-200 disabled:text-amber-800/70 disabled:shadow-none'

function PgGoldSaverLoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('return')
  const safeReturn =
    returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : null
  const [pgCode, setPgCode] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [deliveryHint, setDeliveryHint] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'identify' | 'verify'>('identify')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/customer-portal/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pg_code: pgCode.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'Could not send verification code')
      }
      setCustomerId(json.customer_id)
      setDeliveryHint(json.message || null)
      setStep('verify')
      setMessage({
        type: 'success',
        text: json.message || 'Kod telah dihantar. Semak WhatsApp atau email anda.',
      })
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerId) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/customer-portal/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, code: code.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'Invalid code')
      }
      router.replace(safeReturn ?? PORTAL_PROFILE_PATH)
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Verification failed',
      })
    } finally {
      setLoading(false)
    }
  }

  const resetFlow = () => {
    setStep('identify')
    setCustomerId(null)
    setDeliveryHint(null)
    setCode('')
    setMessage(null)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FBF7F1]">
      <LoginJourneyFloatingFaces />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[26rem] flex-col justify-center px-5 py-12">
        <motion.div
          className="mb-6 text-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/85 px-3 py-1.5 shadow-sm backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800">
              {PORTAL_BRAND}
            </p>
          </div>

          <p className="text-sm font-medium text-amber-800/90">Selamat datang</p>
          <h1 className="mt-1.5 text-[1.85rem] font-semibold tracking-tight text-slate-900 sm:text-[2rem]">
            Mari teruskan Gold Journey anda
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
            Masukkan PG code anda — kami hantar kod pantas ke WhatsApp atau email yang berdaftar.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/80">
              <MessageCircle className="h-3 w-3 text-emerald-600" aria-hidden />
              Kod via WhatsApp
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/80">
              <ListChecks className="h-3 w-3 text-amber-700" aria-hidden />
              Semak checklist
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/80">
              <ShieldCheck className="h-3 w-3 text-teal-600" aria-hidden />
              Selamat & pantas
            </span>
          </div>
        </motion.div>

        <LoginJourneyAvatarStrip />

        <motion.div
          className="rounded-[1.4rem] border border-amber-100/90 bg-white/95 p-6 shadow-[0_22px_55px_-28px_rgba(180,83,9,0.5)] ring-1 ring-black/[0.03] backdrop-blur-sm sm:p-7"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          {step === 'identify' ? (
            <form onSubmit={handleRequestOtp} className="space-y-5">
              <div>
                <label htmlFor="pg_code" className="mb-1.5 block text-sm font-medium text-slate-700">
                  PG code anda
                </label>
                <input
                  id="pg_code"
                  type="text"
                  autoComplete="off"
                  placeholder="contoh: PG00123456"
                  value={pgCode}
                  onChange={(e) => setPgCode(e.target.value.toUpperCase())}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-[#FBF7F1]/70 px-4 py-3.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-400/20"
                />
                <p className="mt-1.5 text-xs text-slate-500">Biasanya bermula dengan PG…</p>
              </div>

              <button
                type="submit"
                disabled={loading || !pgCode.trim()}
                className={primaryBtnClass}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Menghantar…
                  </>
                ) : (
                  <>
                    <MessageCircle className="h-4 w-4" aria-hidden />
                    Hantar kod pengesahan
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-5">
              <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3.5 py-3 text-sm leading-relaxed text-amber-950">
                {deliveryHint || 'Masukkan kod 6 digit yang kami hantar. Semak WhatsApp atau email anda.'}
              </div>
              <div>
                <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Kod pengesahan
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-[#FBF7F1]/70 px-4 py-3.5 text-center text-xl tracking-[0.4em] text-slate-900 outline-none transition placeholder:tracking-[0.4em] focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-400/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading || code.length < 6}
                className={primaryBtnClass}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Mengesahkan…
                  </>
                ) : (
                  <>
                    Teruskan ke profil saya
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={resetFlow}
                className="w-full text-sm font-medium text-slate-500 transition hover:text-slate-800"
              >
                Guna PG code lain
              </button>
            </form>
          )}

          {message && (
            <p
              className={`mt-4 rounded-xl px-3.5 py-2.5 text-sm ${
                message.type === 'success'
                  ? 'border border-emerald-100 bg-emerald-50 text-emerald-800'
                  : 'border border-red-100 bg-red-50 text-red-800'
              }`}
              role="alert"
            >
              {message.text}
            </p>
          )}
        </motion.div>

        <p className="mt-8 text-center text-xs leading-relaxed text-slate-500">
          Perlukan bantuan? Hubungi dealer PG anda.
          <br />
          <span className="text-slate-400">Kami sedia membantu anda maju dalam perjalanan emas.</span>
        </p>
      </div>
    </div>
  )
}

export default function PgGoldSaverLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FBF7F1] text-sm text-slate-600">
          Loading…
        </div>
      }
    >
      <PgGoldSaverLoginInner />
    </Suspense>
  )
}
