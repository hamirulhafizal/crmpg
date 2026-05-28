import { NextResponse } from 'next/server'
import { submitLuckyDrawEntry } from '@/app/lib/lucky-draw/entry'
import type { LuckyDrawEntryAnswer, LuckyDrawQuestionType } from '@/app/lib/lucky-draw/types'

type Params = { params: Promise<{ pageId: string }> }

function normalizeCustomAnswers(raw: unknown): LuckyDrawEntryAnswer[] {
  if (!Array.isArray(raw)) return []
  const validTypes: LuckyDrawQuestionType[] = ['text', 'multiple_choice', 'yes_no', 'tag_picker']

  return raw
    .map((item) => {
      const row = item as Record<string, unknown>
      const question_id = typeof row.question_id === 'string' ? row.question_id : ''
      const question_text = typeof row.question_text === 'string' ? row.question_text : ''
      const question_type = row.question_type as LuckyDrawQuestionType
      if (!question_id || !question_text || !validTypes.includes(question_type)) return null
      return {
        question_id,
        question_text,
        question_type,
        value: row.value ?? null,
      } satisfies LuckyDrawEntryAnswer
    })
    .filter((a): a is LuckyDrawEntryAnswer => a !== null)
}

export async function POST(request: Request, context: Params) {
  try {
    const { pageId } = await context.params
    if (!pageId) {
      return NextResponse.json({ error: 'Missing page id' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const purposeTagIds = Array.isArray(body.purpose_tag_ids)
      ? body.purpose_tag_ids.filter((x: unknown): x is string => typeof x === 'string')
      : []

    const locationText = typeof body.location_text === 'string' ? body.location_text : ''
    const locationLat =
      typeof body.location_lat === 'number' && Number.isFinite(body.location_lat)
        ? body.location_lat
        : null
    const locationLng =
      typeof body.location_lng === 'number' && Number.isFinite(body.location_lng)
        ? body.location_lng
        : null

    const result = await submitLuckyDrawEntry({
      pageId,
      purposeTagIds,
      locationText,
      locationLat,
      locationLng,
      customAnswers: normalizeCustomAnswers(body.custom_answers),
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      success: true,
      already_entered: result.alreadyEntered,
      participated_at: result.participated_at,
      page_title: 'page_title' in result ? result.page_title : undefined,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to submit entry'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
