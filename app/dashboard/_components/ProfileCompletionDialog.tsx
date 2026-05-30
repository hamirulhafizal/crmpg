'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/app/lib/supabase/client'
import {
  PROFILE_FIELD_LABELS,
  getMissingProfileFields,
  isProfileComplete,
  type RequiredProfileField,
} from '@/app/lib/profile/completion'

type Props = {
  userId: string
  userMetadata?: Record<string, unknown>
  onComplete: () => void
}

export function ProfileCompletionDialog({ userId, userMetadata, onComplete }: Props) {
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)

  const [usernamePbo, setUsernamePbo] = useState('')
  const [phone, setPhone] = useState('')
  const [pgcode, setPgcode] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    ;(async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('username_pbo, phone, pgcode')
          .eq('id', userId)
          .maybeSingle()

        if (cancelled) return
        if (fetchError) throw fetchError

        setUsernamePbo(data?.username_pbo?.trim() ?? '')
        setPgcode(data?.pgcode?.trim().toUpperCase() ?? '')
        setPhone(
          (data?.phone?.trim() ||
            (typeof userMetadata?.phone === 'string' ? userMetadata.phone.trim() : '')
          ).replace(/\D/g, '')
        )
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load your profile.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [supabase, userId, userMetadata?.phone])

  const missingFields = getMissingProfileFields(
    {
      username_pbo: usernamePbo,
      phone,
      pgcode,
    },
    userMetadata?.phone
  )

  const fieldErrorClass = (field: RequiredProfileField) =>
    attempted && missingFields.includes(field)
      ? 'border-amber-400 ring-2 ring-amber-200/60'
      : 'border-slate-300 focus:border-blue-500 focus:ring-blue-200'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAttempted(true)
    setError(null)

    const snapshot = {
      username_pbo: usernamePbo.trim(),
      phone: phone.replace(/\D/g, ''),
      pgcode: pgcode.trim().toUpperCase(),
    }

    if (!isProfileComplete(snapshot)) {
      setError('Please fill in all required fields to continue.')
      return
    }

    setSaving(true)
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          username_pbo: snapshot.username_pbo,
          phone: snapshot.phone,
          pgcode: snapshot.pgcode,
        })
        .eq('id', userId)

      if (profileError) throw profileError

      const metadataPhone =
        typeof userMetadata?.phone === 'string' ? userMetadata.phone.trim() : ''
      if (snapshot.phone !== metadataPhone) {
        const { error: authError } = await supabase.auth.updateUser({
          data: {
            ...userMetadata,
            phone: snapshot.phone,
          },
        })
        if (authError) throw authError
      }

      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-completion-title"
      aria-describedby="profile-completion-desc"
    >
      <div className="flex max-h-[94vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" />

        <div className="border-b border-slate-200 px-6 py-5">
          <h2 id="profile-completion-title" className="text-xl font-semibold text-slate-900">
            Complete your profile
          </h2>
          <p id="profile-completion-desc" className="mt-1 text-sm text-slate-600">
            Add your dealer details before using the dashboard. All fields below are required.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {loading ? (
              <div className="space-y-4" aria-busy="true" aria-label="Loading profile">
                <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
              </div>
            ) : (
              <>
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {error}
                  </div>
                )}

                {attempted && missingFields.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Missing: {missingFields.map((f) => PROFILE_FIELD_LABELS[f]).join(', ')}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="profile-completion-username-pgo"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    pg2u.my/your-username
                  </label>
                  <input
                    id="profile-completion-username-pgo"
                    type="text"
                    value={usernamePbo}
                    onChange={(e) => setUsernamePbo(e.target.value)}
                    placeholder="Your username on pg2u.my"
                    disabled={saving}
                    className={`w-full rounded-xl border px-4 py-3 text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 disabled:opacity-50 ${fieldErrorClass('username_pbo')}`}
                  />
                </div>

                <div>
                  <label
                    htmlFor="profile-completion-phone"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Phone number
                  </label>
                  <input
                    id="profile-completion-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="60123456789"
                    disabled={saving}
                    className={`w-full rounded-xl border px-4 py-3 text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 disabled:opacity-50 ${fieldErrorClass('phone')}`}
                  />
                </div>

                <div>
                  <label
                    htmlFor="profile-completion-pgcode"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    PG code
                  </label>
                  <input
                    id="profile-completion-pgcode"
                    type="text"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    value={pgcode}
                    onChange={(e) => setPgcode(e.target.value.toUpperCase())}
                    placeholder="PG00123456"
                    disabled={saving}
                    className={`w-full rounded-xl border px-4 py-3 text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 disabled:opacity-50 ${fieldErrorClass('pgcode')}`}
                  />
                </div>
              </>
            )}
          </div>

          <div className="border-t border-slate-200 px-6 py-4">
            <button
              type="submit"
              disabled={saving || loading}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
            >
              {saving ? 'Saving…' : 'Save and continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
