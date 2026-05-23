import type { WorkflowEditorDraft, WorkflowEditorStep } from '@/app/lib/campaigns/workflow-layout'
import { sendTimeLabel } from '@/app/lib/campaigns/workflow-layout'
import { addNodeToDefinition, ensureExplicitEdges } from '@/app/lib/workflows/graph-mutate'
import { isCampaignSendStepType } from '@/app/lib/workflows/send-step-types'
import { definitionToDraft, draftToDefinition } from '@/app/lib/workflows/sync'
import { safeInt } from '@/app/lib/safe-number'
import { whatsAppSendOptionsFromParameters } from '@/app/lib/campaigns/whatsapp-send-options'
import { compileWorkflowDefinition } from '@/app/lib/workflows/compile'
import type { WorkflowDefinition, WorkflowNodeInstance } from '@/app/lib/workflows/types'

function findWhatsAppNodeForStep(def: WorkflowDefinition, stepOrder: number): WorkflowNodeInstance | undefined {
  return def.nodes.find(
    (n) =>
      isCampaignSendStepType(String(n.type)) &&
      Number(n.parameters?.step_order ?? 0) === stepOrder
  )
}

/** Build editor step rows from graph nodes (preserves anti-spam + Gmail fields). */
export function editorStepsFromDefinition(def: WorkflowDefinition): WorkflowEditorStep[] {
  const compiled = compileWorkflowDefinition(def)
  return compiled.steps.map((s) => {
    const node = findWhatsAppNodeForStep(def, s.step_order)
    if (!node) {
      return {
        step_order: s.step_order,
        delay_days: s.delay_days,
        send_time: sendTimeLabel(s.send_time),
        message_template: s.message_template,
        is_active: s.is_active,
      }
    }
    return stepFromNodeParameters(node)
  })
}

const NODE_W = 220
const GAP = 56

/** Highest step_order among WhatsApp nodes and optional draft.steps rows. */
export function getMaxWhatsAppStepOrder(
  def: WorkflowDefinition,
  draftSteps?: WorkflowEditorStep[]
): number {
  let max = 0
  for (const n of def.nodes) {
    if (isCampaignSendStepType(String(n.type))) {
      max = Math.max(max, Number(n.parameters?.step_order ?? 0))
    }
  }
  for (const s of draftSteps ?? []) {
    max = Math.max(max, Number(s.step_order ?? 0))
  }
  return max
}

export function getNextWhatsAppStepOrder(
  def: WorkflowDefinition,
  draftSteps?: WorkflowEditorStep[]
): number {
  return getMaxWhatsAppStepOrder(def, draftSteps) + 1
}

/** Assign the next step_order to newly pasted WhatsApp nodes (Step 2, 3, …). */
export function assignStepOrdersToPastedNodes(
  def: WorkflowDefinition,
  newNodeIds: string[]
): WorkflowDefinition {
  if (newNodeIds.length === 0) return def
  const idSet = new Set(newNodeIds)
  let next =
    def.nodes
      .filter(
        (n) =>
          !idSet.has(n.id) &&
          isCampaignSendStepType(String(n.type))
      )
      .reduce((m, n) => Math.max(m, Number(n.parameters?.step_order ?? 0)), 0) + 1

  const nodes = def.nodes.map((n) => {
    if (!idSet.has(n.id) || !isCampaignSendStepType(String(n.type))) return n
    const order = next
    next += 1
    return {
      ...n,
      parameters: { ...n.parameters, step_order: order },
    }
  })
  return { ...def, nodes }
}

export function stepFromNodeParameters(
  node: WorkflowNodeInstance,
  fallbackOrder?: number
): WorkflowEditorStep {
  const p = node.parameters ?? {}
  const order = safeInt(p.step_order ?? fallbackOrder, 1, 1)
  if (node.type === 'crm.whatsapp.send_image') {
    return {
      step_order: order,
      delay_days: safeInt(p.delay_days, 0, 0),
      send_time: sendTimeLabel(p.send_time != null ? String(p.send_time) : ''),
      message_template: String(p.caption_template ?? ''),
      is_active: p.is_active !== false,
    }
  }
  const opts = whatsAppSendOptionsFromParameters(p)
  return {
    step_order: order,
    delay_days: safeInt(p.delay_days, 0, 0),
    send_time: sendTimeLabel(p.send_time != null ? String(p.send_time) : ''),
    message_template: String(p.message_template ?? ''),
    is_active: p.is_active !== false,
    enable_typing: opts.enable_typing,
    randomize_spaces: opts.randomize_spaces,
    gmail_fallback_enabled: order === 1 ? opts.gmail_fallback_enabled : false,
    gmail_fallback_template: order === 1 ? opts.gmail_fallback_template : undefined,
  }
}

/** Find draft.steps index for a WhatsApp canvas node (legacy step-N id or step_order). */
export function findStepIndexForWhatsAppNode(
  nodeId: string,
  draft: WorkflowEditorDraft,
  defNode?: WorkflowNodeInstance | null
): number {
  const m = /^step-(\d+)$/.exec(nodeId)
  if (m) {
    const order = Number(m[1])
    const idx = draft.steps.findIndex((s) => s.step_order === order)
    if (idx >= 0) return idx
  }
  if (defNode && isCampaignSendStepType(String(defNode.type)) && defNode.type !== 'crm.whatsapp.send_image') {
    const order = Number(defNode.parameters?.step_order ?? 0)
    if (order > 0) {
      return draft.steps.findIndex((s) => s.step_order === order)
    }
  }
  return -1
}

/** Ensure draft.steps has a row for this WhatsApp node (from its parameters). */
export function linkWhatsAppStepInDraft(
  draft: WorkflowEditorDraft,
  nodeId: string
): WorkflowEditorDraft {
  const def = draftToDefinition(draft)
  const node = def.nodes.find(
    (n) => n.id === nodeId && isCampaignSendStepType(String(n.type)) && n.type !== 'crm.whatsapp.send_image'
  )
  if (!node) return draft
  if (findStepIndexForWhatsAppNode(nodeId, draft, node) >= 0) return draft

  const step = stepFromNodeParameters(node)
  return definitionToDraft(
    draftToDefinition({
      ...draft,
      steps: [...draft.steps, step],
    })
  )
}

export function patchWhatsAppStepInDraft(
  draft: WorkflowEditorDraft,
  nodeId: string,
  partial: Partial<WorkflowEditorStep>
): WorkflowEditorDraft {
  const def = draftToDefinition(draft)
  const node = def.nodes.find(
    (n) => n.id === nodeId && isCampaignSendStepType(String(n.type)) && n.type !== 'crm.whatsapp.send_image'
  )
  if (!node) return draft

  const base = stepFromNodeParameters(node)
  const merged: WorkflowEditorStep = { ...base, ...partial }

  const nodes = def.nodes.map((n) => {
    if (n.id !== nodeId) return n
    return {
      ...n,
      parameters: {
        ...n.parameters,
        step_order: merged.step_order,
        delay_days: merged.delay_days,
        send_time: merged.send_time,
        message_template: merged.message_template,
        is_active: merged.is_active !== false,
        enable_typing: merged.enable_typing !== false,
        randomize_spaces: merged.randomize_spaces !== false,
        gmail_fallback_enabled:
          merged.step_order === 1 ? merged.gmail_fallback_enabled === true : false,
        gmail_fallback_template:
          merged.step_order === 1 ? String(merged.gmail_fallback_template ?? '') : '',
      },
    }
  })

  let steps = [...draft.steps]
  const prevOrder = base.step_order
  const prevIdx = steps.findIndex((s) => s.step_order === prevOrder)
  if (prevIdx >= 0) {
    steps[prevIdx] = { ...steps[prevIdx]!, ...merged }
  } else {
    const dupIdx = steps.findIndex((s) => s.step_order === merged.step_order)
    if (dupIdx >= 0) steps[dupIdx] = { ...steps[dupIdx]!, ...merged }
    else steps.push(merged)
  }

  const definition = draftToDefinition({
    ...draft,
    steps,
    definition: { ...def, nodes },
  })
  return {
    ...draft,
    steps: editorStepsFromDefinition(definition),
    definition,
  }
}

/** Add a WhatsApp step node on the canvas (before Done) and sync draft.steps. */
export function insertWhatsAppStepBeforeComplete(def: WorkflowDefinition): WorkflowDefinition {
  let d = ensureExplicitEdges(def)
  const complete = d.nodes.find((n) => n.type === 'crm.flow.complete')
  const order = getNextWhatsAppStepOrder(d)

  const incomingToComplete = complete ? d.edges.filter((e) => e.target === complete.id) : []
  const upstreamId = incomingToComplete[0]?.source
  const upstream = upstreamId ? d.nodes.find((n) => n.id === upstreamId) : null

  const position = upstream
    ? { x: upstream.position.x + NODE_W + GAP, y: upstream.position.y }
    : complete
      ? { x: complete.position.x - (NODE_W + GAP), y: complete.position.y }
      : { x: (NODE_W + GAP) * 3, y: 40 }

  d = addNodeToDefinition(d, 'crm.whatsapp.send', position)
  const newNode = d.nodes[d.nodes.length - 1]!
  const newId = newNode.id

  d = {
    ...d,
    nodes: d.nodes.map((n) =>
      n.id === newId
        ? {
            ...n,
            parameters: {
              step_order: order,
              delay_days: 0,
              send_time: '10:00',
              message_template: 'Salam {SenderName}',
              is_active: true,
              enable_typing: true,
              randomize_spaces: true,
              gmail_fallback_enabled: order === 1,
            },
          }
        : n
    ),
  }

  let edges = [...d.edges]
  if (complete && upstreamId) {
    edges = edges.map((e) =>
      e.target === complete.id && e.source === upstreamId
        ? { ...e, id: `e-${e.source}-${newId}`, target: newId }
        : e
    )
    if (!edges.some((e) => e.source === newId && e.target === complete.id)) {
      edges.push({
        id: `e-${newId}-${complete.id}`,
        source: newId,
        target: complete.id,
        sourceHandle: 'main',
        targetHandle: 'main',
      })
    }
  } else if (complete) {
    edges.push({
      id: `e-${newId}-${complete.id}`,
      source: newId,
      target: complete.id,
      sourceHandle: 'main',
      targetHandle: 'main',
    })
  }

  return { ...d, edges }
}

export function addWorkflowStepToDraft(draft: WorkflowEditorDraft): WorkflowEditorDraft {
  const def = insertWhatsAppStepBeforeComplete(draftToDefinition(draft))
  return definitionToDraft(def)
}
