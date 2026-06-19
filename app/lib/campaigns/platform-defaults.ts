import type { SupabaseClient } from '@supabase/supabase-js'
import { CAMPAIGN_WORKFLOW_MEDIA_BUCKET } from '@/app/lib/campaigns/image-step/defaults'
import { normalizeSendTimeForDb } from '@/app/lib/campaigns/schedule'
import { compileWorkflowDefinition } from '@/app/lib/workflows/compile'
import { stripExportedGmailFallbackTemplate, sanitizeCampaignRecordForTransfer } from '@/app/lib/workflows/sanitize-export'
import {
  collectImageStepMediaRefs,
  imageStepsMissingBundledMedia,
  remapWorkflowDefinitionBackgroundPaths,
  type WorkflowMediaExportAsset,
} from '@/app/lib/workflows/workflow-media-transfer'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'
import { isProSubscriptionActive } from '@/app/lib/saas/billing'
import { isPlatformAdmin } from '@/app/lib/saas/admin-access'
import type { SaasSubscriptionStatus } from '@/app/lib/saas/types'

export const PLATFORM_DEFAULTS_FREE_ID = 'default'

export type PlatformDefaultTier = 'free' | 'pro'

type PlatformCampaignStep = {
  step_order: number
  delay_days: number
  send_time: string | null
  message_template: string
  is_active: boolean
}

export type PlatformCampaignDefault = {
  id: string
  tier: PlatformDefaultTier
  sort_order: number
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
  compiled_steps: PlatformCampaignStep[]
  source_campaign_id: string | null
  updated_at?: string
}

/** Lightweight row for admin list views (no workflow_definition payload). */
export type PlatformCampaignDefaultListItem = Omit<
  PlatformCampaignDefault,
  'workflow_definition' | 'workflow_layout' | 'audience_filters'
> & {
  step_count: number
}

/** @deprecated Use PLATFORM_DEFAULTS_FREE_ID */
export const PLATFORM_DEFAULTS_ID = PLATFORM_DEFAULTS_FREE_ID

export function platformDefaultMediaRoot(defaultId: string): string {
  return `platform-defaults/${defaultId.trim()}`
}

/** @deprecated Use platformDefaultMediaRoot(defaultId) */
export const PLATFORM_MEDIA_ROOT = platformDefaultMediaRoot(PLATFORM_DEFAULTS_FREE_ID)

export function isPlatformDefaultMediaPath(path: string): boolean {
  return path.trim().startsWith('platform-defaults/')
}

export function platformDefaultMediaPath(defaultId: string, nodeId: string, mimetype = 'image/png'): string {
  const ext =
    mimetype === 'image/jpeg' ? 'jpg' : mimetype === 'image/webp' ? 'webp' : mimetype === 'image/gif' ? 'gif' : 'png'
  return `${platformDefaultMediaRoot(defaultId)}/${nodeId}/background.${ext}`
}

function rewriteWorkflowDefinitionMediaPaths(
  defaultId: string,
  def: WorkflowDefinition
): WorkflowDefinition {
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
          background_path: platformDefaultMediaPath(defaultId, nodeId, mimetype),
          gmail_fallback_template: '',
        },
      }
    }),
  }
}

function compileStepsForStorage(def: WorkflowDefinition): PlatformCampaignDefault['compiled_steps'] {
  return compileWorkflowDefinition(def).steps.map((s, index) => ({
    step_order: index + 1,
    delay_days: s.delay_days,
    send_time: normalizeSendTimeForDb(s.send_time),
    message_template: String(s.message_template ?? ''),
    is_active: s.is_active !== false,
  }))
}

function rowToDefault(data: Record<string, unknown>): PlatformCampaignDefault | null {
  const def = data.workflow_definition as WorkflowDefinition | null
  if (!def?.nodes?.length) return null
  return {
    id: String(data.id),
    tier: data.tier === 'pro' ? 'pro' : 'free',
    sort_order: Number(data.sort_order ?? 0),
    name: String(data.name ?? 'Birthday'),
    description: (data.description as string | null) ?? null,
    trigger_type: String(data.trigger_type ?? 'manual'),
    trigger_offset_days: Number(data.trigger_offset_days ?? 0),
    timezone: String(data.timezone ?? 'Asia/Kuala_Lumpur'),
    audience_filters: (data.audience_filters as Record<string, unknown>) ?? {},
    daily_send_limit: Number(data.daily_send_limit ?? 100),
    cooldown_days: Number(data.cooldown_days ?? 0),
    workflow_definition: def,
    workflow_layout: (data.workflow_layout as Record<string, unknown> | null) ?? null,
    compiled_steps: Array.isArray(data.compiled_steps)
      ? (data.compiled_steps as PlatformCampaignDefault['compiled_steps'])
      : [],
    source_campaign_id: (data.source_campaign_id as string | null) ?? null,
    updated_at: (data.updated_at as string | undefined) ?? undefined,
  }
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
  defaultId: string,
  def: WorkflowDefinition
): Promise<WorkflowDefinition> {
  const refs = collectImageStepMediaRefs(def)
  if (refs.length === 0) return def

  for (const ref of refs) {
    const targetPath = platformDefaultMediaPath(defaultId, ref.node_id, ref.mimetype)
    if (ref.source_path === targetPath) continue
    await copyMediaToPlatformStorage(supabase, ref.source_path, targetPath, ref.mimetype)
  }

  return rewriteWorkflowDefinitionMediaPaths(defaultId, def)
}

export async function loadPlatformCampaignDefault(
  supabase: SupabaseClient,
  id = PLATFORM_DEFAULTS_FREE_ID
): Promise<PlatformCampaignDefault | null> {
  const { data, error } = await supabase
    .from('campaign_platform_defaults')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return rowToDefault(data as Record<string, unknown>)
}

export async function loadAllPlatformCampaignDefaults(
  supabase: SupabaseClient
): Promise<PlatformCampaignDefault[]> {
  const { data, error } = await supabase
    .from('campaign_platform_defaults')
    .select('*')
    .order('tier', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? [])
    .map((row) => rowToDefault(row as Record<string, unknown>))
    .filter((row): row is PlatformCampaignDefault => row != null)
}

function rowToListItem(data: Record<string, unknown>): PlatformCampaignDefaultListItem | null {
  const compiled_steps = Array.isArray(data.compiled_steps)
    ? (data.compiled_steps as PlatformCampaignStep[])
    : []
  const name = typeof data.name === 'string' ? data.name.trim() : ''
  if (!name) return null

  return {
    id: String(data.id),
    tier: data.tier === 'pro' ? 'pro' : 'free',
    sort_order: Number(data.sort_order ?? 0),
    name,
    description: typeof data.description === 'string' ? data.description : null,
    trigger_type: String(data.trigger_type ?? 'manual'),
    trigger_offset_days: Number(data.trigger_offset_days ?? 0),
    timezone: String(data.timezone ?? 'Asia/Kuala_Lumpur'),
    daily_send_limit: Math.max(1, Number(data.daily_send_limit ?? 100)),
    cooldown_days: Math.max(0, Number(data.cooldown_days ?? 30)),
    compiled_steps,
    step_count: compiled_steps.length,
    source_campaign_id:
      typeof data.source_campaign_id === 'string' ? data.source_campaign_id : null,
    updated_at: typeof data.updated_at === 'string' ? data.updated_at : undefined,
  }
}

export async function loadAllPlatformCampaignDefaultsList(
  supabase: SupabaseClient
): Promise<PlatformCampaignDefaultListItem[]> {
  const { data, error } = await supabase
    .from('campaign_platform_defaults')
    .select(
      'id, tier, sort_order, name, description, trigger_type, trigger_offset_days, timezone, daily_send_limit, cooldown_days, compiled_steps, source_campaign_id, updated_at, created_at'
    )
    .order('tier', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? [])
    .map((row) => rowToListItem(row as Record<string, unknown>))
    .filter((row): row is PlatformCampaignDefaultListItem => row != null)
}

export function listImportCampaignItems(payload: unknown): ParsedPlatformDefaultImport[] {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as Record<string, unknown>

  if (Array.isArray(root.campaigns)) {
    return root.campaigns
      .map((item, index) => parsePlatformDefaultImportItem(payload, index))
      .filter((item): item is ParsedPlatformDefaultImport => item != null)
  }

  const single = parsePlatformDefaultImportItem(payload, 0)
  return single ? [single] : []
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
    step_order: i + 1,
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
    .eq('platform_default_id', defaults.id)

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

export async function countLinkedPlatformDefaultCampaigns(
  supabase: SupabaseClient,
  defaultId?: string
): Promise<number> {
  let query = supabase
    .from('campaigns')
    .select('*', { count: 'exact', head: true })
    .eq('uses_platform_defaults', true)

  if (defaultId) {
    query = query.eq('platform_default_id', defaultId)
  }

  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

function newProDefaultId(): string {
  return `pro-${crypto.randomUUID()}`
}

async function nextProSortOrder(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from('campaign_platform_defaults')
    .select('sort_order')
    .eq('tier', 'pro')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  return Number(data?.sort_order ?? 0) + 1
}

async function upsertPlatformDefault(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<PlatformCampaignDefault> {
  const { error: upsertErr } = await supabase.from('campaign_platform_defaults').upsert(payload)
  if (upsertErr) throw upsertErr
  const saved = await loadPlatformCampaignDefault(supabase, String(payload.id))
  if (!saved) throw new Error('Failed to load saved platform default')
  return saved
}

export async function savePlatformCampaignDefaultFromEditor(
  supabase: SupabaseClient,
  input: {
    id?: string
    name?: string
    workflow_definition: WorkflowDefinition
    workflow_layout?: Record<string, unknown> | null
  }
): Promise<{ defaults: PlatformCampaignDefault; synced_campaigns: number }> {
  const defaultId = (input.id || PLATFORM_DEFAULTS_FREE_ID).trim()
  const existing = await loadPlatformCampaignDefault(supabase, defaultId)

  const stripped = stripExportedGmailFallbackTemplate(input.workflow_definition)
  if (!stripped?.nodes?.length) {
    throw new Error('Invalid workflow definition')
  }

  const workflowDefinition = await ensurePlatformMediaFromWorkflow(supabase, defaultId, stripped)
  const compiled = compileWorkflowDefinition(workflowDefinition)
  const compiled_steps = compileStepsForStorage(workflowDefinition)

  const payload = {
    id: defaultId,
    tier: existing?.tier ?? (defaultId === PLATFORM_DEFAULTS_FREE_ID ? 'free' : 'pro'),
    sort_order: existing?.sort_order ?? 0,
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

  const defaults = await upsertPlatformDefault(supabase, payload)
  const synced_campaigns = await syncLinkedPlatformDefaultCampaigns(supabase, defaults)
  return { defaults, synced_campaigns }
}

/** Update template metadata (syncs linked user campaigns). */
export type PlatformDefaultMetadataInput = {
  name?: string
  tier?: PlatformDefaultTier
  description?: string | null
  trigger_type?: string
  trigger_offset_days?: number
  timezone?: string
  daily_send_limit?: number
  cooldown_days?: number
}

export async function updatePlatformCampaignDefaultMetadata(
  supabase: SupabaseClient,
  defaultId: string,
  input: PlatformDefaultMetadataInput
): Promise<{ defaults: PlatformCampaignDefault; synced_campaigns: number }> {
  const id = defaultId.trim()
  if (!id) throw new Error('Template id is required')

  const existing = await loadPlatformCampaignDefault(supabase, id)
  if (!existing) throw new Error('Template not found')

  const name = typeof input.name === 'string' ? input.name.trim() : existing.name
  if (!name) throw new Error('Name is required')

  const tier = input.tier === 'pro' || input.tier === 'free' ? input.tier : existing.tier
  const description =
    input.description !== undefined
      ? typeof input.description === 'string'
        ? input.description.trim() || null
        : null
      : existing.description
  const trigger_type =
    typeof input.trigger_type === 'string' && input.trigger_type.trim()
      ? input.trigger_type.trim()
      : existing.trigger_type
  const trigger_offset_days =
    typeof input.trigger_offset_days === 'number' && Number.isFinite(input.trigger_offset_days)
      ? Math.trunc(input.trigger_offset_days)
      : existing.trigger_offset_days
  const timezone =
    typeof input.timezone === 'string' && input.timezone.trim()
      ? input.timezone.trim()
      : existing.timezone
  const daily_send_limit =
    typeof input.daily_send_limit === 'number' && Number.isFinite(input.daily_send_limit)
      ? Math.max(1, Math.trunc(input.daily_send_limit))
      : existing.daily_send_limit
  const cooldown_days =
    typeof input.cooldown_days === 'number' && Number.isFinite(input.cooldown_days)
      ? Math.max(0, Math.trunc(input.cooldown_days))
      : existing.cooldown_days
  const tierChanged = tier !== existing.tier
  const sort_order = tierChanged
    ? tier === 'pro'
      ? await nextProSortOrder(supabase)
      : 0
    : existing.sort_order

  const { data: row, error: loadErr } = await supabase
    .from('campaign_platform_defaults')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) throw loadErr
  if (!row) throw new Error('Template not found')

  const defaults = await upsertPlatformDefault(supabase, {
    ...row,
    name,
    description,
    tier,
    trigger_type,
    trigger_offset_days,
    timezone,
    daily_send_limit,
    cooldown_days,
    sort_order,
    updated_at: new Date().toISOString(),
  })
  const synced_campaigns = await syncLinkedPlatformDefaultCampaigns(supabase, defaults)
  return { defaults, synced_campaigns }
}

export async function savePlatformCampaignDefaultFromCampaign(
  supabase: SupabaseClient,
  campaignId: string,
  opts?: { tier?: PlatformDefaultTier; defaultId?: string; name?: string }
): Promise<{ defaults: PlatformCampaignDefault; synced_campaigns: number }> {
  const tier = opts?.tier ?? 'free'
  const defaultId =
    tier === 'free'
      ? PLATFORM_DEFAULTS_FREE_ID
      : (opts?.defaultId || newProDefaultId()).trim()

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

  const workflowDefinition = await ensurePlatformMediaFromWorkflow(supabase, defaultId, stripped)
  const compiled_steps = compileStepsForStorage(workflowDefinition)
  const existing = await loadPlatformCampaignDefault(supabase, defaultId)

  const payload = {
    id: defaultId,
    tier,
    sort_order:
      tier === 'pro'
        ? existing?.sort_order ?? (await nextProSortOrder(supabase))
        : 0,
    name: opts?.name?.trim() || String(campaign.name ?? 'Birthday'),
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

  const defaults = await upsertPlatformDefault(supabase, payload)
  const synced_campaigns = await syncLinkedPlatformDefaultCampaigns(supabase, defaults)
  return { defaults, synced_campaigns }
}

export async function deletePlatformCampaignDefault(
  supabase: SupabaseClient,
  defaultId: string
): Promise<void> {
  const id = defaultId.trim()
  if (!id) throw new Error('Template id is required')
  const { error } = await supabase.from('campaign_platform_defaults').delete().eq('id', id)
  if (error) throw error
}

export async function ensureUserDefaultCampaign(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase.rpc('provision_platform_defaults_for_tier', {
    p_user_id: userId,
    p_tier: 'free',
  })
  if (error) throw error
}

export async function provisionProPlatformDefaults(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase.rpc('provision_platform_defaults_for_tier', {
    p_user_id: userId,
    p_tier: 'pro',
  })
  if (error) throw error
}

export type PublishPlatformDefaultResult = {
  defaults: PlatformCampaignDefault
  tier: PlatformDefaultTier
  target_users: number
  provisioned: number
  synced: number
  set_to_draft: number
}

type SubscriptionWithPlan = {
  user_id: string
  status: SaasSubscriptionStatus
  trial_ends_at: string | null
  current_period_end: string | null
  plan: { slug: string } | { slug: string }[] | null
}

function planSlugFromSubscription(sub: SubscriptionWithPlan): string {
  const plan = sub.plan
  if (Array.isArray(plan)) return String(plan[0]?.slug ?? 'free')
  return String(plan?.slug ?? 'free')
}

async function listTargetUserIdsForDefaultTier(
  supabase: SupabaseClient,
  tier: PlatformDefaultTier
): Promise<string[]> {
  const { data: subs, error } = await supabase
    .from('saas_subscriptions')
    .select('user_id, status, trial_ends_at, current_period_end, plan:saas_plans(slug)')

  if (error) throw error

  const now = new Date()
  const userIds: string[] = []

  for (const raw of subs ?? []) {
    const sub = raw as SubscriptionWithPlan
    const planSlug = planSlugFromSubscription(sub)
    const proActive = isProSubscriptionActive({
      planSlug,
      status: sub.status,
      trialEndsAt: sub.trial_ends_at,
      currentPeriodEnd: sub.current_period_end,
      now,
    })

    const matchesTier = tier === 'pro' ? proActive : !proActive
    if (!matchesTier) continue
    if (await isPlatformAdmin(sub.user_id)) continue
    userIds.push(sub.user_id)
  }

  return userIds
}

async function provisionPlatformDefaultForUserIfMissing(
  supabase: SupabaseClient,
  userId: string,
  defaults: PlatformCampaignDefault
): Promise<boolean> {
  if (
    !defaults.workflow_definition?.nodes?.length
  ) {
    return false
  }

  const { data: existing, error: existsErr } = await supabase
    .from('campaigns')
    .select('id')
    .eq('user_id', userId)
    .eq('platform_default_id', defaults.id)
    .maybeSingle()

  if (existsErr) throw existsErr
  if (existing) return false

  const { data: campaign, error: insertErr } = await supabase
    .from('campaigns')
    .insert({
      user_id: userId,
      name: defaults.name,
      description: defaults.description,
      status: 'draft',
      trigger_type: defaults.trigger_type,
      trigger_offset_days: defaults.trigger_offset_days,
      timezone: defaults.timezone,
      audience_filters: defaults.audience_filters,
      daily_send_limit: defaults.daily_send_limit,
      cooldown_days: defaults.cooldown_days,
      workflow_definition: defaults.workflow_definition as never,
      workflow_layout: defaults.workflow_layout as never,
      uses_platform_defaults: true,
      platform_default_id: defaults.id,
    })
    .select('id')
    .single()

  if (insertErr) throw insertErr
  await replaceCampaignSteps(supabase, campaign.id, defaults.compiled_steps)
  return true
}

/** Release a platform template to all users on its tier (provision missing + sync linked). */
export async function publishPlatformCampaignDefault(
  supabase: SupabaseClient,
  defaultId: string
): Promise<PublishPlatformDefaultResult> {
  const id = defaultId.trim()
  if (!id) throw new Error('Template id is required')

  const defaults = await loadPlatformCampaignDefault(supabase, id)
  if (!defaults) throw new Error('Template not found')
  if (!defaults.workflow_definition?.nodes?.length) {
    throw new Error('Template has no workflow to publish')
  }

  const targetUserIds = await listTargetUserIdsForDefaultTier(supabase, defaults.tier)
  let provisioned = 0

  for (const userId of targetUserIds) {
    const created = await provisionPlatformDefaultForUserIfMissing(supabase, userId, defaults)
    if (created) provisioned += 1
  }

  const synced = await syncLinkedPlatformDefaultCampaigns(supabase, defaults)

  let set_to_draft = 0
  const { data: linked, error: linkedErr } = await supabase
    .from('campaigns')
    .select('id, status')
    .eq('uses_platform_defaults', true)
    .eq('platform_default_id', defaults.id)

  if (linkedErr) throw linkedErr

  const nowIso = new Date().toISOString()
  for (const row of linked ?? []) {
    if (row.status === 'draft') continue
    const { error: draftErr } = await supabase
      .from('campaigns')
      .update({ status: 'draft', updated_at: nowIso })
      .eq('id', row.id)

    if (draftErr) throw draftErr
    set_to_draft += 1
  }

  await supabase
    .from('campaign_platform_defaults')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', defaults.id)

  return {
    defaults,
    tier: defaults.tier,
    target_users: targetUserIds.length,
    provisioned,
    synced,
    set_to_draft,
  }
}

export async function loadCampaignPlatformDefaultTier(
  supabase: SupabaseClient,
  platformDefaultId: string | null | undefined
): Promise<PlatformDefaultTier | null> {
  const id = (platformDefaultId || '').trim()
  if (!id) return null
  const { data, error } = await supabase
    .from('campaign_platform_defaults')
    .select('tier')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return data.tier === 'pro' ? 'pro' : 'free'
}

export type PlatformDefaultImportPayload = {
  version?: number
  campaigns?: Array<{
    campaign?: Record<string, unknown>
    steps?: Array<Record<string, unknown>>
    workflow_media?: WorkflowMediaExportAsset[]
  }>
}

export type ParsedPlatformDefaultImport = {
  campaign: Record<string, unknown>
  steps: Array<Record<string, unknown>>
  workflow_media: WorkflowMediaExportAsset[]
}

export function countPlatformDefaultImportItems(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0
  const root = payload as Record<string, unknown>
  if (Array.isArray(root.campaigns)) {
    return root.campaigns.filter((item) => item && typeof item === 'object').length
  }
  if (root.campaign && typeof root.campaign === 'object') return 1
  return 0
}

export function parsePlatformDefaultImportItem(
  payload: unknown,
  index = 0
): ParsedPlatformDefaultImport | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>

  if (Array.isArray(root.campaigns)) {
    const item = root.campaigns[index] as Record<string, unknown> | undefined
    if (!item || typeof item !== 'object') return null
    return {
      campaign: (item.campaign as Record<string, unknown>) ?? {},
      steps: Array.isArray(item.steps) ? (item.steps as Array<Record<string, unknown>>) : [],
      workflow_media: Array.isArray(item.workflow_media)
        ? (item.workflow_media as WorkflowMediaExportAsset[])
        : [],
    }
  }

  if (root.campaign && typeof root.campaign === 'object') {
    return {
      campaign: root.campaign as Record<string, unknown>,
      steps: Array.isArray(root.steps) ? (root.steps as Array<Record<string, unknown>>) : [],
      workflow_media: Array.isArray(root.workflow_media)
        ? (root.workflow_media as WorkflowMediaExportAsset[])
        : [],
    }
  }

  return null
}

async function importPlatformMediaFromExportAssets(
  supabase: SupabaseClient,
  defaultId: string,
  assets: WorkflowMediaExportAsset[]
): Promise<Map<string, string>> {
  const pathRemap = new Map<string, string>()

  for (const asset of assets) {
    const sourcePath = asset.source_path?.trim()
    const nodeId = asset.node_id?.trim()
    const mimetype = asset.mimetype?.trim() || 'image/png'
    const dataBase64 = asset.data_base64?.trim()
    if (!sourcePath || !nodeId || !dataBase64) continue

    let buffer: Buffer
    try {
      buffer = Buffer.from(dataBase64, 'base64')
    } catch {
      continue
    }
    if (!buffer.length) continue

    const newPath = platformDefaultMediaPath(defaultId, nodeId, mimetype)
    const { error } = await supabase.storage
      .from(CAMPAIGN_WORKFLOW_MEDIA_BUCKET)
      .upload(newPath, buffer, { contentType: mimetype, upsert: true })

    if (!error) {
      pathRemap.set(sourcePath, newPath)
    }
  }

  return pathRemap
}

export async function savePlatformCampaignDefaultFromImport(
  supabase: SupabaseClient,
  input: {
    tier?: PlatformDefaultTier
    name?: string
    defaultId?: string
    importPayload: unknown
    campaignIndex?: number
  }
): Promise<{ defaults: PlatformCampaignDefault; synced_campaigns: number; warnings: string[] }> {
  const tier = input.tier ?? 'free'
  const parsed = parsePlatformDefaultImportItem(input.importPayload, input.campaignIndex ?? 0)
  if (!parsed) {
    throw new Error('Invalid import file — expected exported campaign JSON (version 2)')
  }

  const sourceCampaign = sanitizeCampaignRecordForTransfer(parsed.campaign)
  let workflowDefinition =
    sourceCampaign.workflow_definition && typeof sourceCampaign.workflow_definition === 'object'
      ? (sourceCampaign.workflow_definition as WorkflowDefinition)
      : null

  if (!workflowDefinition?.nodes?.length) {
    throw new Error('Import file has no workflow definition')
  }

  const defaultId =
    tier === 'free'
      ? PLATFORM_DEFAULTS_FREE_ID
      : (input.defaultId || newProDefaultId()).trim()
  const existing = await loadPlatformCampaignDefault(supabase, defaultId)
  const warnings: string[] = []

  if (parsed.workflow_media.length > 0) {
    const pathRemap = await importPlatformMediaFromExportAssets(
      supabase,
      defaultId,
      parsed.workflow_media
    )
    workflowDefinition = remapWorkflowDefinitionBackgroundPaths(workflowDefinition, pathRemap)
    const missing = imageStepsMissingBundledMedia(
      sourceCampaign.workflow_definition as WorkflowDefinition,
      pathRemap
    )
    if (missing.length > 0) {
      warnings.push(
        'Some image backgrounds could not be restored — re-upload them in the workflow editor.'
      )
    }
  } else if (collectImageStepMediaRefs(workflowDefinition).length > 0) {
    warnings.push(
      'Workflow has image steps but no bundled backgrounds — re-upload background images in the editor.'
    )
  }

  const stripped = stripExportedGmailFallbackTemplate(workflowDefinition)
  if (!stripped?.nodes?.length) {
    throw new Error('Invalid workflow definition after import')
  }

  const workflowDefinitionFinal = await ensurePlatformMediaFromWorkflow(supabase, defaultId, stripped)
  const compiled = compileWorkflowDefinition(workflowDefinitionFinal)
  const compiled_steps = compileStepsForStorage(workflowDefinitionFinal)

  const payload = {
    id: defaultId,
    tier,
    sort_order:
      tier === 'pro'
        ? existing?.sort_order ?? (await nextProSortOrder(supabase))
        : 0,
    name:
      input.name?.trim() ||
      (typeof sourceCampaign.name === 'string' ? sourceCampaign.name.trim() : '') ||
      existing?.name ||
      'Imported workflow',
    description:
      typeof sourceCampaign.description === 'string' ? sourceCampaign.description : existing?.description ?? null,
    trigger_type: String(sourceCampaign.trigger_type ?? compiled.trigger_type ?? 'manual'),
    trigger_offset_days: Number(sourceCampaign.trigger_offset_days ?? compiled.trigger_offset_days ?? 0),
    timezone: String(sourceCampaign.timezone ?? existing?.timezone ?? 'Asia/Kuala_Lumpur'),
    audience_filters:
      (compiled.audience_filters as Record<string, unknown>) ??
      (sourceCampaign.audience_filters as Record<string, unknown>) ??
      {},
    daily_send_limit: Math.max(1, Number(sourceCampaign.daily_send_limit ?? compiled.daily_send_limit ?? 100)),
    cooldown_days: Math.max(0, Number(sourceCampaign.cooldown_days ?? compiled.cooldown_days ?? 30)),
    workflow_definition: workflowDefinitionFinal as never,
    workflow_layout:
      (sourceCampaign.workflow_layout as Record<string, unknown> | null) ??
      existing?.workflow_layout ??
      null,
    compiled_steps: compiled_steps as never,
    source_campaign_id: null,
    updated_at: new Date().toISOString(),
  }

  const defaults = await upsertPlatformDefault(supabase, payload)
  const synced_campaigns = await syncLinkedPlatformDefaultCampaigns(supabase, defaults)
  return { defaults, synced_campaigns, warnings }
}

export async function savePlatformCampaignDefaultsFromImportBulk(
  supabase: SupabaseClient,
  input: {
    tier?: PlatformDefaultTier
    importPayload: unknown
    importAll?: boolean
  }
): Promise<{
  imported: number
  failed: number
  total: number
  synced_campaigns: number
  warnings: string[]
  defaults: PlatformCampaignDefault[]
}> {
  const tier = input.tier ?? 'pro'
  const totalInFile = countPlatformDefaultImportItems(input.importPayload)
  if (totalInFile === 0) {
    throw new Error('Invalid import file — expected exported campaign JSON (version 2)')
  }

  const importAll = input.importAll !== false && tier === 'pro'
  const indices = importAll ? Array.from({ length: totalInFile }, (_, i) => i) : [0]

  let imported = 0
  let failed = 0
  let synced_campaigns = 0
  const warnings: string[] = []
  const defaults: PlatformCampaignDefault[] = []

  if (!importAll && totalInFile > 1) {
    warnings.push(
      `Free tier accepts one template — imported the first campaign only (${totalInFile - 1} skipped). Choose Pro to import all.`
    )
  }

  for (const index of indices) {
    const parsed = parsePlatformDefaultImportItem(input.importPayload, index)
    const label =
      typeof parsed?.campaign?.name === 'string' && parsed.campaign.name.trim()
        ? parsed.campaign.name.trim()
        : `campaign #${index + 1}`

    try {
      const result = await savePlatformCampaignDefaultFromImport(supabase, {
        tier,
        importPayload: input.importPayload,
        campaignIndex: index,
      })
      imported++
      synced_campaigns += result.synced_campaigns
      for (const w of result.warnings) {
        warnings.push(`${label}: ${w}`)
      }
      defaults.push(result.defaults)
    } catch (e: unknown) {
      failed++
      const msg = e instanceof Error ? e.message : 'Import failed'
      warnings.push(`Failed to import "${label}": ${msg}`)
    }
  }

  if (imported === 0) {
    throw new Error(warnings[0] ?? 'No campaigns could be imported')
  }

  return {
    imported,
    failed,
    total: indices.length,
    synced_campaigns,
    warnings,
    defaults,
  }
}
