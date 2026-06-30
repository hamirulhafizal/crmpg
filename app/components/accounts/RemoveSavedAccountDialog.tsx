'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SavedAccount } from '@/app/lib/auth/saved-accounts'
import { savedAccountDisplayLabel } from '@/app/lib/auth/saved-accounts'

type RemoveSavedAccountDialogProps = {
  account: SavedAccount
  onCancel: () => void
  onConfirm: () => void
}

export function RemoveSavedAccountDialog({
  account,
  onCancel,
  onConfirm,
}: RemoveSavedAccountDialogProps) {
  const label = savedAccountDisplayLabel(account)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onCancel])

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-account-title"
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <h3 id="remove-account-title" className="text-lg font-semibold text-slate-900">
          Remove account?
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Remove <span className="font-medium text-slate-900">{label}</span> from saved accounts on
          this device. You can add it again later by signing in.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Remove
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
