import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

// GET /api/customers - List all customers for logged-in user
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
    const search = searchParams.get('search') || ''
    const gender = searchParams.get('gender') || ''
    const ethnicity = searchParams.get('ethnicity') || ''
    const birthday = searchParams.get('birthday') || '' // '', 'today', 'month'
    const accountStatus = searchParams.get('accountStatus') || '' // '', 'active', 'inactive', 'free'
    const sortBy = searchParams.get('sortBy') || 'created_at'
    const sortOrder = searchParams.get('sortOrder') || 'desc'

    // Build query
    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)

    // Apply search filter
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
    }

    // Apply filters
    if (gender) {
      query = query.eq('gender', gender)
    }
    if (ethnicity) {
      query = query.eq('ethnicity', ethnicity)
    }

    // Apply sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc' })

    const shouldUseJsFiltering =
      birthday === 'today' || birthday === 'month' || !!accountStatus

    if (shouldUseJsFiltering) {
      // If birthday filtering is requested, we filter by month/day in JS because
      // `dob` is a DATE column (recurring birthday ignores the year).
      let queryForJs = query
      if (birthday === 'today' || birthday === 'month') {
        queryForJs = queryForJs.not('dob', 'is', null)
      }

      const { data, error } = await queryForJs

      if (error) {
        console.error('Error fetching customers:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      let filtered = data || []

      if (birthday === 'today' || birthday === 'month') {
        // Match existing birthday automation logic (UTC+8 / Malaysia).
        const nowForTz = new Date()
        const MALAYSIA_OFFSET_MINUTES = 8 * 60
        const localTzNow = new Date(
          nowForTz.getTime() + MALAYSIA_OFFSET_MINUTES * 60 * 1000
        )
        const todayMonth = localTzNow.getUTCMonth() + 1 // 1-12
        const todayDate = localTzNow.getUTCDate() // 1-31

        const parseDob = (dob: unknown): { month: number; day: number } | null => {
          if (!dob) return null
          const s = typeof dob === 'string' ? dob : String(dob)
          // Expected: YYYY-MM-DD from Postgres DATE
          const parts = s.split('-')
          if (parts.length < 3) return null
          const month = Number(parts[1])
          const day = Number(parts[2])
          if (!Number.isFinite(month) || !Number.isFinite(day)) return null
          return { month, day }
        }

        filtered = filtered.filter((c: any) => {
          const parsed = parseDob(c?.dob)
          if (!parsed) return false
          if (birthday === 'today') {
            return parsed.month === todayMonth && parsed.day === todayDate
          }
          return parsed.month === todayMonth
        })
      }

      if (accountStatus) {
        const parseOriginalDateToUTC = (value: unknown): number | null => {
          if (!value) return null
          if (typeof value !== 'string') return null

          const s = value.trim()
          // Expected format: `YYYY-MM-DD HH:mm:ss`
          const m = s.match(
            /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/
          )
          if (!m) {
            const t = new Date(s).getTime()
            return Number.isFinite(t) ? t : null
          }

          const [, y, mo, d, h, mi, sec] = m
          const t = Date.UTC(
            Number(y),
            Number(mo) - 1,
            Number(d),
            Number(h),
            Number(mi),
            Number(sec)
          )
          return Number.isFinite(t) ? t : null
        }

        const getAccountStatusKey = (
          originalData: any
        ): 'inactive' | 'free' | 'active' | 'unknown' => {
          const raw = originalData?.['Last Purchase Date']
          if (raw === undefined || raw === null || raw === '') return 'unknown'

          if (typeof raw === 'string') {
            const s = raw.trim().toLowerCase()
            if (s.includes('no sales transaction within a year')) return 'free'
          }

          const lastPurchaseMs = parseOriginalDateToUTC(raw)
          if (!lastPurchaseMs) return 'unknown'

          const oneYearMs = 365 * 24 * 60 * 60 * 1000
          if (Date.now() - lastPurchaseMs > oneYearMs) return 'inactive'
          return 'active'
        }

        filtered = filtered.filter((c: any) => {
          return getAccountStatusKey(c?.original_data) === accountStatus
        })
      }

      // Apply pagination after filtering.
      const from = (page - 1) * limit
      const to = from + limit
      const paged = filtered.slice(from, to)

      return NextResponse.json({
        data: paged,
        pagination: {
          page,
          limit,
          total: filtered.length,
          totalPages: Math.ceil(filtered.length / limit),
        },
      })
    }

    // Default: apply pagination in the database.
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching customers:', error)
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
    console.error('Error in GET /api/customers:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/customers - Create new customer(s)
export async function POST(request: Request) {
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
    const { customers } = body

    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      return NextResponse.json(
        { error: 'Customers array is required' },
        { status: 400 }
      )
    }

    // Prepare customers data with user_id
    const customersToInsert = customers.map((customer: any) => {
      // Extract original_data (all fields not in main columns)
      const mainFields = [
        'name', 'dob', 'email', 'phone', 'location',
        'gender', 'ethnicity', 'age', 'prefix', 'first_name',
        'sender_name', 'save_name', 'pg_code', 'row_number',
        'is_married',
        // legacy (column removed): we normalize into original_data["Profile Verified"]
        'is_profile_verified'
      ]
      
      // UI may send `original_data` already; keep it and merge any other
      // "extra" fields into the JSON column.
      const inputOriginalData =
        customer.original_data && typeof customer.original_data === 'object'
          ? customer.original_data
          : null

      const originalData: any = { ...(inputOriginalData || {}) }

      Object.keys(customer).forEach((key) => {
        if (key === 'original_data') return
        if (!mainFields.includes(key) && key !== 'id' && key !== 'user_id') {
          originalData[key] = customer[key]
        }
      })

      // Backwards compatibility: if legacy `is_profile_verified` is provided,
      // normalize it into `original_data["Profile Verified"]`.
      const hasProfileVerified =
        originalData['Profile Verified'] !== undefined &&
        originalData['Profile Verified'] !== null &&
        originalData['Profile Verified'] !== ''

      if (!hasProfileVerified && customer.is_profile_verified !== undefined) {
        originalData['Profile Verified'] =
          customer.is_profile_verified === true || customer.is_profile_verified === 'true' ? 'Yes' : 'No'
      }

      return {
        user_id: user.id,
        name: customer.name || customer.Name || null,
        dob: customer.dob || customer['D.O.B.'] || customer['D.O.B'] || customer.DOB || null,
        email: customer.email || customer.Email || null,
        phone: customer.phone || customer.Phone || null,
        location: customer.location || customer.Location || null,
        gender: customer.Gender || customer.gender || null,
        ethnicity: customer.Ethnicity || customer.ethnicity || null,
        age: customer.Age || customer.age || null,
        prefix: customer.Prefix || customer.prefix || null,
        first_name: customer.FirstName || customer.first_name || customer.FirstName || null,
        sender_name: customer.SenderName || customer.sender_name || customer.SenderName || null,
        save_name: customer.SaveName || customer.save_name || customer.SaveName || null,
        pg_code: customer.PGCode || customer.pg_code || customer.PGCode || null,
        row_number: customer.row_number || customer.rowNumber || customer['row_number'] || null,
        is_married: customer.is_married === true || customer.is_married === 'true',
        original_data: Object.keys(originalData).length > 0 ? originalData : null,
      }
    })

    // Insert customers
    const { data: insertedData, error } = await supabase
      .from('customers')
      .insert(customersToInsert)
      .select('id')

    if (error) {
      console.error('Error inserting customers:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      count: insertedData?.length || 0,
      ids: insertedData?.map(c => c.id) || [],
    })
  } catch (error: any) {
    console.error('Error in POST /api/customers:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}



