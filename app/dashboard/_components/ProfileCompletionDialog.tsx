'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/app/lib/supabase/client'
import {
  PROFILE_COMPLETION_STEPS,
  PROFILE_FIELD_LABELS,
  firstIncompleteStepIndex,
  getMissingProfileFields,
  isFieldComplete,
  isProfileComplete,
  type ProfileCompletionSnapshot,
  type RequiredProfileField,
} from '@/app/lib/profile/completion'
import { buildDefaultGmailMessage } from '@/app/lib/profile/gmail-template'
import { UserProfileMenu } from '@/app/components/UserProfileMenu'

type Props = {
  userId: string
  userEmail?: string | null
  userMetadata?: Record<string, unknown>
  onComplete: () => void
}

function snapshotFromForm(
  fullName: string,
  pgcode: string,
  usernamePbo: string,
  phone: string,
  gmailAppPassword: string,
  gmailMessage: string
): ProfileCompletionSnapshot {
  return {
    full_name: fullName.trim() || null,
    username_pbo: usernamePbo.trim() || null,
    phone: phone.replace(/\D/g, '') || null,
    pgcode: pgcode.trim().toUpperCase() || null,
    gmail_app_password: gmailAppPassword.trim() || null,
    gmail_message: gmailMessage.trim() || null,
  }
}

export function ProfileCompletionDialog({ userId, userEmail, userMetadata, onComplete }: Props) {
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [showGmailPassword, setShowGmailPassword] = useState(false)
  const gmailMessageCustomized = useRef(false)

  const [fullName, setFullName] = useState('')
  const [usernamePbo, setUsernamePbo] = useState('')
  const [phone, setPhone] = useState('')
  const [pgcode, setPgcode] = useState('')
  const [gmailAppPassword, setGmailAppPassword] = useState('')
  const [gmailMessage, setGmailMessage] = useState('')

  const snapshot = useMemo(
    () => snapshotFromForm(fullName, pgcode, usernamePbo, phone, gmailAppPassword, gmailMessage),
    [fullName, pgcode, usernamePbo, phone, gmailAppPassword, gmailMessage]
  )

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    ;(async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('full_name, username_pbo, phone, pgcode, gmail_app_password, gmail_message')
          .eq('id', userId)
          .maybeSingle()

        if (cancelled) return
        if (fetchError) throw fetchError

        const metadataFullName =
          typeof userMetadata?.full_name === 'string' ? userMetadata.full_name.trim() : ''
        const metadataPhone =
          typeof userMetadata?.phone === 'string' ? userMetadata.phone.trim() : ''

        const loadedName = data?.full_name?.trim() || metadataFullName || ''
        const loadedPhone = (data?.phone?.trim() || metadataPhone).replace(/\D/g, '')
        const loadedGmailMessage = data?.gmail_message?.trim() ?? ''
        const loadedGmailPassword = data?.gmail_app_password?.trim() ?? ''

        setFullName(loadedName)
        setUsernamePbo(data?.username_pbo?.trim() ?? '')
        setPgcode(data?.pgcode?.trim().toUpperCase() ?? '')
        setPhone(loadedPhone)
        setGmailAppPassword(loadedGmailPassword)
        setGmailMessage(
          loadedGmailMessage || buildDefaultGmailMessage(loadedName, loadedPhone)
        )
        gmailMessageCustomized.current = Boolean(loadedGmailMessage)

        const profileSnapshot: ProfileCompletionSnapshot = {
          full_name: loadedName || null,
          username_pbo: data?.username_pbo?.trim() || null,
          phone: loadedPhone || null,
          pgcode: data?.pgcode?.trim().toUpperCase() || null,
          gmail_app_password: loadedGmailPassword || null,
          gmail_message: loadedGmailMessage || null,
        }

        setStepIndex(
          firstIncompleteStepIndex(profileSnapshot, userMetadata?.phone, userMetadata?.full_name)
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
  }, [supabase, userId, userMetadata?.full_name, userMetadata?.phone])

  const currentStep = PROFILE_COMPLETION_STEPS[stepIndex]
  const isLastStep = stepIndex === PROFILE_COMPLETION_STEPS.length - 1
  const stepValid = currentStep
    ? isFieldComplete(currentStep.field, snapshot, userMetadata?.phone, userMetadata?.full_name)
    : false

  useEffect(() => {
    if (currentStep?.field !== 'gmail_message' || gmailMessageCustomized.current) return
    setGmailMessage(buildDefaultGmailMessage(fullName, phone))
  }, [currentStep?.field, fullName, phone])

  const handleFieldChange = (field: RequiredProfileField, raw: string) => {
    setError(null)
    switch (field) {
      case 'full_name':
        setFullName(raw)
        break
      case 'pgcode':
        setPgcode(raw.toUpperCase())
        break
      case 'username_pbo':
        setUsernamePbo(raw)
        break
      case 'phone':
        setPhone(raw.replace(/\D/g, ''))
        break
      case 'gmail_app_password':
        setGmailAppPassword(raw)
        break
      case 'gmail_message':
        gmailMessageCustomized.current = true
        setGmailMessage(raw)
        break
    }
  }

  const applyDefaultGmailTemplate = () => {
    gmailMessageCustomized.current = false
    setGmailMessage(buildDefaultGmailMessage(fullName, phone))
    setError(null)
  }

  const goToNextStep = (fromIndex: number): number => {
    for (let i = fromIndex + 1; i < PROFILE_COMPLETION_STEPS.length; i++) {
      const field = PROFILE_COMPLETION_STEPS[i].field
      if (
        !isFieldComplete(field, snapshot, userMetadata?.phone, userMetadata?.full_name)
      ) {
        return i
      }
    }
    return PROFILE_COMPLETION_STEPS.length - 1
  }

  const handleBack = () => {
    if (stepIndex <= 0 || saving) return
    setError(null)
    setStepIndex((i) => i - 1)
  }

  const handleContinue = async () => {
    if (!currentStep || saving) return
    setError(null)

    if (!isFieldComplete(currentStep.field, snapshot, userMetadata?.phone, userMetadata?.full_name)) {
      setError(`Please enter a valid ${PROFILE_FIELD_LABELS[currentStep.field].toLowerCase()}.`)
      return
    }

    if (currentStep.field === 'phone' && !gmailMessageCustomized.current) {
      setGmailMessage(buildDefaultGmailMessage(fullName, phone))
    }

    if (!isLastStep) {
      setStepIndex(goToNextStep(stepIndex))
      return
    }

    if (!isProfileComplete(snapshot, userMetadata?.phone, userMetadata?.full_name)) {
      setError('Please fill in all required fields to continue.')
      return
    }

    setSaving(true)
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: snapshot.full_name,
          username_pbo: snapshot.username_pbo,
          phone: snapshot.phone,
          pgcode: snapshot.pgcode,
          gmail_app_password: snapshot.gmail_app_password,
          gmail_message: snapshot.gmail_message,
        })
        .eq('id', userId)

      if (profileError) throw profileError

      const metadataPhone =
        typeof userMetadata?.phone === 'string' ? userMetadata.phone.trim() : ''
      const metadataFullName =
        typeof userMetadata?.full_name === 'string' ? userMetadata.full_name.trim() : ''

      const authPatch: Record<string, unknown> = { ...userMetadata }
      let needsAuthUpdate = false

      if (snapshot.phone !== metadataPhone) {
        authPatch.phone = snapshot.phone
        needsAuthUpdate = true
      }
      if (snapshot.full_name !== metadataFullName) {
        authPatch.full_name = snapshot.full_name
        needsAuthUpdate = true
      }

      if (needsAuthUpdate) {
        const { error: authError } = await supabase.auth.updateUser({ data: authPatch })
        if (authError) throw authError
      }

      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  const renderFieldInput = (field: RequiredProfileField) => {
    const commonClass =
      'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-lg text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-50'
    const placeholder =
      PROFILE_COMPLETION_STEPS.find((s) => s.field === field)?.placeholder ?? ''

    switch (field) {
      case 'full_name':
        return (
          <input
            id="profile-step-full-name"
            type="text"
            autoComplete="name"
            autoFocus
            value={fullName}
            onChange={(e) => handleFieldChange('full_name', e.target.value)}
            placeholder={placeholder}
            disabled={saving}
            className={commonClass}
          />
        )
      case 'pgcode':
        return (
          <input
            id="profile-step-pgcode"
            type="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={pgcode}
            onChange={(e) => handleFieldChange('pgcode', e.target.value)}
            placeholder={placeholder}
            disabled={saving}
            className={commonClass}
          />
        )
      case 'username_pbo':
        return (
          <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
            <span className="shrink-0 text-slate-500">pg2u.my/</span>
            <input
              id="profile-step-username-pgo"
              type="text"
              autoFocus
              value={usernamePbo}
              onChange={(e) => handleFieldChange('username_pbo', e.target.value)}
              placeholder="your-username"
              disabled={saving}
              className="min-w-0 flex-1 bg-transparent text-lg text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>
        )
      case 'phone':
        return (
          <input
            id="profile-step-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
            value={phone}
            onChange={(e) => handleFieldChange('phone', e.target.value)}
            placeholder={placeholder}
            disabled={saving}
            className={commonClass}
          />
        )
      case 'gmail_app_password':
        return (
          <div className="space-y-2">
            <div className="relative">
              <input
                id="profile-step-gmail-password"
                type={showGmailPassword ? 'text' : 'password'}
                autoComplete="off"
                autoFocus
                value={gmailAppPassword}
                onChange={(e) => handleFieldChange('gmail_app_password', e.target.value)}
                placeholder={placeholder}
                disabled={saving}
                className={`${commonClass} pr-24`}
              />
              <button
                type="button"
                onClick={() => setShowGmailPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                {showGmailPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 active:scale-[0.98]"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              Generate Gmail app password
            </a>
            <p className="text-xs text-slate-500">
              Requires 2-Step Verification on your Google Account. Copy the 16-character password and paste it above.
            </p>
          </div>
        )
      case 'gmail_message':
        return (
          <div className="space-y-3">
            <textarea
              id="profile-step-gmail-message"
              autoFocus
              rows={12}
              value={gmailMessage}
              onChange={(e) => handleFieldChange('gmail_message', e.target.value)}
              placeholder={placeholder}
              disabled={saving}
              className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm leading-relaxed text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-50 font-mono"
            />
            <button
              type="button"
              onClick={applyDefaultGmailTemplate}
              disabled={saving}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              Reset to default template (uses your name &amp; phone)
            </button>
            <p className="text-xs text-slate-500">
              {'{SenderName}'} is replaced with each customer&apos;s name when email is sent.
            </p>
          </div>
        )
    }
  }

  const stepShortLabel = (field: RequiredProfileField) => {
    switch (field) {
      case 'username_pbo':
        return 'User'
      case 'full_name':
        return 'Name'
      case 'pgcode':
        return 'PG'
      case 'phone':
        return 'Phone'
      case 'gmail_app_password':
        return 'Gmail'
      case 'gmail_message':
        return 'Msg'
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/30"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-completion-title"
    >
      <header className="shrink-0 border-b border-slate-200/80 bg-white/80 px-4 py-4 backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
              Profile setup
            </p>
            <h1 id="profile-completion-title" className="truncate text-lg font-semibold text-slate-900">
              Complete your dealer profile
            </h1>
          </div>
          <UserProfileMenu elevated />
        </div>
      </header>

      <div className="shrink-0 px-4 py-5 sm:px-8">
        <div className="mx-auto max-w-lg">
          <div className="mb-3 flex items-center justify-between gap-1">
            {PROFILE_COMPLETION_STEPS.map((step, index) => {
              const done =
                index < stepIndex ||
                isFieldComplete(step.field, snapshot, userMetadata?.phone, userMetadata?.full_name)
              const active = index === stepIndex
              return (
                <div key={step.field} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 sm:h-9 sm:w-9 sm:text-sm ${
                      active
                        ? 'scale-110 bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                        : done
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-200 text-slate-500'
                    }`}
                    aria-current={active ? 'step' : undefined}
                  >
                    {done && !active ? (
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span
                    className={`hidden text-[9px] font-medium sm:block ${
                      active ? 'text-blue-600' : 'text-slate-400'
                    }`}
                  >
                    {stepShortLabel(step.field)}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
              style={{
                width: `${((stepIndex + 1) / PROFILE_COMPLETION_STEPS.length) * 100}%`,
              }}
            />
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">
            Step {stepIndex + 1} of {PROFILE_COMPLETION_STEPS.length}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-6 sm:px-8">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col py-2">
          {loading ? (
            <div className="flex flex-1 flex-col justify-center space-y-4" aria-busy="true">
              <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
              <div className="h-14 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ) : currentStep ? (
            <div key={currentStep.field} className="flex flex-1 flex-col">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                {currentStep.title}
              </h2>
              <p className="mt-2 text-base text-slate-600">{currentStep.description}</p>

              <div className="mt-6">{renderFieldInput(currentStep.field)}</div>

              {error && (
                <div
                  className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {!loading &&
                getMissingProfileFields(snapshot, userMetadata?.phone, userMetadata?.full_name)
                  .length === 0 &&
                isLastStep && (
                  <p className="mt-4 text-sm text-emerald-700">
                    All required fields are filled. Tap finish to access your dashboard.
                  </p>
                )}
            </div>
          ) : null}
        </div>
      </div>

      <footer className="shrink-0 border-t border-slate-200/80 bg-white/90 px-4 py-4 backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-lg gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={stepIndex === 0 || saving || loading}
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={saving || loading || !stepValid}
            className="flex-[2] rounded-2xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
          >
            {saving ? 'Saving…' : isLastStep ? 'Finish setup' : 'Continue'}
          </button>
        </div>
        <p className="mx-auto mt-3 max-w-lg text-center text-xs text-slate-500">
          You must complete your profile before using the dashboard.
        </p>
      </footer>
    </div>
  )
}
