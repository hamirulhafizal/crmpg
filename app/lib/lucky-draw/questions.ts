import type { LuckyDrawQuestion, LuckyDrawQuestionType } from '@/app/lib/lucky-draw/types'

const VALID_TYPES: LuckyDrawQuestionType[] = ['text', 'multiple_choice', 'yes_no', 'tag_picker']

export function normalizeQuestions(raw: unknown): LuckyDrawQuestion[] {
  if (!Array.isArray(raw)) return []

  const questions: LuckyDrawQuestion[] = []

  for (let index = 0; index < raw.length; index++) {
    const item = raw[index]
    const row = item as Record<string, unknown>
    const question_type = row.question_type as LuckyDrawQuestionType
    if (!VALID_TYPES.includes(question_type)) continue

    const question_text = typeof row.question_text === 'string' ? row.question_text.trim() : ''
    if (!question_text) continue

    let options: string[] | null = null
    if (question_type === 'multiple_choice') {
      const opts = Array.isArray(row.options)
        ? row.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
        : []
      if (opts.length < 2) continue
      options = opts.map((o) => o.trim())
    }

    const question: LuckyDrawQuestion = {
      sort_order: Number.isFinite(row.sort_order) ? Number(row.sort_order) : index,
      question_type,
      question_text,
      options,
      is_required: row.is_required !== false,
    }
    if (typeof row.id === 'string') {
      question.id = row.id
    }
    questions.push(question)
  }

  return questions
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((q, i) => ({ ...q, sort_order: i }))
}
