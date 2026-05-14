/**
 * PostgREST `.or()` splits the filter string on `.` to find column / operator / value.
 * ISO-8601 timestamps include `.` before fractional seconds, so the value must be
 * double-quoted or Supabase returns 400 Bad Request.
 */
export function enrollmentNextSendDueOr(isoNow: string): string {
  const escaped = isoNow.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `next_send_at.is.null,next_send_at.lte."${escaped}"`
}
