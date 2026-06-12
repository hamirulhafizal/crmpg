import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { normalizeSendTimeForDb } from '@/app/lib/campaigns/schedule'
import { compileWorkflowDefinition } from '@/app/lib/workflows/compile'
import { sanitizeCampaignRecordForTransfer } from '@/app/lib/workflows/sanitize-export'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'

type ImportedCampaignItem = {
  campaign?: Record<string, unknown>
  steps?: Array<Record<string, unknown>>
}

type ImportRequest = {
  version?: number
  campaigns?: ImportedCampaignItem[]
}

function baseImportedName(name: unknown): string {
  const raw = typeof name === 'string' ? name.trim() : ''
  return raw ? `${raw} (Imported)` : 'Imported Campaign'
}

function ensureUniqueName(base: string, used: Set<string>): string {
  if (!used.has(base.toLowerCase())) {
    used.add(base.toLowerCase())
    return base
  }
  let i = 2
  while (true) {
    const next = `${base} ${i}`
    const key = next.toLowerCase()
    if (!used.has(key)) {
      used.add(key)
      return next
    }
    i += 1
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as ImportRequest
    const list = Array.isArray(body.campaigns) ? body.campaigns : []
    if (list.length === 0) {
      return NextResponse.json({ error: 'No campaigns found in import file' }, { status: 400 })
    }

    const { data: existingRows, error: existingErr } = await supabase
      .from('campaigns')
      .select('name')
      .eq('user_id', user.id)
    if (existingErr) throw existingErr
    const usedNames = new Set(
      (existingRows ?? []).map((r) => String(r.name ?? '').trim().toLowerCase()).filter(Boolean)
    )

    const failures: Array<{ index: number; name: string; error: string }> = []
    const warnings: Array<{ index: number; name: string; warning: string }> = []
    let imported = 0

    for (let i = 0; i < list.length; i += 1) {
      const item = list[i] ?? {}
      const sourceCampaign = sanitizeCampaignRecordForTransfer(item.campaign ?? {})
      const sourceSteps = Array.isArray(item.steps) ? item.steps : []
      const name = ensureUniqueName(baseImportedName(sourceCampaign.name), usedNames)

      try {
        const workflowDefinition =
          sourceCampaign.workflow_definition && typeof sourceCampaign.workflow_definition === 'object'
            ? (sourceCampaign.workflow_definition as WorkflowDefinition)
            : null

        const payload: Record<string, unknown> = {
          user_id: user.id,
          name,
          description:
            typeof sourceCampaign.description === 'string' ? sourceCampaign.description : null,
          status: 'draft',
          trigger_type:
            typeof sourceCampaign.trigger_type === 'string'
              ? sourceCampaign.trigger_type
              : 'manual',
          trigger_offset_days: Number(sourceCampaign.trigger_offset_days ?? 0),
          timezone:
            typeof sourceCampaign.timezone === 'string'
              ? sourceCampaign.timezone
              : 'Asia/Kuala_Lumpur',
          audience_filters:
            sourceCampaign.audience_filters && typeof sourceCampaign.audience_filters === 'object'
              ? sourceCampaign.audience_filters
              : {},
          daily_send_limit: Math.max(1, Number(sourceCampaign.daily_send_limit ?? 100)),
          cooldown_days: Math.max(0, Number(sourceCampaign.cooldown_days ?? 30)),
          start_at: sourceCampaign.start_at ?? null,
          end_at: sourceCampaign.end_at ?? null,
          workflow_layout:
            sourceCampaign.workflow_layout && typeof sourceCampaign.workflow_layout === 'object'
              ? sourceCampaign.workflow_layout
              : null,
          workflow_definition: workflowDefinition,
        }

        const { data: insertedCampaign, error: insertErr } = await supabase
          .from('campaigns')
          .insert(payload as never)
          .select('id')
          .single()
        if (insertErr) throw insertErr

        let compiledSteps: Array<Record<string, unknown>> = sourceSteps
        if (workflowDefinition != null) {
          try {
            compiledSteps = compileWorkflowDefinition(workflowDefinition).steps as Array<
              Record<string, unknown>
            >
          } catch (e: unknown) {
            warnings.push({
              index: i,
              name,
              warning:
                'Workflow imported, but step compilation failed. Campaign was created with config only.',
            })
            compiledSteps = []
          }
        }

        const stepRows = compiledSteps.map((s, idx) => ({
          campaign_id: insertedCampaign.id,
          // Ensure uniqueness within imported campaign.
          step_order: idx + 1,
          delay_days: Math.max(0, Number(s.delay_days ?? 0)),
          send_time: normalizeSendTimeForDb(
            s.send_time != null ? String(s.send_time) : undefined
          ),
          message_template: String(s.message_template ?? ''),
          is_active: s.is_active !== false,
        }))
        if (stepRows.length > 0) {
          const { error: stepErr } = await supabase.from('campaign_steps').insert(stepRows)
          if (stepErr) {
            warnings.push({
              index: i,
              name,
              warning:
                'Campaign imported, but step rows failed to insert. Workflow config is saved and can be opened/saved in editor.',
            })
          }
        }

        imported += 1
      } catch (e: unknown) {
        failures.push({
          index: i,
          name,
          error: e instanceof Error ? e.message : 'Failed to import campaign',
        })
      }
    }

    return NextResponse.json({
      data: {
        total: list.length,
        imported,
        failed: failures.length,
        failures,
        warnings,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to import campaigns'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
