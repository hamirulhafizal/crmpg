import { NextResponse } from 'next/server'
import { getLuckyDrawEntryStatus } from '@/app/lib/lucky-draw/entry'

type Params = { params: Promise<{ pageId: string }> }

export async function GET(_request: Request, context: Params) {
  try {
    const { pageId } = await context.params
    if (!pageId) {
      return NextResponse.json({ error: 'Missing page id' }, { status: 400 })
    }

    const status = await getLuckyDrawEntryStatus(pageId)
    return NextResponse.json(status)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to check status'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
