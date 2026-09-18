import { parseDirectDebitSubscriptionFromOriginalData } from '@/app/lib/customer-account-status'

export const CHECKLIST_PROGRAM_KAYA_EMAS_2026 = 'kaya_emas_2026'

export type ChecklistStepStatus = 'pending' | 'sent' | 'completed' | 'skipped'

export type ChecklistStepKey =
  | 'download_pg_app'
  | 'join_wa_group'
  | 'read_handbook_tutorial'
  | 'buy_read_books'
  | 'subscribe_gap_5y'
  | 'join_webinar_1m'
  | 'join_plt_or_kempen'

export type ChecklistStepDefinition = {
  step_key: ChecklistStepKey
  sort_order: number
  title: string
  title_ms: string
  description: string | null
  auto_complete_source: 'direct_debit' | null
}

export type ChecklistProgressRow = {
  step_key: string
  status: ChecklistStepStatus
  completed_at: string | null
  completed_by: string | null
  last_message_sent_at: string | null
  source: string
  notes: string | null
  updated_at: string | null
}

export type ChecklistStepView = ChecklistStepDefinition & {
  status: ChecklistStepStatus
  completed_at: string | null
  completed_by: string | null
  last_message_sent_at: string | null
  source: string | null
  notes: string | null
  updated_at: string | null
  auto_completed: boolean
}

/** Fallback if DB seed is missing (keeps UI usable). */
export const KAYA_EMAS_2026_STEPS: ChecklistStepDefinition[] = [
  {
    step_key: 'download_pg_app',
    sort_order: 1,
    title: 'Download Mobile Apps PG',
    title_ms: 'Download Mobile Apps PG',
    description: 'Download the official Public Gold mobile app.',
    auto_complete_source: 'direct_debit',
  },
  {
    step_key: 'join_wa_group',
    sort_order: 2,
    title: 'Join WhatsApp Group',
    title_ms: 'Join WhatsApp Group (disediakan oleh introducer)',
    description: 'Join the WhatsApp group provided by the introducer.',
    auto_complete_source: null,
  },
  {
    step_key: 'read_handbook_tutorial',
    sort_order: 3,
    title: 'Read Customer Handbook & Tutorial',
    title_ms: 'Baca Customer Handbook dan rujuk link Tutorial (di website dealer)',
    description: 'Read the customer handbook and tutorial on the dealer website.',
    auto_complete_source: null,
  },
  {
    step_key: 'buy_read_books',
    sort_order: 4,
    title: 'Buy & read Wang Emas & Misi Bebas Hutang',
    title_ms: 'Beli dan baca buku Wang Emas & Misi Bebas Hutang',
    description: 'Buy and read both books.',
    auto_complete_source: null,
  },
  {
    step_key: 'subscribe_gap_5y',
    sort_order: 5,
    title: 'Subscribe GAP Auto-debit (5 years)',
    title_ms: 'Subscribe GAP Auto-debit selama 5 tahun',
    description: 'Activate GAP auto-debit subscription for 5 years.',
    auto_complete_source: 'direct_debit',
  },
  {
    step_key: 'join_webinar_1m',
    sort_order: 6,
    title: 'Join Private Webinar: Membina Satu Juta Pertama',
    title_ms: 'Join Private Webinar : Membina Satu Juta Pertama',
    description: 'Attend the private webinar.',
    auto_complete_source: null,
  },
  {
    step_key: 'join_plt_or_kempen',
    sort_order: 7,
    title: 'Join PLT or Kempen Sebar Manfaat Emas',
    title_ms: 'Join training dealer PG Leadership Training (PLT) atau join Kempen Sebar Manfaat Emas',
    description: 'Join PLT training or the gold benefit campaign.',
    auto_complete_source: null,
  },
]

export function isChecklistStepKey(value: string): value is ChecklistStepKey {
  return KAYA_EMAS_2026_STEPS.some((s) => s.step_key === value)
}

export function mergeChecklistSteps(
  definitions: ChecklistStepDefinition[],
  progressByKey: Map<string, ChecklistProgressRow>,
  opts?: { directDebitActive?: boolean }
): ChecklistStepView[] {
  const directDebitActive = opts?.directDebitActive === true

  return [...definitions]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((def) => {
      const row = progressByKey.get(def.step_key)
      let status: ChecklistStepStatus = row?.status ?? 'pending'
      let source = row?.source ?? null
      let completed_at = row?.completed_at ?? null
      let auto_completed = false

      if (
        def.auto_complete_source === 'direct_debit' &&
        directDebitActive &&
        status !== 'completed' &&
        status !== 'skipped'
      ) {
        status = 'completed'
        source = 'direct_debit'
        completed_at = completed_at ?? new Date().toISOString()
        auto_completed = true
      }

      return {
        ...def,
        status,
        completed_at,
        completed_by: row?.completed_by ?? null,
        last_message_sent_at: row?.last_message_sent_at ?? null,
        source,
        notes: row?.notes ?? null,
        updated_at: row?.updated_at ?? null,
        auto_completed,
      }
    })
}

export function checklistSummary(steps: ChecklistStepView[]): {
  total: number
  completed: number
  pending: number
  sent: number
  nextStepKey: ChecklistStepKey | null
} {
  const total = steps.length
  const completed = steps.filter((s) => s.status === 'completed' || s.status === 'skipped').length
  const sent = steps.filter((s) => s.status === 'sent').length
  const pending = steps.filter((s) => s.status === 'pending').length
  const next = steps.find((s) => s.status === 'pending' || s.status === 'sent')
  return {
    total,
    completed,
    pending,
    sent,
    nextStepKey: (next?.step_key as ChecklistStepKey | undefined) ?? null,
  }
}

export function customerHasDirectDebit(originalData: unknown): boolean {
  return parseDirectDebitSubscriptionFromOriginalData(originalData) === true
}
