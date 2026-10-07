/** Generic main-content skeleton for app routes (sidebar/header stay mounted). */
export function PageContentSkeleton({
  className = '',
  rows = 4,
}: {
  className?: string
  rows?: number
}) {
  return (
    <div
      className={`mx-auto max-w-4xl animate-pulse space-y-6 px-4 py-8 sm:px-6 lg:px-8 ${className}`.trim()}
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-lg bg-muted" />
        <div className="h-4 w-72 max-w-full rounded-md bg-muted/80" />
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 h-5 w-32 rounded-md bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-24 rounded-xl bg-muted/80" />
          <div className="h-24 rounded-xl bg-muted/80" />
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-4 rounded-md bg-muted/80" style={{ width: `${88 - i * 8}%` }} />
        ))}
      </div>
    </div>
  )
}
