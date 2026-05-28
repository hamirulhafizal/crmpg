export type LuckyDrawPageStatus = 'draft' | 'active' | 'closed'

export type LuckyDrawQuestionType = 'text' | 'multiple_choice' | 'yes_no' | 'tag_picker'

export type LuckyDrawPrize = {
  name: string
  description?: string
}

export type LuckyDrawQuestion = {
  id?: string
  sort_order: number
  question_type: LuckyDrawQuestionType
  question_text: string
  options?: string[] | null
  is_required?: boolean
}

export type LuckyDrawPage = {
  id: string
  user_id: string
  page_slug: string
  title: string
  status: LuckyDrawPageStatus
  prizes: LuckyDrawPrize[]
  terms_and_conditions: string | null
  target_audience: string | null
  created_at: string
  updated_at: string
  questions?: LuckyDrawQuestion[]
  entry_count?: number
}

export type LuckyDrawDealerSettings = {
  user_id: string
  dealer_slug: string
}

export type LuckyDrawEntryAnswer = {
  question_id: string
  question_text: string
  question_type: LuckyDrawQuestionType | 'purpose_tags' | 'location'
  value: unknown
}

export const SYSTEM_QUESTION_PURPOSE = '__purpose_tags__'
export const SYSTEM_QUESTION_LOCATION = '__location__'
