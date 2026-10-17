# Supabase performance improvements (end-to-end)

Based on the Supabase Reports dashboard (Last 7 days) and live project advisors/logs for **crmpg**.

| Metric | Observed | Notes |
|--------|----------|--------|
| Total requests | ~1.53M | Mostly API Gateway |
| Success rate | 93.1% | Dragged down mainly by Postgres errors |
| API | ~1.40M req · ~50k warnings · 371 errors | Volume problem; hard errors rare |
| Postgres | ~79k req · **~55k errors** | Dominated by duplicate-key failures |
| Auth | ~48k req · 444 errors | Driven largely by middleware `getUser` |
| Storage | negligible | Low volume |

---

## Root causes (ranked)

1. **Campaign enrollments duplicate inserts** — Postgres logs show mass:
   `duplicate key value violates unique constraint "campaign_enrollments_campaign_id_customer_id_key"`
2. **Middleware Auth on almost every request** — `auth.getUser()` in middleware, often **doubled** again in API handlers.
3. **Idle PG Business Center sync polling** — Customers page polls status every ~20s even with no active job.
4. **Heavy customers reads** — `/api/customers` and `/api/customers/stats` use `select('*')` and sometimes full-table JS filtering.
5. **Chrome extension per-row REST upserts** — one Gateway request per customer during sync.
6. **Hot uncached endpoints** — e.g. `/api/get-all-agents` (`no-store`), `/api/saas/me` (many tables).
7. **RLS / policy performance** — 67 policies re-evaluate `auth.uid()` per row; `customers` has overlapping SELECT policies including an open “read for all” policy.
8. **Missing FK indexes** — campaign enrollments/logs and others (advisor INFO).

---

## End-to-end improvement plan

### Phase 1 — Fix Postgres errors (raises success rate)

| # | Action | Where | Expected impact |
|---|--------|--------|-----------------|
| 1.1 | Change campaign enrollment insert → **upsert** / `ON CONFLICT DO NOTHING` on `(campaign_id, customer_id)` | Campaign enroll / processor code (`app/lib/campaigns/*`, related APIs) | Eliminate most of ~55k Postgres errors |
| 1.2 | Confirm only **one** cron fires enroll/process (Vercel vs `pg_cron`) so work isn’t double-applied | Cron routes + Supabase cron jobs | Fewer duplicate attempts + less load |
| 1.3 | Investigate statement timeouts (rare but present in logs) after enroll fix | Reports → Postgres logs | Clean residual timeouts |

**Done when:** Postgres error share drops sharply week-over-week; enroll constraint errors near zero.

---

### Phase 2 — Cut API request volume (Auth + polling)

| # | Action | Where | Expected impact |
|---|--------|--------|-----------------|
| 2.1 | **Skip middleware Auth** for cron, webhooks, trusted workers (`/api/cron/*`, `/api/pg-sync/webhook`, automation senders already allowlisted where needed) | `middleware.ts`, `app/lib/supabase/middleware.ts` | Large drop in Auth + API Gateway calls |
| 2.2 | **Auth once per request** — middleware resolves user; handlers reuse it (avoid second `getUser`) | `require-user.ts`, `pg-sync/auth.ts`, API routes | ~50% Auth cut on protected APIs |
| 2.3 | **Stop idle PG-sync polling** — poll only when job active, modal open, or window focus; optional webhook-driven refresh | `usePgSyncQueueMonitor.ts`, `PgBusinessCenterSyncModal.tsx` | Removes steady 20s × dealers traffic |
| 2.4 | Don’t **write** `pg_sync_jobs` on every poll if status unchanged | `app/api/pg-sync/status`, `jobs-db.ts` | Fewer Postgres writes + API work |
| 2.5 | Slow active job poll (e.g. 5–10s) after TAC/captcha window | Sync modal / monitor hooks | Lower burst traffic during sync |

**Done when:** API daily volume falls with same active users; Auth request chart flattens.

---

### Phase 3 — Slim data reads (customers + stats)

| # | Action | Where | Expected impact |
|---|--------|--------|-----------------|
| 3.1 | `/api/customers/stats` — use SQL aggregates / `count` with narrow columns; **never** `select('*')` full scan | `app/api/customers/stats/route.ts` | Big cut in PostgREST payload + DB CPU |
| 3.2 | `/api/customers` list — select only columns needed for the table; push filters to DB | `app/api/customers/route.ts`, `fetch-customers.ts` | Less Gateway bandwidth + faster page |
| 3.3 | Remove / narrow `shouldUseJsFiltering` so filters don’t force 1000-row batch downloads of entire dealer book | Same | Stops accidental full-table pulls |
| 3.4 | Keep “Show all” / birthday modes intentional; avoid defaulting to `limit: 100000` | Customers UI + fetch helpers | Caps worst-case reads |

**Done when:** Customers page + stats generate far fewer REST rows per load.

---

### Phase 4 — Extension + hot endpoints

| # | Action | Where | Expected impact |
|---|--------|--------|-----------------|
| 4.1 | Extension: **batch upsert** customers (`on_conflict`) instead of per-row PATCH/POST | `extension/.../background.js` | Removes sync storms on API Gateway |
| 4.2 | Cache `/api/get-all-agents` (e.g. `s-maxage` 30–60s); avoid Auth Admin `listUsers` stampede every hit | `app/api/get-all-agents` | Landing / public traffic cheaper |
| 4.3 | Slim or short-cache `/api/saas/me` | `app/api/saas/me`, entitlements | Fewer multi-table hits per shell load |
| 4.4 | Review WhatsApp / Google Ads polling intervals while dialogs closed | WA host, Ads rotation panels | Small but steady savings |

**Done when:** Sync and landing spikes no longer dominate API charts.

---

### Phase 5 — Database / RLS performance (Supabase Advisors)

| # | Action | Detail | Docs |
|---|--------|--------|------|
| 5.1 | Fix **Auth RLS InitPlan** (67 policies) | Replace `auth.uid()` with `(select auth.uid())` (and same for other `auth.*` / `current_setting`) | [RLS: call functions with select](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) |
| 5.2 | Prioritize tables | `customers`, `customer_tags`, campaigns/enrollments/logs, `pg_sync_jobs`, `profiles`, WAHA sessions | Migration |
| 5.3 | Remove **open SELECT** on `customers` | Drop policy `"Enable read access for all users"`; keep own-user policy only | Security + less policy work |
| 5.4 | Collapse **multiple permissive policies** where redundant | Advisors: customers, lucky-draw/campaign platform defaults | [Multiple permissive policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies) |
| 5.5 | Add **missing FK indexes** | e.g. `campaign_enrollments.customer_id`, `campaign_message_logs` FKs, SaaS/Google Ads FKs | Advisor: unindexed foreign keys |
| 5.6 | Optional: Auth connection strategy → **percentage-based** | Dashboard / going-to-prod guidance | [Going into prod](https://supabase.com/docs/guides/deployment/going-into-prod) |
| 5.7 | Optional: vacuum / bloat on `net._http_response` if pg_net used heavily | Maintenance window | Advisor: table bloat |

**Done when:** Performance advisors WARN count for RLS InitPlan / multiple policies drops; customers queries stay fast under RLS.

---

## Suggested implementation order

```text
1. Campaign enroll ON CONFLICT          → success rate
2. Idle PG-sync poll off + cron Auth skip → API volume
3. Customers stats/list slim selects    → API + Postgres load
4. RLS (select auth.uid()) + drop open customers read
5. Extension batch upsert + cache hot APIs
6. FK indexes + remaining advisor cleanup
```

---

## Implementation status (2026-10-17)

| Item | Status |
|------|--------|
| 1.1 Campaign enroll upsert / ignoreDuplicates | Done (`process-due.ts`) |
| 2.1–2.2 Skip middleware Auth for `/api/*` + cron/webhooks | Done (`middleware.ts`, `supabase/middleware.ts`) |
| 2.3–2.5 Idle PG-sync poll off; slower active poll; skip no-op job writes | Done |
| 3.1 Stats narrow select | Done |
| 3.3 Stop `hasAnyFilter` forcing JS full-scan | Done |
| 4.1 Extension concurrent REST writes (chunks of 16) | Done |
| 4.2–4.3 Cache `get-all-agents` + `saas/me` | Done |
| 5.x RLS InitPlan + drop open customers read + FK indexes | Migration `069_rls_auth_initplan_and_fk_indexes.sql` |

## Verification checklist

After each phase, compare Supabase Reports (7-day) and Logs:

- [ ] Postgres: `campaign_enrollments_*_key` duplicate errors ≈ 0
- [ ] Overall success rate trending toward ~99%+
- [ ] API total requests down for similar traffic
- [ ] Auth request volume down (middleware / double-getUser)
- [ ] Customers page load does not pull full `select('*')` book for stats
- [ ] Advisors: Auth RLS InitPlan WARN reduced; open customers read policy gone
- [ ] Extension sync no longer one REST call per row

**Dashboard path:** Supabase → Project **crmpg** → Reports → last 7 days  
**Advisors:** already run — Auth RLS InitPlan (WARN ×67), Multiple permissive policies (WARN ×8), Unindexed FKs (INFO), Unused indexes (INFO).

---

## Key code / config map

| Area | Paths |
|------|--------|
| Middleware Auth | `middleware.ts`, `app/lib/supabase/middleware.ts` |
| API Auth helpers | `app/lib/auth/require-user.ts`, `app/lib/pg-sync/auth.ts` |
| PG sync poll / jobs | `usePgSyncQueueMonitor.ts`, `PgBusinessCenterSyncModal.tsx`, `app/api/pg-sync/*`, `app/lib/pg-sync/*` |
| Customers list/stats | `app/api/customers/route.ts`, `stats/route.ts`, `app/lib/customers/fetch-customers.ts` |
| Campaigns / enroll | `app/lib/campaigns/*`, campaign APIs, pg_cron / Vercel cron |
| Extension sync | `extension/ikfaidmmhokhgocfhhddhlahmbikjaed/background.js` |
| Hot APIs | `app/api/get-all-agents`, `app/api/saas/me` |
| Schema / RLS | `supabase/migrations/*` |

---

## Out of scope / not the main driver

- Supabase Realtime reconnect loops (not used aggressively in app).
- Storage (volume too low to matter).
- Upgrading plan alone without fixing enroll duplicates + polling (won’t fix the 55k Postgres errors).
