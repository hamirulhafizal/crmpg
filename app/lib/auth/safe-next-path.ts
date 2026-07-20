/** Only same-origin relative paths — blocks open redirects. */
export function sanitizeNextPath(next: string | null | undefined): string {
  const value = (next ?? '/dashboard').trim() || '/dashboard'
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/dashboard'
  }
  return value
}
