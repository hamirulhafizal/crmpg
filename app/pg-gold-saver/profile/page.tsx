'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { PORTAL_BRAND, PORTAL_LOGIN_PATH } from '@/app/lib/customer-portal/brand'

const LocationPickerSheet = dynamic(
  () => import('@/app/pg-gold-saver/_components/LocationPickerSheet'),
  { ssr: false }
)

type CustomerProfile = {
  id: string
  name: string | null
  dob: string | null
  email: string | null
  phone: string | null
  location: string | null
  pg_code: string | null
  gender: string | null
  ethnicity: string | null
  sender_name: string | null
  save_name: string | null
}

export default function PgGoldSaverProfilePage() {
  const router = useRouter()
  const [customer, setCustomer] = useState<CustomerProfile | null>(null)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [locationPickerOpen, setLocationPickerOpen] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadProfile = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/customer-portal/me')
      if (res.status === 401) {
        router.replace(PORTAL_LOGIN_PATH)
        return
      }
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load profile')
      const c = json.customer as CustomerProfile
      setCustomer(c)
      setPhone(c.phone || '')
      setEmail(c.email || '')
      setLocation(c.location || '')
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Could not load your details',
      })
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/customer-portal/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          email: email.trim(),
          location: location.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Update failed')
      setCustomer(json.customer)
      setMessage({ type: 'success', text: 'Your details have been saved.' })
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Could not save changes',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/customer-portal/logout', { method: 'POST' })
    router.replace(PORTAL_LOGIN_PATH)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading your profile…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">{PORTAL_BRAND}</p>
            <h1 className="text-lg font-semibold text-slate-900">My details</h1>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 py-6">
        {customer && (
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-slate-500">Account</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Name</dt>
                <dd className="text-right font-medium text-slate-900">{customer.name || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">PG code</dt>
                <dd className="text-right font-medium text-slate-900">{customer.pg_code || '—'}</dd>
              </div>
              {/* {customer.sender_name && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Sender name</dt>
                  <dd className="text-right text-slate-900">{customer.sender_name}</dd>
                </div>
              )} */}
              {/* {customer.dob && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Date of birth</dt>
                  <dd className="text-right text-slate-900">{customer.dob}</dd>
                </div>
              )} */}
            </dl>
            <p className="mt-4 text-xs text-slate-400">
              PG code and name are managed by your dealer. You can update phone, email, and location below.
            </p>
          </section>
        )}

        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-slate-900">Contact details</h2>

          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-medium text-slate-700">
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
            />
          </div>

          <div>
            <label htmlFor="location" className="mb-1 block text-sm font-medium text-slate-700">
              Location
            </label>
            <div className="flex gap-2">
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, state or pick on map"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
              />
              <button
                type="button"
                onClick={() => setLocationPickerOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
                aria-label="Locate on map"
              >
                <MapPin className="size-4" aria-hidden />
                <span className="hidden sm:inline">Locate</span>
              </button>
            </div>
          </div>

          <LocationPickerSheet
            open={locationPickerOpen}
            initialLocation={location}
            onClose={() => setLocationPickerOpen(false)}
            onConfirm={(value) => setLocation(value)}
          />

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>

          {message && (
            <p
              className={`rounded-lg px-3 py-2 text-sm ${
                message.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
              }`}
            >
              {message.text}
            </p>
          )}
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href={PORTAL_LOGIN_PATH} className="underline hover:text-slate-700">
            Back to sign in
          </Link>
        </p>
      </main>
    </div>
  )
}
