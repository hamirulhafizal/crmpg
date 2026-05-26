/** URL query state for /dashboard/campaigns full-screen panels + workflow editor. */

export type CampaignPanelMode = 'create' | { edit: string } | { view: string }

export type CampaignPanelUrlOptions = {
  workflow?: boolean
  /** Single selected canvas node id (e.g. audience, step-1). */
  node?: string | null
}

export function panelModeFromSearchParams(sp: URLSearchParams): CampaignPanelMode | null {
  if (sp.get('new') === '1') return 'create'
  const edit = sp.get('edit')
  if (edit) return { edit }
  const view = sp.get('view')
  if (view) return { view }
  return null
}

export function workflowOpenFromSearchParams(sp: URLSearchParams): boolean {
  const w = sp.get('workflow')
  return w === '1' || w === 'true'
}

export function selectedNodeFromSearchParams(sp: URLSearchParams): string | null {
  const node = sp.get('node')?.trim()
  return node || null
}

export function buildCampaignPanelPath(
  mode: CampaignPanelMode,
  opts?: CampaignPanelUrlOptions
): string {
  const params = new URLSearchParams()
  if (mode === 'create') {
    params.set('new', '1')
  } else if ('edit' in mode) {
    params.set('edit', mode.edit)
  } else if ('view' in mode) {
    params.set('view', mode.view)
  }
  if (opts?.workflow) params.set('workflow', '1')
  const node = opts?.node?.trim()
  if (node) params.set('node', node)
  const q = params.toString()
  return q ? `/dashboard/campaigns?${q}` : '/dashboard/campaigns'
}

/** Merge workflow / node flags into existing search params (keeps view=, edit=, etc.). */
export function mergeWorkflowIntoSearchParams(
  sp: URLSearchParams,
  opts: { workflow: boolean; node?: string | null }
): URLSearchParams {
  const next = new URLSearchParams(sp.toString())
  if (opts.workflow) {
    next.set('workflow', '1')
    const node = opts.node?.trim()
    if (node) next.set('node', node)
    else next.delete('node')
  } else {
    next.delete('workflow')
    next.delete('node')
  }
  return next
}
