/** Extract Bearer token from Authorization header (mobile / API clients). */
export function extractBearerToken(request?: Request | null): string | null {
  const header = request?.headers.get('authorization')
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}
