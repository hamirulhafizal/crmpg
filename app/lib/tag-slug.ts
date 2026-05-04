/** Normalise user input into a stable slug: lowercase [a-z0-9_]. */
export function normalizeTagSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

export function isValidTagSlug(slug: string): boolean {
  return /^[a-z0-9_]+$/.test(slug) && slug.length >= 1 && slug.length <= 80
}
