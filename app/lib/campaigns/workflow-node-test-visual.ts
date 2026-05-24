import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'
import type { WorkflowNodeState } from '@/app/dashboard/campaigns/_components/CampaignWorkflowModal'
import { workflowPathToNode } from '@/app/lib/workflows/graph-order'
import { draftToDefinition } from '@/app/lib/workflows/sync'

const STEP_ACTIVE_MS = 420
const STEP_COMPLETE_MS = 280

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function workflowPathNodeIds(draft: WorkflowEditorDraft, targetNodeId: string): string[] {
  const def = draftToDefinition(draft)
  return workflowPathToNode(def, targetNodeId).map((n) => n.id)
}

export function allWorkflowNodeIds(draft: WorkflowEditorDraft): string[] {
  const def = draftToDefinition(draft)
  return def.nodes.map((n) => n.id)
}

function buildStates(
  allNodeIds: string[],
  pathIds: string[],
  /** Index of the active node, or pathIds.length when all path nodes are complete. */
  activeIndex: number
): Record<string, WorkflowNodeState> {
  const states: Record<string, WorkflowNodeState> = {}
  for (const id of allNodeIds) states[id] = 'idle'
  for (let i = 0; i < pathIds.length; i++) {
    const id = pathIds[i]!
    if (i < activeIndex) states[id] = 'complete'
    else if (i === activeIndex && activeIndex < pathIds.length) states[id] = 'active'
    else states[id] = 'complete'
  }
  return states
}

/** n8n-style: glow each node on the path from trigger → target. */
export async function animateWorkflowPathTest(
  pathIds: string[],
  allNodeIds: string[],
  onUpdate: (states: Record<string, WorkflowNodeState>) => void
): Promise<void> {
  if (pathIds.length === 0) return

  for (let i = 0; i < pathIds.length; i++) {
    onUpdate(buildStates(allNodeIds, pathIds, i))
    await delay(STEP_ACTIVE_MS)
  }
  onUpdate(buildStates(allNodeIds, pathIds, pathIds.length))
  await delay(STEP_COMPLETE_MS)
}
