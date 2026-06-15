#!/usr/bin/env node
/**
 * One-off: set platform default campaign from a source campaign ID.
 * Usage: node scripts/seed-campaign-platform-default.mjs [campaign_id]
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const campaignId = process.argv[2] || '825c980a-ca90-45c7-b375-3b143ade5369'

function loadEnv() {
  const path = resolve(process.cwd(), '.env')
  const text = readFileSync(path, 'utf8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = /^([^#=]+)=(.*)$/.exec(line.trim())
    if (!m) continue
    env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '')
  }
  return env
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(url, key)
const PLATFORM_MEDIA_ROOT = 'platform-defaults/default'
const BUCKET = 'campaign-workflow-media'

function platformPath(nodeId, mimetype = 'image/png') {
  const ext =
    mimetype === 'image/jpeg' ? 'jpg' : mimetype === 'image/webp' ? 'webp' : mimetype === 'image/gif' ? 'gif' : 'png'
  return `${PLATFORM_MEDIA_ROOT}/${nodeId}/background.${ext}`
}

async function main() {
  const { data: campaign, error: cErr } = await supabase.from('campaigns').select('*').eq('id', campaignId).maybeSingle()
  if (cErr) throw cErr
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`)

  const def = campaign.workflow_definition
  if (!def?.nodes?.length) throw new Error('Campaign has no workflow_definition')

  for (const node of def.nodes) {
    if (node.type !== 'crm.whatsapp.send_image') continue
    const sourcePath = String(node.parameters?.background_path ?? '').trim()
    const nodeId = String(node.id ?? '').trim()
    const mimetype = String(node.parameters?.background_mimetype ?? 'image/png')
    if (!sourcePath || !nodeId) continue
    const targetPath = platformPath(nodeId, mimetype)
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(sourcePath)
    if (dlErr || !blob) throw new Error(`Download failed ${sourcePath}: ${dlErr?.message}`)
    const buffer = Buffer.from(await blob.arrayBuffer())
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(targetPath, buffer, {
      contentType: mimetype,
      upsert: true,
    })
    if (upErr) throw upErr
    node.parameters.background_path = targetPath
    node.parameters.gmail_fallback_template = ''
  }

  for (const node of def.nodes) {
    if (node.type === 'crm.whatsapp.send' && Number(node.parameters?.step_order) === 1) {
      node.parameters.gmail_fallback_template = ''
    }
  }

  const { data: steps } = await supabase
    .from('campaign_steps')
    .select('step_order, delay_days, send_time, message_template, is_active')
    .eq('campaign_id', campaignId)
    .order('step_order')

  const compiled_steps = (steps ?? []).map((s) => ({
    step_order: s.step_order,
    delay_days: s.delay_days,
    send_time: s.send_time,
    message_template: s.message_template,
    is_active: s.is_active,
  }))

  const payload = {
    id: 'default',
    name: campaign.name,
    description: campaign.description,
    trigger_type: campaign.trigger_type,
    trigger_offset_days: campaign.trigger_offset_days,
    timezone: campaign.timezone,
    audience_filters: campaign.audience_filters ?? {},
    daily_send_limit: campaign.daily_send_limit,
    cooldown_days: campaign.cooldown_days,
    workflow_definition: def,
    workflow_layout: campaign.workflow_layout,
    compiled_steps,
    source_campaign_id: campaignId,
    updated_at: new Date().toISOString(),
  }

  const { error: upsertErr } = await supabase.from('campaign_platform_defaults').upsert(payload)
  if (upsertErr) throw upsertErr

  console.log('Platform default saved:', payload.name, `(${def.nodes.length} nodes, ${compiled_steps.length} steps)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
