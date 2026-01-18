import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

// Helper function to parse and normalize date strings to ISO format (YYYY-MM-DD)
function parseDate(dateValue: any): string | null {
  if (!dateValue) return null
  
  // If it's already a date object, convert to ISO string
  if (dateValue instanceof Date) {
    return dateValue.toISOString().split('T')[0]
  }
  
  // Convert to string if it's not already
  const dateStr = String(dateValue).trim()
  if (!dateStr || dateStr === 'null' || dateStr === 'undefined' || dateStr === '') {
    return null
  }
  
  try {
    // Format 1: YYYY-MM-DD (ISO format) - check first
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (isoMatch) {
      // Validate the date
      const year = parseInt(isoMatch[1], 10)
      const month = parseInt(isoMatch[2], 10)
      const day = parseInt(isoMatch[3], 10)
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return dateStr
      }
    }
    
    // Format 2: DD/MM/YYYY or D/M/YYYY (e.g., "22/7/2006", "01/12/2000")
    // Common in Malaysia and many countries
    const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (slashMatch) {
      const part1 = parseInt(slashMatch[1], 10)
      const part2 = parseInt(slashMatch[2], 10)
      const year = parseInt(slashMatch[3], 10)
      
      let day: number
      let month: number
      
      // Determine format: if part1 > 12, it must be day (DD/MM/YYYY)
      if (part1 > 12) {
        day = part1
        month = part2
      } 
      // If part2 > 12, it must be MM/DD/YYYY
      else if (part2 > 12) {
        month = part1
        day = part2
      }
      // Ambiguous case (both <= 12): default to DD/MM/YYYY for Malaysia
      else {
        day = part1
        month = part2
      }
      
      // Validate month and day
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        // Double-check with Date object
        const dateObj = new Date(year, month - 1, day)
        if (dateObj.getFullYear() === year && dateObj.getMonth() === month - 1 && dateObj.getDate() === day) {
          return isoDate
        }
      }
    }
    
    // Format 3: DD-MM-YYYY (e.g., "22-7-2006")
    const dashMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
    if (dashMatch) {
      const part1 = parseInt(dashMatch[1], 10)
      const part2 = parseInt(dashMatch[2], 10)
      const year = parseInt(dashMatch[3], 10)
      
      let day: number
      let month: number
      
      if (part1 > 12) {
        day = part1
        month = part2
      } else if (part2 > 12) {
        month = part1
        day = part2
      } else {
        day = part1
        month = part2
      }
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const dateObj = new Date(year, month - 1, day)
        if (dateObj.getFullYear() === year && dateObj.getMonth() === month - 1 && dateObj.getDate() === day) {
          return isoDate
        }
      }
    }
    
    // Format 4: Try JavaScript Date parsing as fallback (handles many formats)
    const parsedDate = new Date(dateStr)
    if (!isNaN(parsedDate.getTime())) {
      const isoDate = parsedDate.toISOString().split('T')[0]
      // Only use if it makes sense (not 1970-01-01 for invalid dates)
      if (parsedDate.getFullYear() > 1900 && parsedDate.getFullYear() < 2100) {
        return isoDate
      }
    }
    
    // If all parsing fails, return null
    console.warn(`Unable to parse date: ${dateStr}`)
    return null
  } catch (error) {
    console.error(`Error parsing date "${dateStr}":`, error)
    return null
  }
}

// POST /api/customers/bulk - Bulk create customers
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
        'sender_name', 'save_name', 'pg_code'
      ]
      
      const originalData: any = {}
      Object.keys(customer).forEach(key => {
        if (!mainFields.includes(key) && key !== 'id' && key !== 'user_id') {
          originalData[key] = customer[key]
        }
      })

      // Parse DOB from various formats
      const dobValue = customer.dob || customer['D.O.B.'] || customer['D.O.B'] || customer.DOB || null
      const parsedDob = parseDate(dobValue)

      const pgCode = customer.PGCode || customer.pg_code || customer.PGCode || null

      return {
        user_id: user.id,
        name: customer.name || customer.Name || null,
        dob: parsedDob,
        email: customer.email || customer.Email || null,
        phone: customer.phone || customer.Phone || customer.Telephone ,
        location: customer.location || customer.Location || null,
        gender: customer.Gender || customer.gender || null,
        ethnicity: customer.Ethnicity || customer.ethnicity || null,
        age: customer.Age || customer.age || null,
        prefix: customer.Prefix || customer.prefix || null,
        first_name: customer.FirstName || customer.first_name || customer.FirstName || null,
        sender_name: customer.SenderName || customer.sender_name || customer.SenderName || null,
        save_name: customer.SaveName || customer.save_name || customer.SaveName || null,
        pg_code: pgCode,
        original_data: Object.keys(originalData).length > 0 ? originalData : null,
      }
    })

    // Check for duplicates by pg_code
    // Extract non-null pg_code values from the input
    const pgCodesToCheck = customersToInsert
      .map(c => c.pg_code)
      .filter((code): code is string => code !== null && code !== undefined && code.trim() !== '')

    // Query existing customers with these pg_codes for the current user
    let existingPgCodes = new Set<string>()
    if (pgCodesToCheck.length > 0) {
      // Query in batches to avoid URL length limits
      const pgCodeBatchSize = 100
      for (let i = 0; i < pgCodesToCheck.length; i += pgCodeBatchSize) {
        const pgCodeBatch = pgCodesToCheck.slice(i, i + pgCodeBatchSize)
        
        const { data: existingCustomers, error: queryError } = await supabase
          .from('customers')
          .select('pg_code')
          .eq('user_id', user.id)
          .in('pg_code', pgCodeBatch)
          .not('pg_code', 'is', null)

        if (queryError) {
          console.error('Error checking duplicates:', queryError)
          // Continue with insert even if duplicate check fails
        } else if (existingCustomers) {
          existingCustomers.forEach((c: any) => {
            if (c.pg_code) {
              existingPgCodes.add(c.pg_code)
            }
          })
        }
      }
    }

    // Filter out duplicates - only keep customers with unique pg_code or null pg_code
    const newCustomers = customersToInsert.filter(customer => {
      if (!customer.pg_code || customer.pg_code.trim() === '') {
        // Allow null/empty pg_code (won't be checked for duplicates)
        return true
      }
      // Only include if pg_code doesn't exist in database
      return !existingPgCodes.has(customer.pg_code)
    })

    const duplicateCount = customersToInsert.length - newCustomers.length

    if (newCustomers.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        duplicates: duplicateCount,
        message: `All ${duplicateCount} customer(s) already exist in the database (duplicate pg_code)`,
        ids: [],
      })
    }

    // Insert customers in batches of 1000 (Supabase limit)
    const batchSize = 1000
    const results = {
      total: customersToInsert.length,
      inserted: 0,
      duplicates: duplicateCount,
      ids: [] as string[],
    }

    for (let i = 0; i < newCustomers.length; i += batchSize) {
      const batch = newCustomers.slice(i, i + batchSize)
      
      const { data: insertedData, error } = await supabase
        .from('customers')
        .insert(batch)
        .select('id')

      if (error) {
        console.error('Error inserting batch:', error)
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        )
      }

      results.inserted += insertedData?.length || 0
      results.ids.push(...(insertedData?.map(c => c.id) || []))
    }

    return NextResponse.json({
      success: true,
      count: results.inserted,
      duplicates: results.duplicates,
      message: results.duplicates > 0 
        ? `Successfully saved ${results.inserted} new customer(s). ${results.duplicates} duplicate(s) skipped.`
        : `Successfully saved ${results.inserted} customer(s) to database!`,
      ids: results.ids,
    })
  } catch (error: any) {
    console.error('Error in POST /api/customers/bulk:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/customers/bulk - Bulk delete customers
export async function DELETE(request: Request) {
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
    const { ids } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'IDs array is required' },
        { status: 400 }
      )
    }

    // Delete customers (RLS will ensure user can only delete their own)
    const { error, count } = await supabase
      .from('customers')
      .delete()
      .in('id', ids)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting customers:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      count: count || 0,
      message: `${count || 0} customer(s) deleted successfully`,
    })
  } catch (error: any) {
    console.error('Error in DELETE /api/customers/bulk:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}



