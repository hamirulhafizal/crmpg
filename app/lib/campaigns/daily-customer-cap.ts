import { isCampaignSendStepType } from '@/app/lib/workflows/send-step-types'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'

/** Active WhatsApp / send nodes that each produce one message log per customer. */
export function countActiveSendSteps(def: WorkflowDefinition | null | undefined): number {
  if (!def) return 0
  return def.nodes.filter(
    (n) => isCampaignSendStepType(String(n.type)) && n.parameters?.is_active !== false
  ).length
}

export function messageCapFromCustomers(customers: number, stepCount: number): number {
  const c = Math.max(1, Math.trunc(Number(customers) || 1))
  const s = Math.max(1, Math.trunc(Number(stepCount) || 1))
  return c * s
}

/** Infer customers from stored message cap when `daily_customers_per_day` is missing (legacy). */
export function customersFromMessageCap(messageCap: number, stepCount: number): number {
  const s = Math.max(1, Math.trunc(Number(stepCount) || 1))
  const m = Math.max(1, Math.trunc(Number(messageCap) || 1))
  return Math.max(1, Math.floor(m / s))
}

export function resolveDailyCustomersPerDay(
  params: Record<string, unknown> | null | undefined,
  messageCap: number,
  stepCount: number
): number {
  const raw = params?.daily_customers_per_day
  const n = Math.trunc(Number(raw))
  if (Number.isFinite(n) && n >= 1) return n
  return customersFromMessageCap(messageCap, stepCount)
}

export function enrollParamsFromDefinition(
  def: WorkflowDefinition | null | undefined
): Record<string, unknown> | null {
  if (!def) return null
  const node = def.nodes.find((n) => String(n.type) === 'crm.enroll.queue')
  return (node?.parameters as Record<string, unknown> | undefined) ?? null
}
