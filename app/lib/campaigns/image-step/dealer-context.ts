import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import type { DealerImageContext, DealerImageVariable } from '@/app/lib/campaigns/image-step/types'

export function resolveDealerImageVariable(
  variable: string,
  dealer?: DealerImageContext | null
): string {
  if (!dealer) return ''
  const key = variable.replace(/[{}]/g, '').trim() as DealerImageVariable
  switch (key) {
    case 'DealerFullName':
      return dealer.full_name
    case 'DealerPhone':
      return dealer.phone
    case 'DealerPGCode':
      return dealer.pgcode
    case 'DealerEmail':
      return dealer.email
    default:
      return ''
  }
}

export async function loadDealerImageContext(userId: string): Promise<DealerImageContext> {
  const admin = createServiceRoleClient()
  const [{ data: profile }, { data: authData }] = await Promise.all([
    admin.from('profiles').select('full_name, phone, pgcode').eq('id', userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ])

  return {
    full_name: profile?.full_name?.trim() ?? '',
    phone: profile?.phone?.trim() ?? '',
    pgcode: profile?.pgcode?.trim() ?? '',
    email: authData?.user?.email?.trim() ?? '',
  }
}
