import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import {
  AUTOMATION_TEMPLATES_SETTINGS_KEY,
  normalizeAutomationTemplateMap,
} from '@/app/lib/automation/default-templates'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('admin_app_settings')
    .select('value')
    .eq('key', AUTOMATION_TEMPLATES_SETTINGS_KEY)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ templates: normalizeAutomationTemplateMap(data?.value) })
}
