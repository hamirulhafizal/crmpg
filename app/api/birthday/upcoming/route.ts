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
    const adminMode = searchParams.get('admin') === 'true'

    // Get current date (normalized to start of day for comparison)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + days)

    // Get all customers with DOB and phone
    // If admin mode, get all customers; otherwise, filter by user_id
    let query = supabase
      .from('customers')
      .select('*')
      .not('dob', 'is', null)
      .not('phone', 'is', null)
    
    // Only filter by user_id if not in admin mode
    if (!adminMode) {
      query = query.eq('user_id', user.id)
    }

    const { data: customers, error } = await query

    if (error) {
      console.error('Error fetching customers:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    if (!customers || customers.length === 0) {
      return NextResponse.json({
        birthdays: [],
        today_count: 0,
        upcoming_count: 0,
      })
    }

    // Helper function to normalize date (remove time component)
    const normalizeDate = (date: Date) => {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    }

    // Helper function to check if birthday falls within range
    const isBirthdayInRange = (dob: Date, startDate: Date, endDate: Date) => {
      const currentYear = startDate.getFullYear()
      const nextYear = currentYear + 1
      
      // Create birthday date for current year
      const birthdayThisYear = new Date(currentYear, dob.getMonth(), dob.getDate())
      const normalizedBirthdayThisYear = normalizeDate(birthdayThisYear)
      
      // Create birthday date for next year (in case range crosses year boundary)
      const birthdayNextYear = new Date(nextYear, dob.getMonth(), dob.getDate())
      const normalizedBirthdayNextYear = normalizeDate(birthdayNextYear)
      
      const normalizedStart = normalizeDate(startDate)
      const normalizedEnd = normalizeDate(endDate)

      // Check if birthday falls within range (for this year or next year)
      return (
        (normalizedBirthdayThisYear >= normalizedStart && normalizedBirthdayThisYear <= normalizedEnd) ||
        (normalizedBirthdayNextYear >= normalizedStart && normalizedBirthdayNextYear <= normalizedEnd)
      )
    }

    // Filter and map customers by birthday date range
    const upcomingBirthdays = customers
      .filter(customer => {
        if (!customer.dob) return false
        
        const dob = new Date(customer.dob)
        return isBirthdayInRange(dob, today, endDate)
      })
      .map(customer => {
        const dob = new Date(customer.dob!)
        const currentYear = today.getFullYear()
        const birthdayThisYear = new Date(currentYear, dob.getMonth(), dob.getDate())
        const normalizedBirthday = normalizeDate(birthdayThisYear)
        const normalizedToday = normalizeDate(today)
        
        // Check if birthday is today
        const isToday = normalizedBirthday.getTime() === normalizedToday.getTime()
        
        // Calculate age
        const age = customer.age || 
          (today.getFullYear() - dob.getFullYear() - 
           (today < birthdayThisYear ? 1 : 0))

        return {
          ...customer,
          birthday_date: birthdayThisYear.toISOString().split('T')[0],
          age,
          is_today: isToday,
        }
      })
      .sort((a, b) => {
        // Sort by date, today's birthdays first
        if (a.is_today && !b.is_today) return -1
        if (!a.is_today && b.is_today) return 1
        return new Date(a.birthday_date).getTime() - new Date(b.birthday_date).getTime()
      })

    // Check which customers already received birthday messages today
    const todayStr = today.toISOString().split('T')[0]
    let sentMessagesQuery = supabase
      .from('birthday_messages')
      .select('customer_id')
      .gte('sent_at', `${todayStr}T00:00:00Z`)
      .lte('sent_at', `${todayStr}T23:59:59Z`)
    
    // Only filter by user_id if not in admin mode
    if (!adminMode) {
      sentMessagesQuery = sentMessagesQuery.eq('user_id', user.id)
    }
    
    const { data: sentMessages } = await sentMessagesQuery

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


