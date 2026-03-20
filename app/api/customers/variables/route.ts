import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

// GET /api/customers/variables
// Returns a dynamic list of variable names derived from the public.customers columns.
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch a single row just to inspect column keys. If there are no rows yet,
    // fall back to an empty object so we can still return a sensible default list.
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    const sample = data || {}
    const columnNames = Object.keys(sample)

    // If the table is empty for this user, expose the known schema columns instead.
    const baseColumns =
      columnNames.length > 0
        ? columnNames
        : [
            'name',
            'dob',
            'email',
            'phone',
            'location',
            'gender',
            'ethnicity',
            'age',
            'prefix',
            'first_name',
            'sender_name',
            'save_name',
            'pg_code',
          ]

    const specialMap: Record<string, string> = {
      pg_code: 'PGCode',
      first_name: 'FirstName',
      sender_name: 'SenderName',
      save_name: 'SaveName',
      dob: 'DOB',
    }

    const toVarName = (col: string): string => {
      if (specialMap[col]) return specialMap[col]
      return col
        .split('_')
        .map(part => (part ? part[0].toUpperCase() + part.slice(1) : ''))
        .join('')
    }

    const variables = baseColumns
      .filter(col => !['id', 'user_id', 'original_data', 'created_at', 'updated_at'].includes(col))
      .map(toVarName)

    const extra = ['LastPurchaseDate', 'RegistrationDate']
    const merged = [...variables]
    for (const v of extra) {
      if (!merged.includes(v)) merged.push(v)
    }

    return NextResponse.json({ variables: merged })
  } catch (err: any) {
    console.error('Error fetching customer variables:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

