import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import {
  getAuthenticatedPortalCustomer,
  portalCustomerPublicView,
} from '@/app/lib/customer-portal/auth'

export async function GET() {
  try {
    const customer = await getAuthenticatedPortalCustomer()
    if (!customer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ customer: portalCustomerPublicView(customer) })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load profile'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

type PatchBody = {
  phone?: string
  email?: string | null
  location?: string | null
}

export async function PATCH(request: Request) {
  try {
    const customer = await getAuthenticatedPortalCustomer()
    if (!customer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as PatchBody
    const update: PatchBody = {}

    if (body.phone !== undefined) {
      const phone = String(body.phone).trim()
      if (!phone) {
        return NextResponse.json({ error: 'Phone cannot be empty' }, { status: 400 })
      }
      update.phone = phone
    }
    if (body.email !== undefined) {
      update.email = String(body.email).trim() || null
    }
    if (body.location !== undefined) {
      update.location = String(body.location).trim() || null
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('customers')
      .update(update)
      .eq('id', customer.id)
      .select(
        'id, user_id, name, dob, email, phone, location, pg_code, gender, ethnicity, sender_name, save_name'
      )
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      customer: portalCustomerPublicView(data),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update profile'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
