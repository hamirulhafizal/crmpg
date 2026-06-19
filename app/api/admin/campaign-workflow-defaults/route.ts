import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import {
  countLinkedPlatformDefaultCampaigns,
  deletePlatformCampaignDefault,
  loadAllPlatformCampaignDefaultsList,
  loadPlatformCampaignDefault,
  updatePlatformCampaignDefaultMetadata,
  savePlatformCampaignDefaultFromCampaign,
  savePlatformCampaignDefaultFromEditor,
  savePlatformCampaignDefaultFromImport,
  savePlatformCampaignDefaultsFromImportBulk,
  countPlatformDefaultImportItems,
} from '@/app/lib/campaigns/platform-defaults'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export const maxDuration = 300

function importDebugLog(step: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[platform-default-import] ${step}`, details)
  }
}

function importSummaryResponse(input: {
  imported: number
  failed?: number
  total?: number
  skipped?: number
  synced_campaigns: number
  warnings: string[]
  names?: Array<{ id: string; name: string; tier: string }>
  debug?: Record<string, unknown>
}) {
  return NextResponse.json({
    imported: input.imported,
    failed: input.failed ?? 0,
    total: input.total ?? input.imported,
    skipped: input.skipped ?? 0,
    synced_campaigns: input.synced_campaigns,
    warnings: input.warnings,
    names: input.names ?? [],
    ...(process.env.NODE_ENV === 'development' && input.debug ? { _debug: input.debug } : {}),
  })
}

async function readImportFileFromForm(form: FormData): Promise<{ text: string; size: number; name: string }> {
  const fileEntry = form.get('file')
  if (fileEntry instanceof Blob) {
    const text = await fileEntry.text()
    const name = fileEntry instanceof File ? fileEntry.name : 'upload.json'
    return { text, size: fileEntry.size, name }
  }
  if (typeof fileEntry === 'string' && fileEntry.trim()) {
    return { text: fileEntry, size: fileEntry.length, name: 'upload.json' }
  }
  throw new Error('JSON file is required')
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  try {
    const admin = createServiceRoleClient()
    const url = new URL(request.url)
    const id = (url.searchParams.get('id') || '').trim()

    if (id) {
      const row = await loadPlatformCampaignDefault(admin, id)
      if (!row) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }
      return NextResponse.json({ data: row })
    }

    const defaults = await loadAllPlatformCampaignDefaultsList(admin)
    const synced_by_id: Record<string, number> = {}
    for (const row of defaults) {
      synced_by_id[row.id] = await countLinkedPlatformDefaultCampaigns(admin, row.id)
    }

    const freeDefault = defaults.find((d) => d.tier === 'free') ?? null

    return NextResponse.json({
      defaults,
      data: freeDefault,
      synced_by_id,
      synced_campaigns: Object.values(synced_by_id).reduce((a, b) => a + b, 0),
      configured: defaults.length > 0,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load default workflows'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** Import a campaign as a platform default template. */
export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''
  importDebugLog('post-start', { contentType })

  const auth = await requireAdminApi(request)
  if (!auth.ok) {
    importDebugLog('post-auth-failed', { contentType })
    return auth.response
  }
  importDebugLog('post-auth-ok', { contentType, userId: auth.user.id })

  try {
    const admin = createServiceRoleClient()
    const isMultipart = contentType.toLowerCase().includes('multipart/form-data')

    if (isMultipart) {
      const form = await request.formData()
      const tier = form.get('tier') === 'pro' ? 'pro' : 'free'

      let fileText: string
      let fileSize = 0
      let fileName = 'upload.json'
      try {
        const file = await readImportFileFromForm(form)
        fileText = file.text
        fileSize = file.size
        fileName = file.name
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'JSON file is required'
        importDebugLog('multipart-missing-file', { tier, contentType })
        return NextResponse.json({ error: msg }, { status: 400 })
      }

      let payload: unknown
      try {
        payload = JSON.parse(fileText)
      } catch (e: unknown) {
        importDebugLog('multipart-invalid-json', {
          tier,
          fileName,
          fileSize,
          error: e instanceof Error ? e.message : 'parse error',
        })
        return NextResponse.json({ error: 'Invalid JSON file' }, { status: 400 })
      }

      const totalInFile = countPlatformDefaultImportItems(payload)
      importDebugLog('multipart-parsed', { tier, fileName, fileSize, totalInFile })

      if (totalInFile === 0) {
        return NextResponse.json({ error: 'No campaigns found in export file' }, { status: 400 })
      }

      const importAll = tier === 'pro' && totalInFile > 1
      if (importAll) {
        const result = await savePlatformCampaignDefaultsFromImportBulk(admin, {
          tier,
          importPayload: payload,
          importAll: true,
        })
        importDebugLog('multipart-bulk-done', {
          tier,
          imported: result.imported,
          failed: result.failed,
          total: result.total,
        })
        return importSummaryResponse({
          imported: result.imported,
          failed: result.failed,
          total: result.total,
          synced_campaigns: result.synced_campaigns,
          warnings: result.warnings,
          names: result.defaults.map((d) => ({ id: d.id, name: d.name, tier: d.tier })),
          debug: { mode: 'bulk', fileName, fileSize, totalInFile, tier },
        })
      }

      const result = await savePlatformCampaignDefaultFromImport(admin, {
        tier,
        importPayload: payload,
        campaignIndex: 0,
      })
      const skipped = tier === 'free' && totalInFile > 1 ? totalInFile - 1 : 0
      importDebugLog('multipart-single-done', {
        tier,
        imported: 1,
        name: result.defaults.name,
        id: result.defaults.id,
      })
      return importSummaryResponse({
        imported: 1,
        failed: 0,
        total: 1,
        skipped,
        synced_campaigns: result.synced_campaigns,
        warnings:
          skipped > 0
            ? [
                ...result.warnings,
                `Free tier accepts one template — ${skipped} additional campaign(s) skipped.`,
              ]
            : result.warnings,
        names: [{ id: result.defaults.id, name: result.defaults.name, tier: result.defaults.tier }],
        debug: { mode: 'single', fileName, fileSize, totalInFile, tier, skipped },
      })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      importDebugLog('json-body-empty', { contentType })
      return NextResponse.json({ error: 'Invalid or empty request body' }, { status: 400 })
    }
    importDebugLog('json-body-path', { contentType, keys: Object.keys(body) })
    const campaignId = typeof body.campaign_id === 'string' ? body.campaign_id.trim() : ''
    const tier = body.tier === 'pro' ? 'pro' : 'free'
    const name = typeof body.name === 'string' ? body.name.trim() : undefined
    const defaultId = typeof body.id === 'string' ? body.id.trim() : undefined
    const importPayload = body.import

    if (importPayload && typeof importPayload === 'object') {
      const importAll = body.import_all === true
      const totalInFile = countPlatformDefaultImportItems(importPayload)

      if (importAll && totalInFile > 1) {
        const result = await savePlatformCampaignDefaultsFromImportBulk(admin, {
          tier,
          importPayload,
          importAll: true,
        })
        return importSummaryResponse({
          imported: result.imported,
          failed: result.failed,
          total: result.total,
          synced_campaigns: result.synced_campaigns,
          warnings: result.warnings,
          names: result.defaults.map((d) => ({ id: d.id, name: d.name, tier: d.tier })),
          debug: { mode: 'json-bulk', totalInFile, tier },
        })
      }

      const result = await savePlatformCampaignDefaultFromImport(admin, {
        tier,
        name,
        defaultId,
        importPayload,
        campaignIndex: Number(body.campaign_index ?? 0),
      })
      return importSummaryResponse({
        imported: 1,
        failed: 0,
        total: 1,
        synced_campaigns: result.synced_campaigns,
        warnings: result.warnings,
        names: [{ id: result.defaults.id, name: result.defaults.name, tier: result.defaults.tier }],
        debug: { mode: 'json-single', tier },
      })
    }

    if (!campaignId) {
      return NextResponse.json({ error: 'campaign_id or import payload is required' }, { status: 400 })
    }

    const result = await savePlatformCampaignDefaultFromCampaign(admin, campaignId, {
      tier,
      defaultId,
      name,
    })

    return importSummaryResponse({
      imported: 1,
      failed: 0,
      total: 1,
      synced_campaigns: result.synced_campaigns,
      warnings: [],
      names: [{ id: result.defaults.id, name: result.defaults.name, tier: result.defaults.tier }],
      debug: { mode: 'campaign-id', campaignId, tier },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save default workflow'
    importDebugLog('error', { message: msg })
    const status = msg.includes('not found') || msg.includes('no workflow') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

/** Save workflow edits from the admin workflow editor (syncs linked user campaigns). */
export async function PATCH(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const admin = createServiceRoleClient()
    const defaultId = typeof body.id === 'string' ? body.id.trim() : ''
    const workflow_definition = body.workflow_definition as WorkflowDefinition | undefined
    const hasWorkflow = Boolean(workflow_definition?.nodes?.length)

    if (!hasWorkflow) {
      if (!defaultId) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
      }
      const name = typeof body.name === 'string' ? body.name : undefined
      const tier = body.tier === 'pro' ? 'pro' : body.tier === 'free' ? 'free' : undefined
      if (name === undefined && tier === undefined) {
        return NextResponse.json({ error: 'name or tier is required' }, { status: 400 })
      }

      const result = await updatePlatformCampaignDefaultMetadata(admin, defaultId, { name, tier })
      return NextResponse.json({
        data: result.defaults,
        synced_campaigns: result.synced_campaigns,
      })
    }

    const result = await savePlatformCampaignDefaultFromEditor(admin, {
      id: defaultId || undefined,
      name: typeof body.name === 'string' ? body.name : undefined,
      workflow_definition,
      workflow_layout:
        body.workflow_layout && typeof body.workflow_layout === 'object'
          ? (body.workflow_layout as Record<string, unknown>)
          : null,
    })

    return NextResponse.json({
      data: result.defaults,
      synced_campaigns: result.synced_campaigns,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save default workflow'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const id = (url.searchParams.get('id') || '').trim()
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const admin = createServiceRoleClient()
    await deletePlatformCampaignDefault(admin, id)
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to delete default workflow'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
