import { NextResponse } from 'next/server'
import { testWorkflowNode } from '@/app/lib/campaigns/test-workflow-node'
import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'
import { createClient } from '@/app/lib/supabase/server'

/** Test a workflow node using draft only (new campaign builder, no campaign id yet). */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      node_id?: string
      draft?: WorkflowEditorDraft
    }

    if (!body.node_id?.trim()) {
      return NextResponse.json({ error: 'node_id is required' }, { status: 400 })
    }
    if (!body.draft) {
      return NextResponse.json({ error: 'draft is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await testWorkflowNode({
      supabase,
      userId: user.id,
      nodeId: body.node_id.trim(),
      draft: body.draft,
      campaign: null,
    })

    return NextResponse.json({ data: result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Test failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
