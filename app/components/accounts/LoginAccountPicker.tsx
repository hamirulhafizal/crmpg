'use client'

import { AccountAvatar } from '@/app/components/accounts/AccountAvatar'
import {
  MAX_SAVED_ACCOUNTS,
  savedAccountPickerLabel,
  type SavedAccount,
} from '@/app/lib/auth/saved-accounts'

type LoginAccountPickerProps = {
  accounts: SavedAccount[]
  switchingUserId: string | null
  onSelect: (account: SavedAccount) => void
  onAdd: () => void
}

export function LoginAccountPicker({
  accounts,
  switchingUserId,
  onSelect,
  onAdd,
}: LoginAccountPickerProps) {
  const canAdd = accounts.length < MAX_SAVED_ACCOUNTS

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-start justify-center gap-6 sm:gap-8">
        {accounts.map((account) => {
          const label = savedAccountPickerLabel(account)
          const switching = switchingUserId === account.userId

          return (
            <button
              key={account.userId}
              type="button"
              disabled={Boolean(switchingUserId)}
              onClick={() => onSelect(account)}
              className="group flex w-[7.5rem] flex-col items-center gap-3 rounded-2xl p-2 transition duration-200 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 sm:w-28"
            >
              <div className="relative">
                <AccountAvatar
                  avatarUrl={account.avatarUrl}
                  fullName={account.fullName}
                  email={account.email}
                  size="lg"
                  className={switching ? 'opacity-60' : 'group-hover:scale-[1.03]'}
                />
                {switching ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <svg
                      className="h-7 w-7 animate-spin text-violet-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </span>
                ) : null}
              </div>
              <span className="line-clamp-2 w-full text-center font-mono text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                {label}
              </span>
            </button>
          )
        })}

        {canAdd ? (
          <button
            type="button"
            disabled={Boolean(switchingUserId)}
            onClick={onAdd}
            className="flex w-[7.5rem] flex-col items-center gap-3 rounded-2xl p-2 transition duration-200 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 sm:w-28"
          >
            <span className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400 transition group-hover:border-slate-400">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </span>
            <span className="text-center font-mono text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Add account
            </span>
          </button>
        ) : null}
      </div>

      <p className="mt-8 text-center text-xs uppercase tracking-wide text-slate-500">
        {canAdd
          ? `Saved on this device only — up to ${MAX_SAVED_ACCOUNTS} dealers.`
          : `Maximum of ${MAX_SAVED_ACCOUNTS} saved dealers on this device.`}
      </p>
    </div>
  )
}
