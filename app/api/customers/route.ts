import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import {
  getAccountStatusKey,
  getLastPurchaseUtcMonthDate,
  getLastPurchaseUtcYmd,
  getRegistrationUtcMonthDate,
  getRegistrationUtcYmd,
} from '@/app/lib/customer-account-status'

// GET /api/customers - List all customers for logged-in user
export async function GET(request: Request) {
  try {
    const noStoreHeaders = {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store',
    }

    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: noStoreHeaders }
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
    const accountStatus = searchParams.get('accountStatus') || '' // '', matches AccountStatusKey
    const registerMonth = searchParams.get('registerMonth') || '' // '1'..'12'
    const lastPurchaseMonth = searchParams.get('lastPurchaseMonth') || '' // '1'..'12'
    const sortBy = searchParams.get('sortBy') || 'created_at'
    const sortOrder = searchParams.get('sortOrder') || 'desc'
    const isComputedDateSort =
      sortBy === 'register_date' || sortBy === 'last_purchase_date'

    // Build query
    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)

    // Apply search filter
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,pg_code.ilike.%${search}%`)
    }

    // Apply filters
    if (gender) {
      query = query.eq('gender', gender)
    }
    if (ethnicity) {
      query = query.eq('ethnicity', ethnicity)
    }

    // Apply sorting
    if (!isComputedDateSort) {
      query = query.order(sortBy, { ascending: sortOrder === 'asc' })
    } else {
      // Stable default ordering before JS computed-date sort.
      query = query.order('created_at', { ascending: false })
    }

    const shouldUseJsFiltering =
      birthday === 'today' ||
      birthday === 'month' ||
      !!accountStatus ||
      !!registerMonth ||
      !!lastPurchaseMonth ||
      isComputedDateSort

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
        return NextResponse.json({ error: error.message }, { status: 500, headers: noStoreHeaders })
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

        const parseDob = (
          dob: unknown
        ): { month: number; day: number } | null => {
          if (!dob) return null
          const s = typeof dob === 'string' ? dob.trim() : String(dob).trim()
          if (!s) return null

          // 1) `YYYY-MM-DD...` (Postgres DATE or DATE with time)
          const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
          if (m1) {
            const month = Number(m1[2])
            const day = Number(m1[3])
            if (!Number.isFinite(month) || !Number.isFinite(day)) return null
            return { month, day }
          }

          // 2) `Mar 26, 2025`-style (some imports / string DOB)
          const m2 = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/)
          if (m2) {
            const monthName = String(m2[1]).toLowerCase()
            const day = Number(m2[2])
            const monthMap: Record<string, number> = {
              jan: 1,
              january: 1,
              feb: 2,
              february: 2,
              mar: 3,
              march: 3,
              apr: 4,
              april: 4,
              may: 5,
              jun: 6,
              june: 6,
              jul: 7,
              july: 7,
              aug: 8,
              august: 8,
              sep: 9,
              sept: 9,
              september: 9,
              oct: 10,
              october: 10,
              nov: 11,
              november: 11,
              dec: 12,
              december: 12,
            }
            const month = monthMap[monthName]
            if (!month || !Number.isFinite(day)) return null
            return { month, day }
          }

          return null
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
        filtered = filtered.filter((c: any) => {
          return getAccountStatusKey(c) === accountStatus
        })
      }

      if (registerMonth) {
        const targetMonth = Number(registerMonth)
        if (Number.isFinite(targetMonth) && targetMonth >= 1 && targetMonth <= 12) {
          filtered = filtered.filter((c: any) => {
            const reg = getRegistrationUtcMonthDate(c?.original_data, c?.created_at)
            if (!reg) return false
            return reg.month + 1 === targetMonth
          })
        }
      }

      if (lastPurchaseMonth) {
        const targetMonth = Number(lastPurchaseMonth)
        if (Number.isFinite(targetMonth) && targetMonth >= 1 && targetMonth <= 12) {
          filtered = filtered.filter((c: any) => {
            const lp = getLastPurchaseUtcMonthDate(c)
            if (!lp) return false
            return lp.month + 1 === targetMonth
          })
        }
      }

      if (isComputedDateSort) {
        const asc = sortOrder === 'asc'
        filtered = [...filtered].sort((a: any, b: any) => {
          const avRaw =
            sortBy === 'register_date'
              ? getRegistrationUtcYmd(a?.original_data, a?.created_at)
              : getLastPurchaseUtcYmd(a)
          const bvRaw =
            sortBy === 'register_date'
              ? getRegistrationUtcYmd(b?.original_data, b?.created_at)
              : getLastPurchaseUtcYmd(b)

          // Register Date sort is anniversary-like (ignore year).
          // Last Purchase sort remains full date (includes year).
          const toMonthDay = (ymd: string | null): string | null => {
            if (!ymd) return null
            const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
            if (!m) return null
            return `${m[2]}-${m[3]}`
          }

          const av =
            sortBy === 'register_date'
              ? toMonthDay(avRaw)
              : avRaw
          const bv =
            sortBy === 'register_date'
              ? toMonthDay(bvRaw)
              : bvRaw

          if (!av && !bv) return 0
          if (!av) return 1
          if (!bv) return -1
          const cmp = av.localeCompare(bv)
          return asc ? cmp : -cmp
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
      }, { headers: noStoreHeaders })
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
        { status: 500, headers: noStoreHeaders }
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
    }, { headers: noStoreHeaders })
  } catch (error: any) {
    console.error('Error in GET /api/customers:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
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



