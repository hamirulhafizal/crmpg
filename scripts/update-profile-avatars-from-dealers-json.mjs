#!/usr/bin/env node
/**
 * Sync public.profiles from a NocoDB/export-style dealers JSON array (match auth.users by email).
 * Sets: avatar_url, pgcode, phone, username_pbo (requires migration 025).
 *
 * Usage:
 *   node scripts/update-profile-avatars-from-dealers-json.mjs "/path/to/Dealers.json"
 *   npm run update-avatars-from-dealers-json -- "/path/to/Dealers.json"
 *
 * Options:
 *   --dry-run   Print actions only, no DB writes
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const DRY_RUN = process.argv.includes('--dry-run')
const args = process.argv.slice(2).filter((a) => a !== '--dry-run')
const jsonPath = args[0]
  ? resolve(args[0])
  : resolve(process.env.DEALERS_JSON_PATH || '')

function loadEnvFromDotenv() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return
  const raw = readFileSync(envPath, 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    const key = m[1].trim()
    let val = m[2].trim().replace(/^["']|["']$/g, '')
    if (process.env[key] === undefined) process.env[key] = val
  }
}

function normEmail(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
}

function normPhone(raw) {
  if (raw == null || raw === '') return null
  const s = String(raw).trim()
  const digits = s.replace(/\D/g, '')
  return digits.length >= 9 ? digits : null
}

async function buildEmailToUserIdMap(admin) {
  const map = new Map()
  let page = 1
  const perPage = 1000
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const users = data?.users || []
    for (const u of users) {
      if (u.email) map.set(normEmail(u.email), u.id)
    }
    if (users.length < perPage) break
    page += 1
  }
  return map
}

function extractRows(parsed) {
  if (!Array.isArray(parsed)) throw new Error('JSON root must be an array')
  const out = []
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue
    const email = row.email ?? row.Email
    if (!email) continue

    const imageUrlRaw = row.image_url ?? row.Image
    const url = imageUrlRaw != null ? String(imageUrlRaw).trim() : ''
    const avatar_url =
      url && url !== 'https://via.placeholder.com/150' ? url : null

    const pgRaw = row.pgcode ?? row['PG Code'] ?? row.pg_code
    const pgcode =
      pgRaw != null && String(pgRaw).trim() ? String(pgRaw).trim() : null

    const phone = normPhone(row.phone ?? row.Phone)

    const usernameRaw =
      row['Username PGO'] ?? row['Username PBO'] ?? row.username_pbo ?? row.username_pgo
    const username_pbo =
      usernameRaw != null && String(usernameRaw).trim()
        ? String(usernameRaw).trim()
        : null

    if (!avatar_url && !pgcode && !phone && !username_pbo) continue

    out.push({
      email: normEmail(email),
      avatar_url,
      pgcode,
      phone,
      username_pbo,
    })
  }
  return out
}

async function main() {
  loadEnvFromDotenv()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  if (!jsonPath || !existsSync(jsonPath)) {
    console.error('Usage: node scripts/update-profile-avatars-from-dealers-json.mjs <path-to-dealers.json>')
    console.error('Or set DEALERS_JSON_PATH')
    process.exit(1)
  }

  const raw = readFileSync(jsonPath, 'utf8')
  const parsed = JSON.parse(raw)
  const rows = extractRows(parsed)
  if (rows.length === 0) {
    console.error('No rows with email and at least one of avatar_url / pgcode / phone / username_pbo')
    process.exit(1)
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`Loaded ${rows.length} dealer row(s) from ${jsonPath}`)
  const emailToId = await buildEmailToUserIdMap(admin)
  console.log(`Auth users indexed: ${emailToId.size}`)

  let updated = 0
  let skippedNoUser = 0
  let skippedNoProfile = 0

  for (const row of rows) {
    const { email, avatar_url, pgcode, phone, username_pbo } = row
    const userId = emailToId.get(email)
    if (!userId) {
      console.warn(`No auth user for email: ${email}`)
      skippedNoUser += 1
      continue
    }

    const patch = {
      updated_at: new Date().toISOString(),
    }
    if (avatar_url != null) patch.avatar_url = avatar_url
    if (pgcode != null) patch.pgcode = pgcode
    if (phone != null) patch.phone = phone
    if (username_pbo != null) patch.username_pbo = username_pbo

    if (DRY_RUN) {
      console.log(`[dry-run] ${email} (${userId})`, patch)
      updated += 1
      continue
    }

    const { data: existing, error: selErr } = await admin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()
    if (selErr) {
      console.error(`Select profile ${email}:`, selErr.message)
      continue
    }
    if (!existing) {
      console.warn(`No profiles row for user id ${userId} (${email})`)
      skippedNoProfile += 1
      continue
    }

    const { error: upErr } = await admin.from('profiles').update(patch).eq('id', userId)
    if (upErr) {
      console.error(`Update ${email}:`, upErr.message)
      continue
    }
    console.log(`Updated profile for ${email}`)
    updated += 1
  }

  console.log(
    `\nDone. updated=${updated} skippedNoUser=${skippedNoUser} skippedNoProfile=${skippedNoProfile} dryRun=${DRY_RUN}`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
