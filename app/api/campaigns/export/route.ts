import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { sanitizeCampaignRecordForTransfer } from '@/app/lib/workflows/sanitize-export'

type ExportRequest = {
  ids?: string[]
  include_all?: boolean
}

type ExportCampaign = {
  campaign: Record<string, unknown>
  steps: Array<Record<string, unknown>>
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as ExportRequest
    const includeAll = body.include_all === true
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : []
    if (!includeAll && ids.length === 0) {
      return NextResponse.json({ error: 'Provide ids or include_all=true' }, { status: 400 })
    }

    let query = supabase.from('campaigns').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (!includeAll) {
      query = query.in('id', ids)
    }
    const { data: campaigns, error: campaignsErr } = await query
    if (campaignsErr) throw campaignsErr
    const rows = campaigns ?? []

    const campaignIds = rows.map((r) => String(r.id))
    let stepsByCampaign = new Map<string, Array<Record<string, unknown>>>()
    if (campaignIds.length > 0) {
      const { data: stepRows, error: stepErr } = await supabase
        .from('campaign_steps')
        .select('*')
        .in('campaign_id', campaignIds)
        .order('step_order', { ascending: true })
      if (stepErr) throw stepErr
      for (const s of stepRows ?? []) {
        const key = String(s.campaign_id)
        const list = stepsByCampaign.get(key) ?? []
        list.push(s as Record<string, unknown>)
        stepsByCampaign.set(key, list)
      }
    }

    const exportCampaigns: ExportCampaign[] = rows.map((c) => ({
      campaign: sanitizeCampaignRecordForTransfer(c as Record<string, unknown>),
      steps: stepsByCampaign.get(String(c.id)) ?? [],
    }))

    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      campaigns: exportCampaigns,
    }

    const fileName = `campaigns-export-${new Date().toISOString().slice(0, 10)}.json`
    return NextResponse.json({ data: payload, file_name: fileName, count: exportCampaigns.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to export campaigns'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
