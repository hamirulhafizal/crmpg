import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUserApi } from '@/app/lib/auth/require-user'
import {
  CHECKLIST_PROGRAM_KAYA_EMAS_2026,
  isChecklistStepKey,
  type ChecklistStepStatus,
} from '@/app/lib/customers/checklist'
import { getCustomerChecklist, updateCustomerChecklistStep } from '@/app/lib/customers/checklist-db'

type Ctx = { params: Promise<{ id: string }> }

async function loadOwnedCustomer(supabase: SupabaseClient, userId: string, customerId: string) {
  const { data, error } = await supabase
    .from('customers')
    .select('id, user_id, original_data')
    .eq('id', customerId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireUserApi(request)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const program =
    new URL(request.url).searchParams.get('program')?.trim() || CHECKLIST_PROGRAM_KAYA_EMAS_2026

  try {
    const customer = await loadOwnedCustomer(auth.supabase, auth.user.id, id)
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const checklist = await getCustomerChecklist({
      supabase: auth.supabase,
      customerId: id,
      userId: auth.user.id,
      programSlug: program,
      originalData: customer.original_data,
    })

    return NextResponse.json({ ok: true, ...checklist })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load checklist'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireUserApi(request)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params

  let body: {
    step_key?: string
    status?: ChecklistStepStatus
    program_slug?: string
    notes?: string | null
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const stepKey = body.step_key?.trim() ?? ''
  const status = body.status
  if (!isChecklistStepKey(stepKey)) {
    return NextResponse.json({ error: 'Invalid step_key' }, { status: 400 })
  }
  if (!status || !['pending', 'sent', 'completed', 'skipped'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  try {
    const customer = await loadOwnedCustomer(auth.supabase, auth.user.id, id)
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const program = body.program_slug?.trim() || CHECKLIST_PROGRAM_KAYA_EMAS_2026

    await updateCustomerChecklistStep({
      supabase: auth.supabase,
      customerId: id,
      userId: auth.user.id,
      stepKey,
      status,
      programSlug: program,
      notes: body.notes ?? null,
    })

    const checklist = await getCustomerChecklist({
      supabase: auth.supabase,
      customerId: id,
      userId: auth.user.id,
      programSlug: program,
      originalData: customer.original_data,
    })

    return NextResponse.json({ ok: true, ...checklist })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to update checklist'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
