import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

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

      return {
        user_id: user.id,
        name: customer.name || customer.Name || null,
        dob: customer.dob || customer['D.O.B.'] || customer['D.O.B'] || customer.DOB || null,
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
        pg_code: customer.PGCode || customer.pg_code || customer.PGCode || null,
        original_data: Object.keys(originalData).length > 0 ? originalData : null,
      }
    })

    // Insert customers in batches of 1000 (Supabase limit)
    const batchSize = 1000
    const results = {
      total: customersToInsert.length,
      inserted: 0,
      ids: [] as string[],
    }

    for (let i = 0; i < customersToInsert.length; i += batchSize) {
      const batch = customersToInsert.slice(i, i + batchSize)
      
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
