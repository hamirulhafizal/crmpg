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

export async function postPlatformDefaultImportItem(
  item: Record<string, unknown>,
  tier: 'free' | 'pro',
  label: string
): Promise<PlatformDefaultImportResult> {
  const blob = new Blob([JSON.stringify(item)], { type: 'application/json' })
  const form = new FormData()
  form.append('file', blob, `${label.replace(/[^\w.-]+/g, '_') || 'campaign'}.json`)
  form.append('tier', tier)

  console.log('[Import] postPlatformDefaultImportItem:request', {
    label,
    tier,
    bytes: blob.size,
  })

  const res = await fetch('/api/admin/campaign-workflow-defaults', {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  })

  const rawText = await res.text()
  console.log('[Import] postPlatformDefaultImportItem:response', {
    label,
    status: res.status,
    ok: res.ok,
    bytes: rawText.length,
    preview: rawText.slice(0, 400),
  })

  let data: Record<string, unknown> = {}
  try {
    data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {}
  } catch (err) {
    console.error('[Import] postPlatformDefaultImportItem:response-json-failed', err, rawText.slice(0, 200))
    throw new Error(`${label}: server returned invalid JSON (HTTP ${res.status})`)
  }

  if (!res.ok) {
    throw new Error(
      typeof data.error === 'string' ? `${label}: ${data.error}` : `${label}: import failed (HTTP ${res.status})`
    )
  }

  const imported = Number(data.imported)
  if (!Number.isFinite(imported) || imported < 1) {
    throw new Error(
      typeof data.error === 'string'
        ? `${label}: ${data.error}`
        : `${label}: missing imported count (got ${String(data.imported)}, HTTP ${res.status})`
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

  onProgress({ percent: 5, label: `Reading ${file.name}…` })
  const { items } = await readCampaignExportFile(file)

  const importItems = tier === 'pro' ? items : items.slice(0, 1)
  if (tier === 'free' && items.length > 1) {
    pushLog(`[Import] free tier: using first campaign only (${items.length - 1} skipped)`)
  }

  let imported = 0
  let failed = 0
  let synced_campaigns = 0
  const warnings: string[] = []

  for (let i = 0; i < importItems.length; i += 1) {
    const item = importItems[i]
    const name = campaignItemName(item, i)
    const pct = Math.round(10 + ((i + 1) / importItems.length) * 85)
    onProgress({
      percent: pct,
      label: `Importing ${i + 1}/${importItems.length}: ${name}`,
    })

    try {
      pushLog(`[Import] campaign ${i + 1}/${importItems.length}: ${name}`)
      const result = await postPlatformDefaultImportItem(item, tier, name)
      imported += result.imported
      failed += result.failed
      synced_campaigns += result.synced_campaigns
      warnings.push(...result.warnings)
      pushLog(`[Import] ok ${name} imported=${result.imported}`)
    } catch (err) {
      failed += 1
      const msg = err instanceof Error ? err.message : `${name}: import failed`
      warnings.push(msg)
      pushLog(`[Import] fail ${name}: ${msg}`)
      console.error('[Import] campaign failed', err)
    }
  }

  console.log('[Import] summary', { imported, failed, synced_campaigns, warnings })
  console.groupEnd()

  onProgress({ percent: 100, label: imported > 0 ? 'Import complete' : 'Import failed' })

  if (imported < 1) {
    throw new Error(warnings[0] ?? 'No templates were imported')
  }

  return { imported, failed, synced_campaigns, warnings, logs }
}
