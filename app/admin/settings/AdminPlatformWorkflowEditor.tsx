'use client'

import { useMemo } from 'react'
import { CampaignWorkflowModal } from '@/app/dashboard/campaigns/_components/CampaignWorkflowModal'
import { draftFromCampaignPayload } from '@/app/lib/campaigns/workflow-layout'
import { sendTimeFromDb } from '@/app/lib/campaigns/schedule'
import type { PlatformCampaignDefault } from '@/app/lib/campaigns/platform-defaults'

type Props = {
  open: boolean
  onClose: () => void
  defaults: PlatformCampaignDefault | null
  onSaved: () => void
  pushToast?: (type: 'success' | 'error', text: string) => void
}

export function AdminPlatformWorkflowEditor({ open, onClose, defaults, onSaved, pushToast }: Props) {
  const initialDraft = useMemo(() => {
    if (!defaults) return undefined
    const steps = defaults.compiled_steps.map((s) => ({
      step_order: s.step_order,
      delay_days: s.delay_days,
      send_time: sendTimeFromDb(s.send_time),
      message_template: s.message_template,
      is_active: s.is_active,
    }))
    return draftFromCampaignPayload(
      {
        name: defaults.name,
        trigger_type: defaults.trigger_type,
        trigger_offset_days: defaults.trigger_offset_days,
        timezone: defaults.timezone,
        audience_filters: defaults.audience_filters,
        daily_send_limit: defaults.daily_send_limit,
        cooldown_days: defaults.cooldown_days,
        workflow_layout: defaults.workflow_layout,
        workflow_definition: defaults.workflow_definition,
      },
      steps
    )
  }, [defaults])

  const steps = useMemo(
    () =>
      (defaults?.compiled_steps ?? []).map((s) => ({
        id: undefined,
        step_order: s.step_order,
        delay_days: s.delay_days,
        send_time: sendTimeFromDb(s.send_time),
        message_template: s.message_template,
        is_active: s.is_active,
      })),
    [defaults]
  )

  if (!defaults) return null

  return (
    <CampaignWorkflowModal
      open={open}
      onClose={onClose}
      saveAsPlatformDefault
      campaignId="platform-default"
      editable
      initialDraft={initialDraft}
      campaignName={defaults.name}
      campaignStatus="draft"
      triggerType={defaults.trigger_type}
      steps={steps}
      nodeStates={{}}
      logs={[]}
      running={false}
      testRunDisabled
      onSaved={onSaved}
      pushToast={pushToast}
    />
  )
}
