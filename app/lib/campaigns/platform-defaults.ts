import type { SupabaseClient } from '@supabase/supabase-js'
import { CAMPAIGN_WORKFLOW_MEDIA_BUCKET } from '@/app/lib/campaigns/image-step/defaults'
import { normalizeSendTimeForDb } from '@/app/lib/campaigns/schedule'
import { compileWorkflowDefinition } from '@/app/lib/workflows/compile'
import { stripExportedGmailFallbackTemplate } from '@/app/lib/workflows/sanitize-export'
import { collectImageStepMediaRefs } from '@/app/lib/workflows/workflow-media-transfer'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'

export const PLATFORM_DEFAULTS_ID = 'default'
export const PLATFORM_MEDIA_ROOT = `platform-defaults/${PLATFORM_DEFAULTS_ID}`

export type PlatformCampaignDefault = {
  id: string
  name: string
  description: string | null
  trigger_type: string
  trigger_offset_days: number
  timezone: string
  audience_filters: Record<string, unknown>
  daily_send_limit: number
  cooldown_days: number
  workflow_definition: WorkflowDefinition
  workflow_layout: Record<string, unknown> | null
  compiled_steps: Array<{
    step_order: number
    delay_days: number
    send_time: string | null
    message_template: string
    is_active: boolean
  }>
  source_campaign_id: string | null
  updated_at?: string
}

export function isPlatformDefaultMediaPath(path: string): boolean {
  return path.trim().startsWith(`${PLATFORM_MEDIA_ROOT}/`)
}

export function platformDefaultMediaPath(nodeId: string, mimetype = 'image/png'): string {
  const ext =
    mimetype === 'image/jpeg' ? 'jpg' : mimetype === 'image/webp' ? 'webp' : mimetype === 'image/gif' ? 'gif' : 'png'
  return `${PLATFORM_MEDIA_ROOT}/${nodeId}/background.${ext}`
}

function rewriteWorkflowDefinitionMediaPaths(def: WorkflowDefinition): WorkflowDefinition {
  return {
    ...def,
    nodes: def.nodes.map((node) => {
      if (node.type !== 'crm.whatsapp.send_image') return node
      const nodeId = String(node.id ?? '').trim()
      if (!nodeId) return node
      const mimetype = String(node.parameters?.background_mimetype ?? 'image/png').trim() || 'image/png'
      return {
        ...node,
        parameters: {
          ...node.parameters,
          background_path: platformDefaultMediaPath(nodeId, mimetype),
          gmail_fallback_template: '',
        },
      }
    }),
  }
}

function compileStepsForStorage(def: WorkflowDefinition): PlatformCampaignDefault['compiled_steps'] {
  return compileWorkflowDefinition(def).steps.map((s) => ({
    step_order: s.step_order,
    delay_days: s.delay_days,
    send_time: normalizeSendTimeForDb(s.send_time),
    message_template: String(s.message_template ?? ''),
    is_active: s.is_active !== false,
  }))
}

async function copyMediaToPlatformStorage(
  supabase: SupabaseClient,
  sourcePath: string,
  targetPath: string,
  mimetype: string
): Promise<void> {
  const { data, error } = await supabase.storage.from(CAMPAIGN_WORKFLOW_MEDIA_BUCKET).download(sourcePath)
  if (error || !data) {
    throw new Error(error?.message ?? `Failed to load media at ${sourcePath}`)
  }
  const buffer =
    data instanceof Blob ? Buffer.from(await data.arrayBuffer()) : Buffer.isBuffer(data) ? data : Buffer.from(data)
  if (!buffer.length) {
    throw new Error(`Empty media file at ${sourcePath}`)
  }
  const { error: uploadErr } = await supabase.storage
    .from(CAMPAIGN_WORKFLOW_MEDIA_BUCKET)
    .upload(targetPath, buffer, { contentType: mimetype, upsert: true })
  if (uploadErr) throw uploadErr
}

async function ensurePlatformMediaFromWorkflow(
  supabase: SupabaseClient,
  def: WorkflowDefinition
): Promise<WorkflowDefinition> {
  const refs = collectImageStepMediaRefs(def)
  if (refs.length === 0) return def

  for (const ref of refs) {
    const targetPath = platformDefaultMediaPath(ref.node_id, ref.mimetype)
    if (ref.source_path === targetPath) continue
    await copyMediaToPlatformStorage(supabase, ref.source_path, targetPath, ref.mimetype)
  }

  return rewriteWorkflowDefinitionMediaPaths(def)
}

export async function loadPlatformCampaignDefault(
  supabase: SupabaseClient
): Promise<PlatformCampaignDefault | null> {
  const { data, error } = await supabase
    .from('campaign_platform_defaults')
    .select('*')
    .eq('id', PLATFORM_DEFAULTS_ID)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const def = data.workflow_definition as WorkflowDefinition | null
  if (!def?.nodes?.length) return null

  return {
    id: data.id,
    name: data.name ?? 'Birthday',
    description: data.description ?? null,
    trigger_type: data.trigger_type ?? 'manual',
    trigger_offset_days: Number(data.trigger_offset_days ?? 0),
    timezone: data.timezone ?? 'Asia/Kuala_Lumpur',
    audience_filters: (data.audience_filters as Record<string, unknown>) ?? {},
    daily_send_limit: Number(data.daily_send_limit ?? 100),
    cooldown_days: Number(data.cooldown_days ?? 0),
    workflow_definition: def,
    workflow_layout: (data.workflow_layout as Record<string, unknown> | null) ?? null,
    compiled_steps: Array.isArray(data.compiled_steps) ? (data.compiled_steps as PlatformCampaignDefault['compiled_steps']) : [],
    source_campaign_id: data.source_campaign_id ?? null,
    updated_at: data.updated_at ?? undefined,
  }
}

async function replaceCampaignSteps(
  supabase: SupabaseClient,
  campaignId: string,
  steps: PlatformCampaignDefault['compiled_steps']
): Promise<void> {
  await supabase.from('campaign_steps').delete().eq('campaign_id', campaignId)
  if (steps.length === 0) return

  const rows = steps.map((s, i) => ({
    campaign_id: campaignId,
    step_order: Number.isFinite(s.step_order) ? s.step_order : i + 1,
    delay_days: Math.max(0, Number(s.delay_days ?? 0)),
    send_time: s.send_time,
    message_template: String(s.message_template ?? ''),
    is_active: s.is_active !== false,
  }))

  const { error } = await supabase.from('campaign_steps').insert(rows)
  if (error) throw error
}

export async function syncLinkedPlatformDefaultCampaigns(
  supabase: SupabaseClient,
  defaults: PlatformCampaignDefault
): Promise<number> {
  const { data: linked, error } = await supabase
    .from('campaigns')
    .select('id')
    .eq('uses_platform_defaults', true)

  if (error) throw error
  let synced = 0

  for (const row of linked ?? []) {
    const { error: updErr } = await supabase
      .from('campaigns')
      .update({
        name: defaults.name,
        description: defaults.description,
        trigger_type: defaults.trigger_type,
        trigger_offset_days: defaults.trigger_offset_days,
        timezone: defaults.timezone,
        audience_filters: defaults.audience_filters,
        daily_send_limit: defaults.daily_send_limit,
        cooldown_days: defaults.cooldown_days,
        workflow_definition: defaults.workflow_definition as never,
        workflow_layout: defaults.workflow_layout as never,
      })
      .eq('id', row.id)

    if (updErr) throw updErr
    await replaceCampaignSteps(supabase, row.id, defaults.compiled_steps)
    synced += 1
  }

  return synced
}

export async function savePlatformCampaignDefaultFromEditor(
  supabase: SupabaseClient,
  input: {
    name?: string
    workflow_definition: WorkflowDefinition
    workflow_layout?: Record<string, unknown> | null
  }
): Promise<{ defaults: PlatformCampaignDefault; synced_campaigns: number }> {
  const existing = await loadPlatformCampaignDefault(supabase)

  const stripped = stripExportedGmailFallbackTemplate(input.workflow_definition)
  if (!stripped?.nodes?.length) {
    throw new Error('Invalid workflow definition')
  }

  const workflowDefinition = await ensurePlatformMediaFromWorkflow(supabase, stripped)
  const compiled = compileWorkflowDefinition(workflowDefinition)
  const compiled_steps = compileStepsForStorage(workflowDefinition)

  const payload = {
    id: PLATFORM_DEFAULTS_ID,
    name: input.name?.trim() || existing?.name || 'Birthday',
    description: existing?.description ?? null,
    trigger_type: compiled.trigger_type,
    trigger_offset_days: compiled.trigger_offset_days,
    timezone: existing?.timezone ?? 'Asia/Kuala_Lumpur',
    audience_filters: compiled.audience_filters as Record<string, unknown>,
    daily_send_limit: compiled.daily_send_limit,
    cooldown_days: compiled.cooldown_days,
    workflow_definition: workflowDefinition as never,
    workflow_layout: input.workflow_layout ?? existing?.workflow_layout ?? null,
    compiled_steps: compiled_steps as never,
    source_campaign_id: existing?.source_campaign_id ?? null,
    updated_at: new Date().toISOString(),
  }

  const { error: upsertErr } = await supabase.from('campaign_platform_defaults').upsert(payload)
  if (upsertErr) throw upsertErr

  const defaults = (await loadPlatformCampaignDefault(supabase))!
  const synced_campaigns = await syncLinkedPlatformDefaultCampaigns(supabase, defaults)
  return { defaults, synced_campaigns }
}

export async function savePlatformCampaignDefaultFromCampaign(
  supabase: SupabaseClient,
  campaignId: string
): Promise<{ defaults: PlatformCampaignDefault; synced_campaigns: number }> {
  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle()

  if (cErr) throw cErr
  if (!campaign) throw new Error('Campaign not found')

  const rawDef = campaign.workflow_definition as WorkflowDefinition | null
  if (!rawDef?.nodes?.length) {
    throw new Error('Campaign has no workflow definition')
  }

  const stripped = stripExportedGmailFallbackTemplate(rawDef)
  if (!stripped) {
    throw new Error('Invalid workflow definition')
  }

  const workflowDefinition = await ensurePlatformMediaFromWorkflow(supabase, stripped)
  const compiled_steps = compileStepsForStorage(workflowDefinition)

  const payload = {
    id: PLATFORM_DEFAULTS_ID,
    name: String(campaign.name ?? 'Birthday'),
    description: campaign.description ?? null,
    trigger_type: String(campaign.trigger_type ?? 'manual'),
    trigger_offset_days: Number(campaign.trigger_offset_days ?? 0),
    timezone: String(campaign.timezone ?? 'Asia/Kuala_Lumpur'),
    audience_filters: (campaign.audience_filters as Record<string, unknown>) ?? {},
    daily_send_limit: Math.max(1, Number(campaign.daily_send_limit ?? 100)),
    cooldown_days: Math.max(0, Number(campaign.cooldown_days ?? 30)),
    workflow_definition: workflowDefinition as never,
    workflow_layout: (campaign.workflow_layout as Record<string, unknown> | null) ?? null,
    compiled_steps: compiled_steps as never,
    source_campaign_id: campaignId,
    updated_at: new Date().toISOString(),
  }

  const { error: upsertErr } = await supabase.from('campaign_platform_defaults').upsert(payload)
  if (upsertErr) throw upsertErr

  const defaults = (await loadPlatformCampaignDefault(supabase))!
  const synced_campaigns = await syncLinkedPlatformDefaultCampaigns(supabase, defaults)

  return { defaults, synced_campaigns }
}

export async function countLinkedPlatformDefaultCampaigns(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('campaigns')
    .select('*', { count: 'exact', head: true })
    .eq('uses_platform_defaults', true)

  if (error) throw error
  return count ?? 0
}

/** Provision platform default draft campaign if user has none (signup backfill + first visit). */
export async function ensureUserDefaultCampaign(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase.rpc('provision_platform_default_campaign', {
    p_user_id: userId,
  })
  if (error) throw error
}
