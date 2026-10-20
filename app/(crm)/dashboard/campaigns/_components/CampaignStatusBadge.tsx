'use client'

import type { CampaignStatus } from '@/app/lib/campaigns/types'

const styles: Record<CampaignStatus, string> = {
  draft: 'bg-slate-100 text-slate-800 ring-slate-200',
  active: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  paused: 'bg-amber-50 text-amber-900 ring-amber-200',
  completed: 'bg-blue-50 text-blue-800 ring-blue-200',
  archived: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${styles[status] ?? styles.draft}`}
    >
      {status}
    </span>
  )
}
