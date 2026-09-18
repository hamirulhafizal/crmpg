import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { getAuthenticatedPortalCustomer } from '@/app/lib/customer-portal/auth'
import {
  CHECKLIST_PROGRAM_KAYA_EMAS_2026,
  isChecklistStepKey,
  type ChecklistStepStatus,
} from '@/app/lib/customers/checklist'
import { getCustomerChecklist, updateCustomerChecklistStep } from '@/app/lib/customers/checklist-db'

export async function GET() {
  try {
    const customer = await getAuthenticatedPortalCustomer()
    if (!customer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const { data: full, error } = await admin
      .from('customers')
      .select('id, user_id, original_data')
      .eq('id', customer.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!full?.user_id) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const checklist = await getCustomerChecklist({
      supabase: admin,
      customerId: customer.id,
      userId: String(full.user_id),
      programSlug: CHECKLIST_PROGRAM_KAYA_EMAS_2026,
      originalData: full.original_data,
    })

    return NextResponse.json({ ok: true, ...checklist })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load checklist'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const customer = await getAuthenticatedPortalCustomer()
    if (!customer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { step_key?: string; status?: ChecklistStepStatus }
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
    // Portal: customer can mark pending/completed only (workflow owns "sent")
    if (!status || !['pending', 'completed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const admin = createServiceRoleClient()
    const { data: full, error } = await admin
      .from('customers')
      .select('id, user_id, original_data')
      .eq('id', customer.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!full?.user_id) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    await updateCustomerChecklistStep({
      supabase: admin,
      customerId: customer.id,
      userId: String(full.user_id),
      stepKey,
      status,
      programSlug: CHECKLIST_PROGRAM_KAYA_EMAS_2026,
      source: 'customer',
      completedBy: null,
    })

    const checklist = await getCustomerChecklist({
      supabase: admin,
      customerId: customer.id,
      userId: String(full.user_id),
      programSlug: CHECKLIST_PROGRAM_KAYA_EMAS_2026,
      originalData: full.original_data,
    })

    return NextResponse.json({ ok: true, ...checklist })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to update checklist'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
