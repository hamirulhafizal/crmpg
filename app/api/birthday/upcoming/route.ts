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
    const days = parseInt(searchParams.get('days') || '7')
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

    const targetDate = new Date(date)
    const endDate = new Date(targetDate)
    endDate.setDate(endDate.getDate() + days)

    // Format dates for SQL
    const startDateStr = targetDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // Get customers with birthdays in the date range
    // We need to check if DOB month/day matches within the range
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', user.id)
      .not('dob', 'is', null)
      .not('phone', 'is', null)

    if (error) {
      console.error('Error fetching customers:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    // Filter customers by birthday date range
    const upcomingBirthdays = customers
      ?.filter(customer => {
        if (!customer.dob) return false

        const dob = new Date(customer.dob)
        const currentYear = targetDate.getFullYear()
        
        // Create birthday date for current year
        const birthdayThisYear = new Date(currentYear, dob.getMonth(), dob.getDate())
        
        // Also check next year if range crosses year boundary
        const birthdayNextYear = new Date(currentYear + 1, dob.getMonth(), dob.getDate())

        return (
          (birthdayThisYear >= targetDate && birthdayThisYear <= endDate) ||
          (birthdayNextYear >= targetDate && birthdayNextYear <= endDate)
        )
      })
      .map(customer => {
        const dob = new Date(customer.dob!)
        const today = new Date()
        const currentYear = today.getFullYear()
        const birthdayThisYear = new Date(currentYear, dob.getMonth(), dob.getDate())
        
        // Calculate age
        const age = customer.age || (today.getFullYear() - dob.getFullYear() - 
          (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0))

        return {
          ...customer,
          birthday_date: birthdayThisYear.toISOString().split('T')[0],
          age,
          is_today: birthdayThisYear.toDateString() === today.toDateString(),
        }
      })
      .sort((a, b) => {
        // Sort by date, today's birthdays first
        if (a.is_today && !b.is_today) return -1
        if (!a.is_today && b.is_today) return 1
        return new Date(a.birthday_date).getTime() - new Date(b.birthday_date).getTime()
      }) || []

    // Check which customers already received birthday messages today
    const today = new Date().toISOString().split('T')[0]
    const { data: sentMessages } = await supabase
      .from('birthday_messages')
      .select('customer_id')
      .eq('user_id', user.id)
      .gte('sent_at', `${today}T00:00:00Z`)
      .lte('sent_at', `${today}T23:59:59Z`)

    const sentCustomerIds = new Set(sentMessages?.map(m => m.customer_id) || [])

    // Add sent status to each customer
    const birthdaysWithStatus = upcomingBirthdays.map(customer => ({
      ...customer,
      already_sent: sentCustomerIds.has(customer.id),
    }))

    return NextResponse.json({
      birthdays: birthdaysWithStatus,
      today_count: birthdaysWithStatus.filter(b => b.is_today).length,
      upcoming_count: birthdaysWithStatus.filter(b => !b.is_today).length,
    })
  } catch (error: any) {
    console.error('Error fetching upcoming birthdays:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}


