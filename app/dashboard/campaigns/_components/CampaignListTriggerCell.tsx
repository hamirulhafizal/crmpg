'use client'

import { campaignListTriggerDisplay } from '@/app/lib/campaigns/trigger-schedule'

type Props = {
  campaign: {
    trigger_type?: string | null
    trigger_offset_days?: number | null
    timezone?: string | null
    workflow_definition?: unknown
    start_at?: string | null
  }
}

export function CampaignListTriggerCell({ campaign }: Props) {
  const d = campaignListTriggerDisplay(campaign)

  return (
    <div className="min-w-[11rem] max-w-[16rem]">
      <p className="font-medium text-slate-800">{d.kind}</p>
      <p className="mt-0.5 text-xs leading-snug text-slate-600">{d.scheduleLine}</p>
      {d.eventLine ? (
        <p className="mt-0.5 text-xs leading-snug text-slate-500">{d.eventLine}</p>
      ) : null}
      <p className="mt-0.5 text-[11px] text-slate-400">{d.timezone}</p>
    </div>
  )
}
