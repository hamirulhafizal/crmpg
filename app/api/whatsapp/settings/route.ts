import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

// GET /api/whatsapp/settings - Get user's WhatsApp settings (prefer message_automations birthday when present)
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Prefer birthday automation from message_automations if it exists
    const { data: automation } = await supabase
      .from('message_automations')
      .select('enabled, schedule_time, timezone, message_template')
      .eq('user_id', user.id)
      .eq('type', 'birthday')
      .single()

    if (automation) {
      return NextResponse.json({
        auto_send_enabled: automation.enabled,
        send_time: automation.schedule_time,
        timezone: automation.timezone || 'Asia/Kuala_Lumpur',
        default_template: automation.message_template || 'Selamat Hari Jadi, {SenderName}! Semoga panjang umur, murah rezeki, dan bahagia selalu! 🎉🎂',
      })
    }

    // Fallback to whatsapp_settings
    const { data: settings, error } = await supabase
      .from('whatsapp_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    if (!settings) {
      return NextResponse.json({
        auto_send_enabled: true,
        send_time: '08:00:00',
        timezone: 'Asia/Kuala_Lumpur',
        default_template: 'Selamat Hari Jadi, {SenderName}! Semoga panjang umur, murah rezeki, dan bahagia selalu! 🎉🎂',
      })
    }

    return NextResponse.json(settings)
  } catch (error: any) {
    console.error('Error fetching WhatsApp settings:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/whatsapp/settings - Update user's WhatsApp settings
export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { auto_send_enabled, send_time, timezone, default_template } = body

    // Check if settings exist
    const { data: existingSettings } = await supabase
      .from('whatsapp_settings')
      .select('id')
      .eq('user_id', user.id)
      .single()

    const settingsData: any = {}
    if (auto_send_enabled !== undefined) settingsData.auto_send_enabled = auto_send_enabled
    if (send_time !== undefined) settingsData.send_time = send_time
    if (timezone !== undefined) settingsData.timezone = timezone
    if (default_template !== undefined) settingsData.default_template = default_template

    let result
    if (existingSettings) {
      // Update existing settings
      const { data, error } = await supabase
        .from('whatsapp_settings')
        .update(settingsData)
        .eq('id', existingSettings.id)
        .select()
        .single()
      
      result = { data, error }
    } else {
      // Create new settings
      const { data, error } = await supabase
        .from('whatsapp_settings')
        .insert({
          user_id: user.id,
          ...settingsData,
        })
        .select()
        .single()
      
      result = { data, error }
    }

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 500 }
      )
    }

    // Keep message_automations in sync for birthday
    const { data: automationRow } = await supabase
      .from('message_automations')
      .select('id')
      .eq('user_id', user.id)
      .eq('type', 'birthday')
      .single()

    const automationPayload = {
      user_id: user.id,
      type: 'birthday',
      name: 'Birthday Wishes',
      enabled: settingsData.auto_send_enabled ?? result.data?.auto_send_enabled,
      schedule_time: settingsData.send_time ?? result.data?.send_time,
      timezone: settingsData.timezone ?? result.data?.timezone,
      message_template: settingsData.default_template ?? result.data?.default_template,
    }
    if (automationRow) {
      await supabase
        .from('message_automations')
        .update({
          enabled: automationPayload.enabled,
          schedule_time: automationPayload.schedule_time,
          timezone: automationPayload.timezone,
          message_template: automationPayload.message_template,
          updated_at: new Date().toISOString(),
        })
        .eq('id', automationRow.id)
    } else {
      await supabase.from('message_automations').insert({
        user_id: user.id,
        type: 'birthday',
        name: 'Birthday Wishes',
        enabled: automationPayload.enabled ?? true,
        schedule_time: automationPayload.schedule_time ?? '08:00:00',
        timezone: automationPayload.timezone ?? 'Asia/Kuala_Lumpur',
        message_template: automationPayload.message_template ?? 'Selamat Hari Jadi, {SenderName}! Semoga panjang umur, murah rezeki, dan bahagia selalu! 🎉🎂',
      })
    }

    return NextResponse.json({
      success: true,
      settings: result.data,
    })
  } catch (error: any) {
    console.error('Error updating WhatsApp settings:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}



