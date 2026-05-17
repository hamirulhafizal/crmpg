import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { validateWorkflowNodeTypeInput } from '@/app/lib/workflows/node-type-validate'

function mapRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    slug: r.slug,
    category: r.category,
    label: r.label,
    description: r.description,
    icon: r.icon,
    parameter_schema: r.parameter_schema ?? {},
    handler_key: r.handler_key,
    n8n_type: r.n8n_type,
    n8n_type_version: r.n8n_type_version ?? 1,
    n8n_parameters: r.n8n_parameters ?? {},
    is_system: r.is_system,
    enabled: r.enabled,
    sort_order: r.sort_order,
    created_at: r.created_at,
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const validated = validateWorkflowNodeTypeInput(body, true)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const d = validated.data
  const patch: Record<string, unknown> = {}
  if (d.label) patch.label = d.label
  if (d.category) patch.category = d.category
  if (d.description !== undefined) patch.description = d.description
  if (d.icon !== undefined) patch.icon = d.icon
  if (d.parameter_schema !== undefined) patch.parameter_schema = d.parameter_schema
  if (d.handler_key) patch.handler_key = d.handler_key
  if (d.n8n_type !== undefined) patch.n8n_type = d.n8n_type
  if (d.n8n_type_version !== undefined) patch.n8n_type_version = d.n8n_type_version
  if (d.n8n_parameters !== undefined) patch.n8n_parameters = d.n8n_parameters
  if (d.enabled !== undefined) patch.enabled = d.enabled
  if (d.sort_order !== undefined) patch.sort_order = d.sort_order

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { data: existing } = await admin.from('workflow_node_types').select('is_system, slug').eq('id', id).maybeSingle()
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (existing.is_system && body.slug && body.slug !== existing.slug) {
    return NextResponse.json({ error: 'Cannot change slug of system node types' }, { status: 400 })
  }

  const { data, error } = await admin.from('workflow_node_types').update(patch).eq('id', id).select('*').single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ node_type: mapRow(data as Record<string, unknown>) })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { id } = await params
  const admin = createServiceRoleClient()
  const { data: existing } = await admin.from('workflow_node_types').select('is_system').eq('id', id).maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (existing.is_system) {
    const { error } = await admin.from('workflow_node_types').update({ enabled: false }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, disabled: true })
  }

  const { error } = await admin.from('workflow_node_types').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
