import { WORKFLOW_NODE } from '@/app/lib/campaigns/workflow-events'
import { defaultParametersForType } from '@/app/lib/workflows/catalog'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'

const NODE_W = 220
const GAP = 56

export const DEFAULT_LOOP_NODE_ID = 'loop'
export const DEFAULT_WAIT_NODE_ID = 'wait-1'

/** Linear graph for legacy campaigns without `workflow_definition` (editor draft rebuild). */
export function createLinearLegacyWorkflowDefinition(): WorkflowDefinition {
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

/**
 * Default graph for new campaigns: trigger → audience → enroll → loop → (step + wait loop) / done.
 * Matches the standard campaign canvas layout (daily 02:10, batch 1, 2–5 min wait).
 */
export function createDefaultWorkflowDefinition(): WorkflowDefinition {
  const x = (i: number) => i * (NODE_W + GAP)
  /** Main chain (trigger → … → loop) on one row. */
  const yMain = 100
  /** Done: loop output 1 (top handle) — above loop. */
  const yDone = yMain - 88
  /** Step + wait: loop output 2 (bottom handle) — below loop. */
  const yBranch = yMain + 88
  const xAfterLoop = x(4)

  const triggerParams = {
    ...defaultParametersForType('crm.trigger.manual'),
    run_frequency: 'daily',
    run_time: '02:10',
  }

  const nodes = [
    {
      id: WORKFLOW_NODE.trigger,
      type: 'crm.trigger.manual' as const,
      position: { x: x(0), y: yMain },
      parameters: triggerParams,
    },
    {
      id: WORKFLOW_NODE.audience,
      type: 'crm.audience.filter' as const,
      position: { x: x(1), y: yMain },
      parameters: defaultParametersForType('crm.audience.filter'),
    },
    {
      id: WORKFLOW_NODE.enroll,
      type: 'crm.enroll.queue' as const,
      position: { x: x(2), y: yMain },
      parameters: defaultParametersForType('crm.enroll.queue'),
    },
    {
      id: DEFAULT_LOOP_NODE_ID,
      type: 'crm.flow.loop' as const,
      position: { x: x(3), y: yMain },
      parameters: { batch_size: 1, display_name: 'Loop' },
    },
    {
      id: WORKFLOW_NODE.complete,
      type: 'crm.flow.complete' as const,
      position: { x: xAfterLoop, y: yDone },
      parameters: {},
    },
    {
      id: WORKFLOW_NODE.step(1),
      type: 'crm.whatsapp.send' as const,
      position: { x: xAfterLoop, y: yBranch },
      parameters: {
        step_order: 1,
        delay_days: 0,
        send_time: '',
        message_template: 'Salam {SenderName}',
        is_active: true,
      },
    },
    {
      id: DEFAULT_WAIT_NODE_ID,
      type: 'crm.flow.wait' as const,
      position: { x: x(5), y: yBranch },
      parameters: {
        wait_min_seconds: 120,
        wait_max_seconds: 300,
        display_name: 'Wait',
      },
    },
  ]

  const edges = [
    {
      id: `e-${WORKFLOW_NODE.trigger}-${WORKFLOW_NODE.audience}`,
      source: WORKFLOW_NODE.trigger,
      target: WORKFLOW_NODE.audience,
      sourceHandle: 'main',
      targetHandle: 'main',
    },
    {
      id: `e-${WORKFLOW_NODE.audience}-${WORKFLOW_NODE.enroll}`,
      source: WORKFLOW_NODE.audience,
      target: WORKFLOW_NODE.enroll,
      sourceHandle: 'main',
      targetHandle: 'main',
    },
    {
      id: `e-${WORKFLOW_NODE.enroll}-${DEFAULT_LOOP_NODE_ID}`,
      source: WORKFLOW_NODE.enroll,
      target: DEFAULT_LOOP_NODE_ID,
      sourceHandle: 'main',
      targetHandle: 'main',
    },
    {
      id: `e-${DEFAULT_LOOP_NODE_ID}-${WORKFLOW_NODE.complete}`,
      source: DEFAULT_LOOP_NODE_ID,
      target: WORKFLOW_NODE.complete,
      sourceHandle: 'done',
      targetHandle: 'main',
    },
    {
      id: `e-${DEFAULT_LOOP_NODE_ID}-${WORKFLOW_NODE.step(1)}`,
      source: DEFAULT_LOOP_NODE_ID,
      target: WORKFLOW_NODE.step(1),
      sourceHandle: 'loop',
      targetHandle: 'main',
    },
    {
      id: `e-${WORKFLOW_NODE.step(1)}-${DEFAULT_WAIT_NODE_ID}`,
      source: WORKFLOW_NODE.step(1),
      target: DEFAULT_WAIT_NODE_ID,
      sourceHandle: 'main',
      targetHandle: 'main',
    },
    {
      id: `e-${DEFAULT_WAIT_NODE_ID}-${DEFAULT_LOOP_NODE_ID}`,
      source: DEFAULT_WAIT_NODE_ID,
      target: DEFAULT_LOOP_NODE_ID,
      sourceHandle: 'main',
      targetHandle: 'main',
      routing: 'loop-back' as const,
      pathOffsetY: 140,
    },
  ]

  return { version: 1, nodes, edges }
}

export function isEmptyWorkflowDefinition(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return true
  const nodes = (raw as { nodes?: unknown }).nodes
  return !Array.isArray(nodes) || nodes.length === 0
}
