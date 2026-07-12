'use client'

import { PUSH_NAVIGATE_ROUTES } from '@/app/lib/push/navigate-routes'

type Props = {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  listId?: string
}

export function PushNavigateUrlInput({
  id,
  value,
  onChange,
  placeholder = '/dashboard or https://…',
  listId = 'push-navigate-routes',
}: Props) {
  return (
    <>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
        autoComplete="off"
        className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
      />
      <datalist id={listId}>
        {PUSH_NAVIGATE_ROUTES.map((route) => (
          <option key={route.path} value={route.path}>
            {route.label}
          </option>
        ))}
      </datalist>
    </>
  )
}

export function PushNavigateUrlHint() {
  return (
    <p className="text-xs text-slate-500">
      Pick a path from suggestions or type your own (e.g.{' '}
      <code className="rounded bg-slate-100 px-1">/customers</code>). Unauthenticated users are
      sent to login first, then redirected here.
    </p>
  )
}
