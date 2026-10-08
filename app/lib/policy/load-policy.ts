import { readFile } from 'fs/promises'
import path from 'path'
import {
  getPolicyMeta,
  POLICY_CATALOG,
  type PolicyMeta,
  type PolicySlug,
} from '@/app/lib/policy/catalog'

export type PolicyBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }

export type LoadedPolicy = {
  meta: PolicyMeta
  blocks: PolicyBlock[]
}

function extractSection(raw: string, meta: PolicyMeta, next: PolicyMeta | null): string {
  const startMatch = meta.marker.exec(raw)
  if (!startMatch || startMatch.index == null) {
    throw new Error(`Policy section not found for "${meta.slug}"`)
  }
  const contentStart = startMatch.index + startMatch[0].length
  let contentEnd = raw.length
  if (next) {
    const nextMatch = next.marker.exec(raw.slice(contentStart))
    if (nextMatch?.index != null) {
      contentEnd = contentStart + nextMatch.index
    }
  }
  return raw.slice(contentStart, contentEnd).trim()
}

function isNumberedHeading(line: string): { level: 2 | 3; text: string } | null {
  const m = line.match(/^(\d+(?:\.\d+)*)\.\s+(.+)$/)
  if (!m) return null
  const depth = m[1].split('.').length
  return { level: depth === 1 ? 2 : 3, text: `${m[1]}. ${m[2].trim()}` }
}

/** Turn plain policy text into structured blocks for rendering. */
export function parsePolicyBody(sectionText: string): PolicyBlock[] {
  const chunks = sectionText
    .split(/\n\s*\n/)
    .map((chunk) =>
      chunk
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
    )
    .filter((lines) => lines.length > 0)

  const blocks: PolicyBlock[] = []

  for (const lines of chunks) {
    if (lines.length === 1) {
      const heading = isNumberedHeading(lines[0])
      if (heading) {
        blocks.push({ type: 'heading', level: heading.level, text: heading.text })
        continue
      }
    }

    // First line may be a numbered heading followed by body in same chunk
    const firstHeading = isNumberedHeading(lines[0])
    if (firstHeading && lines.length > 1) {
      blocks.push({ type: 'heading', level: firstHeading.level, text: firstHeading.text })
      const rest = lines.slice(1).join(' ').replace(/\s+/g, ' ').trim()
      if (rest) blocks.push({ type: 'paragraph', text: rest })
      continue
    }

    const text = lines.join(' ').replace(/\s+/g, ' ').trim()
    if (text) blocks.push({ type: 'paragraph', text })
  }

  return blocks
}

let cachedRaw: string | null = null

async function readPolicySource(): Promise<string> {
  if (cachedRaw) return cachedRaw
  const filePath = path.join(process.cwd(), 'public', 'policy', 'content.txt')
  cachedRaw = await readFile(filePath, 'utf8')
  return cachedRaw
}

export async function loadPolicy(slug: PolicySlug): Promise<LoadedPolicy> {
  const meta = getPolicyMeta(slug)
  if (!meta) throw new Error(`Unknown policy slug: ${slug}`)

  const raw = await readPolicySource()
  const index = POLICY_CATALOG.findIndex((p) => p.slug === slug)
  const next = index >= 0 && index < POLICY_CATALOG.length - 1 ? POLICY_CATALOG[index + 1] : null
  const section = extractSection(raw, meta, next)

  return {
    meta,
    blocks: parsePolicyBody(section),
  }
}

export async function loadAllPolicySlugs(): Promise<PolicySlug[]> {
  return POLICY_CATALOG.map((p) => p.slug)
}
