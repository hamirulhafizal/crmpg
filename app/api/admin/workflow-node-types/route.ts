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

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('workflow_node_types')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: (data ?? []).map(mapRow) })
}

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const validated = validateWorkflowNodeTypeInput(body)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const d = validated.data
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('workflow_node_types')
    .insert({
      slug: d.slug,
      category: d.category,
      label: d.label,
      description: d.description ?? null,
      icon: d.icon ?? null,
      parameter_schema: d.parameter_schema ?? {},
      handler_key: d.handler_key,
      n8n_type: d.n8n_type ?? null,
      n8n_type_version: d.n8n_type_version ?? 1,
      n8n_parameters: d.n8n_parameters ?? {},
      is_system: false,
      enabled: d.enabled !== false,
      sort_order: d.sort_order ?? 100,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A node type with this slug already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ node_type: mapRow(data as Record<string, unknown>) })
}
