/**
 * Optional Supabase Edge Function: proxies to your deployed Next.js cron URL.
 *
 * Set secrets:
 *   CAMPAIGN_CRON_URL=https://your-domain.com/api/cron/campaigns
 *   CRON_SECRET=<same as Vercel>
 *
 * Deploy: supabase functions deploy campaign-processor --no-verify-jwt
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

Deno.serve(async () => {
  const url = Deno.env.get('CAMPAIGN_CRON_URL')
  const secret = Deno.env.get('CRON_SECRET')
  if (!url || !secret) {
    return new Response(JSON.stringify({ error: 'CAMPAIGN_CRON_URL and CRON_SECRET must be set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  })

  const text = await res.text()
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
})
