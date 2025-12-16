import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

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

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const dateFrom = searchParams.get('date_from') || null
    const dateTo = searchParams.get('date_to') || null

    // Build query
    let query = supabase
      .from('birthday_messages')
      .select(`
        *,
        customer:customers(id, name, sender_name, save_name, phone),
        connection:whatsapp_connections(sender_number)
      `, { count: 'exact' })
      .eq('user_id', user.id)
      .order('sent_at', { ascending: false })

    // Apply date filters
    if (dateFrom) {
      query = query.gte('sent_at', `${dateFrom}T00:00:00Z`)
    }
    if (dateTo) {
      query = query.lte('sent_at', `${dateTo}T23:59:59Z`)
    }

    // Apply pagination
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching birthday history:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error: any) {
    console.error('Error fetching birthday history:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}


