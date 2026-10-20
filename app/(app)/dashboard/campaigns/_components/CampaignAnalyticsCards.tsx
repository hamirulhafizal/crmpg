'use client'

export function CampaignAnalyticsCards(props: {
  enrolled: number
  sent: number
  failed: number
  completed: number
}) {
  const { enrolled, sent, failed, completed } = props
  const rate = sent + failed > 0 ? Math.round((sent / (sent + failed)) * 1000) / 10 : null

  const Card = ({
    label,
    value,
    hint,
  }: {
    label: string
    value: string | number
    hint?: string
  }) => (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card label="Enrolled" value={enrolled} />
      <Card label="Sent" value={sent} />
      <Card label="Failed" value={failed} />
      <Card label="Completed enrollments" value={completed} hint={rate != null ? `Success ${rate}% (sent vs failed)` : undefined} />
    </div>
  )
}
