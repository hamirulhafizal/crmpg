import { NextResponse } from 'next/server'

import { requireAdminApi } from '@/app/lib/auth/require-admin'
import {
  AUTOMATION_TEMPLATES_SETTINGS_KEY,
  normalizeAutomationTemplateMap,
  type AutomationTemplateMap,
} from '@/app/lib/automation/default-templates'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('admin_app_settings')
    .select('value')
    .eq('key', AUTOMATION_TEMPLATES_SETTINGS_KEY)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    templates: normalizeAutomationTemplateMap(data?.value),
  })
}

export async function PUT(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const templates: AutomationTemplateMap = normalizeAutomationTemplateMap(body.templates)

  const admin = createServiceRoleClient()
  const { error } = await admin.from('admin_app_settings').upsert(
    {
      key: AUTOMATION_TEMPLATES_SETTINGS_KEY,
      value: templates,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, templates })
}
