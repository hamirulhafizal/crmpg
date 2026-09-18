import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CHECKLIST_PROGRAM_KAYA_EMAS_2026,
  KAYA_EMAS_2026_STEPS,
  checklistSummary,
  customerHasDirectDebit,
  isChecklistStepKey,
  mergeChecklistSteps,
  type ChecklistProgressRow,
  type ChecklistStepDefinition,
  type ChecklistStepKey,
  type ChecklistStepStatus,
  type ChecklistStepView,
} from '@/app/lib/customers/checklist'

type DbStepRow = {
  step_key: string
  sort_order: number
  title: string
  title_ms: string
  description: string | null
  auto_complete_source: string | null
  is_active: boolean
}

async function loadStepDefinitions(
  supabase: SupabaseClient,
  programSlug: string
): Promise<ChecklistStepDefinition[]> {
  const { data, error } = await supabase
    .from('customer_checklist_steps')
    .select('step_key, sort_order, title, title_ms, description, auto_complete_source, is_active')
    .eq('program_slug', programSlug)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error || !data?.length) {
    return programSlug === CHECKLIST_PROGRAM_KAYA_EMAS_2026 ? KAYA_EMAS_2026_STEPS : []
  }

  return (data as DbStepRow[])
    .filter((row) => isChecklistStepKey(row.step_key))
    .map((row) => ({
      step_key: row.step_key as ChecklistStepKey,
      sort_order: row.sort_order,
      title: row.title,
      title_ms: row.title_ms,
      description: row.description,
      auto_complete_source: row.auto_complete_source === 'direct_debit' ? 'direct_debit' : null,
    }))
}

export async function getCustomerChecklist(params: {
  supabase: SupabaseClient
  customerId: string
  userId: string
  programSlug?: string
  originalData?: unknown
}): Promise<{
  program_slug: string
  steps: ChecklistStepView[]
  summary: ReturnType<typeof checklistSummary>
}> {
  const programSlug = params.programSlug ?? CHECKLIST_PROGRAM_KAYA_EMAS_2026
  const definitions = await loadStepDefinitions(params.supabase, programSlug)

  const { data: progressRows } = await params.supabase
    .from('customer_checklist_progress')
    .select(
      'step_key, status, completed_at, completed_by, last_message_sent_at, source, notes, updated_at'
    )
    .eq('customer_id', params.customerId)
    .eq('program_slug', programSlug)

  const progressByKey = new Map<string, ChecklistProgressRow>()
  for (const row of progressRows ?? []) {
    progressByKey.set(String(row.step_key), {
      step_key: String(row.step_key),
      status: row.status as ChecklistStepStatus,
      completed_at: row.completed_at != null ? String(row.completed_at) : null,
      completed_by: row.completed_by != null ? String(row.completed_by) : null,
      last_message_sent_at:
        row.last_message_sent_at != null ? String(row.last_message_sent_at) : null,
      source: String(row.source ?? 'manual'),
      notes: row.notes != null ? String(row.notes) : null,
      updated_at: row.updated_at != null ? String(row.updated_at) : null,
    })
  }

  const directDebitActive = customerHasDirectDebit(params.originalData)
  let steps = mergeChecklistSteps(definitions, progressByKey, { directDebitActive })

  // Persist auto-completed steps (GAP + app install inferred from Direct Debit).
  const autoSteps = steps.filter((s) => s.auto_completed)
  if (autoSteps.length > 0) {
    await params.supabase.from('customer_checklist_progress').upsert(
      autoSteps.map((gap) => ({
        customer_id: params.customerId,
        user_id: params.userId,
        program_slug: programSlug,
        step_key: gap.step_key,
        status: 'completed',
        completed_at: gap.completed_at ?? new Date().toISOString(),
        source: 'direct_debit',
      })),
      { onConflict: 'customer_id,program_slug,step_key' }
    )
    const autoKeys = new Set(autoSteps.map((s) => s.step_key))
    steps = steps.map((s) =>
      autoKeys.has(s.step_key)
        ? { ...s, status: 'completed', source: 'direct_debit', auto_completed: true }
        : s
    )
  }

  return {
    program_slug: programSlug,
    steps,
    summary: checklistSummary(steps),
  }
}

export async function updateCustomerChecklistStep(params: {
  supabase: SupabaseClient
  customerId: string
  userId: string
  stepKey: ChecklistStepKey
  status: ChecklistStepStatus
  programSlug?: string
  notes?: string | null
  source?: 'manual' | 'direct_debit' | 'workflow' | 'customer' | 'system'
  completedBy?: string | null
}): Promise<void> {
  const programSlug = params.programSlug ?? CHECKLIST_PROGRAM_KAYA_EMAS_2026
  const now = new Date().toISOString()
  const source = params.source ?? 'manual'

  const patch: Record<string, unknown> = {
    customer_id: params.customerId,
    user_id: params.userId,
    program_slug: programSlug,
    step_key: params.stepKey,
    status: params.status,
    source,
    notes: params.notes ?? null,
  }

  if (params.status === 'completed') {
    patch.completed_at = now
    patch.completed_by = params.completedBy ?? (source === 'customer' ? null : params.userId)
  } else if (params.status === 'pending') {
    patch.completed_at = null
    patch.completed_by = null
    patch.last_message_sent_at = null
  } else if (params.status === 'skipped') {
    patch.completed_at = now
    patch.completed_by = params.completedBy ?? (source === 'customer' ? null : params.userId)
  } else if (params.status === 'sent') {
    patch.last_message_sent_at = now
  }

  const { error } = await params.supabase
    .from('customer_checklist_progress')
    .upsert(patch, { onConflict: 'customer_id,program_slug,step_key' })

  if (error) throw new Error(error.message)
}
