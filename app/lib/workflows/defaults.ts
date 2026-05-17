import { WORKFLOW_NODE } from '@/app/lib/campaigns/workflow-events'
import { defaultParametersForType } from '@/app/lib/workflows/catalog'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'

const NODE_W = 220
const GAP = 56

/** Linear default graph for new campaigns (legacy-compatible node ids). */
export function createDefaultWorkflowDefinition(): WorkflowDefinition {
  const nodes = [
    {
      id: WORKFLOW_NODE.trigger,
      type: 'crm.trigger.manual' as const,
      position: { x: 0, y: 40 },
      parameters: defaultParametersForType('crm.trigger.manual'),
    },
    {
      id: WORKFLOW_NODE.audience,
      type: 'crm.audience.filter' as const,
      position: { x: NODE_W + GAP, y: 40 },
      parameters: defaultParametersForType('crm.audience.filter'),
    },
    {
      id: WORKFLOW_NODE.enroll,
      type: 'crm.enroll.queue' as const,
      position: { x: (NODE_W + GAP) * 2, y: 40 },
      parameters: defaultParametersForType('crm.enroll.queue'),
    },
    {
      id: WORKFLOW_NODE.step(1),
      type: 'crm.whatsapp.send' as const,
      position: { x: (NODE_W + GAP) * 3, y: 40 },
      parameters: defaultParametersForType('crm.whatsapp.send'),
    },
    {
      id: WORKFLOW_NODE.complete,
      type: 'crm.flow.complete' as const,
      position: { x: (NODE_W + GAP) * 4, y: 40 },
      parameters: {},
    },
  ]

  const edges = []
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]!
    const b = nodes[i + 1]!
    edges.push({
      id: `e-${a.id}-${b.id}`,
      source: a.id,
      target: b.id,
      sourceHandle: 'main',
      targetHandle: 'main',
    })
  }

  return { version: 1, nodes, edges }
}

export function isEmptyWorkflowDefinition(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return true
  const nodes = (raw as { nodes?: unknown }).nodes
  return !Array.isArray(nodes) || nodes.length === 0
}
