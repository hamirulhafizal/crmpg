import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { BUILTIN_WORKFLOW_NODE_TYPES } from '@/app/lib/workflows/catalog'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: rows, error } = await supabase
      .from('workflow_node_types')
      .select('*')
      .eq('enabled', true)
      .order('sort_order', { ascending: true })

    if (error) {
      return NextResponse.json({ data: BUILTIN_WORKFLOW_NODE_TYPES })
    }

    const dbList =
      rows && rows.length > 0
        ? rows.map((r) => ({
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
          }))
        : []

    const dbSlugs = new Set(dbList.map((t) => t.slug))
    const list = [
      ...dbList,
      ...BUILTIN_WORKFLOW_NODE_TYPES.filter((b) => !dbSlugs.has(b.slug)),
    ].sort((a, b) => a.sort_order - b.sort_order)

    const merged = list.length > 0 ? list : BUILTIN_WORKFLOW_NODE_TYPES

    return NextResponse.json({ data: merged })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load node types'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
