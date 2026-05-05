import { NextResponse } from 'next/server'
import { getActiveGoogleAdsAgentsForApi } from '@/app/lib/google-ads/active-dealers-for-leads'

/**
 * Public landing page: active Google Ads participants only (paid period active — monthly/yearly).
 */
export async function GET() {
  try {
    const transformedAgents = await getActiveGoogleAdsAgentsForApi()

    const filtered = transformedAgents.filter((agent) => agent.email && agent.username)

    return NextResponse.json(filtered, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    console.error('Error fetching agents:', error)
    const message = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      {
        error: message,
        timestamp: new Date().toISOString(),
        endpoint: '/api/get-all-agents',
      },
      { status: 500 }
    )
  }
}
