# Parent PG code (Business Center → CRMPG)

BC Group Details no longer exposes a Parent PG column. Hierarchy is derived as follows.

## Table columns (2026)

PGCode, Email, Profile Verified Status, Name, **Parent Name**, D.O.B., Rank, Branch, Nationality, Telephone, Total Frontline, Empire Size, Date Register, Last Purchase Date, Direct Debit Subscription.

## Row modal (Additional Information)

Scrape into `original_data`:

- `Origin`
- `FMD PGCode`
- `FMD Name`

FMD is the upline FMD, **not** the immediate parent.

## `parent_pg_code` rules

1. Read current Tree Tier PG from `#tier_info` (highlighted / `current-customer-tier` row), e.g. `NAME (PG00333473)`.
2. Build a name→PG map from **all Tree Tier breadcrumb rows** plus every synced customer row.
3. For each row:
   - **Parent Name** is `-` or empty → `parent_pg_code` = that viewed Tree Tier PG (for root sync jobs: the job `pg_code`).
   - **Parent Name** is a person → resolve via the name→PG map (covers juniors whose parent is the viewed dealer or another customer in the batch).
   - If the named parent does **not** resolve and a Tree Tier PG is open → fall back to that viewed PG (Group Details rows are that dealer’s frontline; otherwise Workspace treats `parent_pg_code` null as root).
4. Upsert `customers.parent_pg_code` when resolved. Also store `Parent PGCode`, `Parent Name`, and `_viewed_pg_code` (+ Origin / FMD fields) in `original_data`.

## Extension workflow (manual per tier)

The Chrome extension does **not** auto-walk Tree Tier. Two buttons:

1. **Sync my frontline (all pages)** — always tier 0 / your PG (`viewing-0`), regardless of which Tree Tier row is open.
2. **Sync open Tree Tier (all pages)** — syncs whichever dealer you clicked in BC (e.g. Mos). `parent_pg_code` for Parent Name `-` = that node’s PG.

To link deeper levels, open the child in Tree Tier and use button 2 again.

## CRMPG safety net

On `job.completed`, the webapp stamps `parent_pg_code` from `original_data["Parent Name"]`. For blank / `-` Parent Name it prefers existing `original_data["Parent PGCode"]` / `_viewed_pg_code` (nested Tree Tier sync), then falls back to the job root `pg_code`. Worker should still write `parent_pg_code` on upsert so Team → frontline works immediately.

Reference parser: `extension/ikfaidmmhokhgocfhhddhlahmbikjaed/group-detail-parser.js`.
