export type PlatformDefaultImportResult = {
  imported: number
  failed: number
  total: number
  synced_campaigns: number
  warnings: string[]
  names: unknown[]
  debug: unknown
}

export type ImportProgressUpdate = {
  percent: number
  label: string
}

function extractCampaignItems(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as Record<string, unknown>
  if (Array.isArray(root.campaigns)) {
    return root.campaigns.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === 'object'
    )
  }
  if (root.campaign && typeof root.campaign === 'object') return [root]
  return []
}

function campaignItemName(item: Record<string, unknown>, index: number): string {
  const campaign = item.campaign
  if (campaign && typeof campaign === 'object') {
    const name = (campaign as Record<string, unknown>).name
    if (typeof name === 'string' && name.trim()) return name.trim()
  }
  return `Campaign ${index + 1}`
}

export async function readCampaignExportFile(file: File): Promise<{
  payload: unknown
  items: Array<Record<string, unknown>>
}> {
  console.log('[Import] readCampaignExportFile:start', {
    name: file.name,
    size: file.size,
    type: file.type,
  })

  const text = await file.text()
  console.log('[Import] readCampaignExportFile:read', { chars: text.length })

  let payload: unknown
  try {
    payload = JSON.parse(text) as unknown
  } catch (err) {
    console.error('[Import] readCampaignExportFile:json-parse-failed', err)
    throw new Error(`${file.name}: invalid JSON (${err instanceof Error ? err.message : 'parse error'})`)
  }

  const items = extractCampaignItems(payload)
  console.log('[Import] readCampaignExportFile:parsed', {
    topLevelKeys:
      payload && typeof payload === 'object' ? Object.keys(payload as Record<string, unknown>) : [],
    campaignCount: items.length,
    names: items.map((item, i) => campaignItemName(item, i)),
  })

  if (items.length === 0) {
    throw new Error(`${file.name}: no campaigns found (expected export format with "campaigns" array)`)
  }

  return { payload, items }
}

async function postPlatformDefaultImportFile(
  file: File,
  tier: 'free' | 'pro'
): Promise<PlatformDefaultImportResult> {
  const form = new FormData()
  form.append('file', file, file.name || 'campaign-export.json')
  form.append('tier', tier)

  console.log('[Import] postPlatformDefaultImportFile:request', {
    name: file.name,
    size: file.size,
    tier,
  })

  const res = await fetch('/api/admin/campaign-workflow-defaults', {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  })

  const rawText = await res.text()
  console.log('[Import] postPlatformDefaultImportFile:response', {
    status: res.status,
    ok: res.ok,
    bytes: rawText.length,
    preview: rawText.slice(0, 400),
  })

  let data: Record<string, unknown> = {}
  try {
    data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {}
  } catch (err) {
    console.error('[Import] postPlatformDefaultImportFile:response-json-failed', err, rawText.slice(0, 200))
    throw new Error(`Server returned invalid JSON (HTTP ${res.status})`)
  }

  if (!res.ok) {
    throw new Error(
      typeof data.error === 'string' ? data.error : `Import failed (HTTP ${res.status})`
    )
  }

  const imported = Number(data.imported)
  if (!Number.isFinite(imported) || imported < 1) {
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : `Import did not save any templates (got ${String(data.imported)})`
    )
  }

  return {
    imported,
    failed: Number(data.failed ?? 0),
    total: Number(data.total ?? imported),
    synced_campaigns: Number(data.synced_campaigns ?? 0),
    warnings: Array.isArray(data.warnings) ? data.warnings.map((w) => String(w)) : [],
    names: Array.isArray(data.names) ? data.names : [],
    debug: data._debug ?? null,
  }
}

export async function importPlatformDefaultExportFile(
  file: File,
  tier: 'free' | 'pro',
  onProgress: (update: ImportProgressUpdate) => void
): Promise<{
  imported: number
  failed: number
  synced_campaigns: number
  warnings: string[]
  logs: string[]
}> {
  console.group('[Import] importPlatformDefaultExportFile')
  console.log('[Import] tier', tier)

  const logs: string[] = []
  const pushLog = (msg: string) => {
    logs.push(msg)
    console.log(msg)
  }

  pushLog(`[Import] file=${file.name} size=${file.size} tier=${tier}`)

  onProgress({ percent: 8, label: `Reading ${file.name}…` })
  const { items } = await readCampaignExportFile(file)

  if (tier === 'free' && items.length > 1) {
    pushLog(`[Import] free tier: server will import first campaign only (${items.length - 1} skipped)`)
  }

  onProgress({ percent: 20, label: `Uploading ${items.length} campaign(s)…` })

  try {
    const result = await postPlatformDefaultImportFile(file, tier)
    pushLog(`[Import] ok imported=${result.imported} failed=${result.failed}`)
    if (result.warnings.length > 0) {
      pushLog(`[Import] warnings=${result.warnings.length}`)
    }

    console.log('[Import] summary', result)
    console.groupEnd()

    onProgress({ percent: 100, label: 'Import complete' })

    return {
      imported: result.imported,
      failed: result.failed,
      synced_campaigns: result.synced_campaigns,
      warnings: result.warnings,
      logs,
    }
  } catch (err) {
    console.groupEnd()
    onProgress({ percent: 100, label: 'Import failed' })
    throw err
  }
}
