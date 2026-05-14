# Campaigns module

Multi-step WhatsApp campaigns with JSON audience filters, enrollments, and send logs. Processing runs on **Vercel Cron** (every 5 minutes) → `GET /api/cron/campaigns` with `Authorization: Bearer $CRON_SECRET`.

## Environment

- `CRON_SECRET` — required for the cron route (and optional Supabase Edge Function) to call the processor.
- `SUPABASE_SERVICE_ROLE_KEY` — used by the in-app processor to bypass RLS when sending and enrolling at scale.
- WAHA — same as existing automation (`waha_user_sessions`, `profiles.waha_server_id`, etc.).

## Database

Apply migration `034_campaigns_module.sql`. RPC helpers:

- `get_campaign_audience(campaign_id)` — tag-based subset (optional extension for richer filters in SQL).
- `enroll_campaign_customers(campaign_id)` — inserts enrollments for RPC audience matches.

Full audience matching (account status, segment attributes, etc.) runs in **application code** (`app/lib/campaigns/audience.ts`) during cron enrollment sync.

## UX

- Dashboard → **Campaigns** (requires WAHA connected card — same as Automated Messages).
- List: `/dashboard/campaigns`
- Create: `/dashboard/campaigns/new`
- Detail / analytics: `/dashboard/campaigns/[id]`
- Edit: `/dashboard/campaigns/[id]/edit`

## Supabase Edge Function (optional)

Deploy `supabase/functions/campaign-processor` to call your production `/api/cron/campaigns` with `CRON_SECRET`, or schedule Supabase cron → Edge Function → HTTPS.

## Limitations (v1)

- `birthday` / `last_purchase` triggers are stored but enrollment automation is focused on `manual` / `enrollment`-style audience sync; extend `process-due.ts` for calendar triggers.
- Audience RPC is tag-centric; the cron path uses TS filters for account status parity with the CRM.
