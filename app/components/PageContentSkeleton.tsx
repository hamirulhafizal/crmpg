/** Generic main-content skeleton for app routes (sidebar/header stay mounted). */
export function PageContentSkeleton({
  className = '',
  rows = 4,
  variant = 'default',
}: {
  className?: string
  rows?: number
  /** `billing` mirrors Billing & plans layout (plan card + two plan tiles). */
  variant?: 'default' | 'billing'
}) {
  if (variant === 'billing') {
    return (
      <div
        className={`mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6 ${className}`.trim()}
        aria-busy="true"
        aria-label="Loading billing"
      >
        <div className="animate-pulse space-y-8 pb-8">
          <div className="space-y-2">
            <div className="h-8 w-44 rounded-lg bg-muted" />
            <div className="h-4 w-80 max-w-full rounded-md bg-muted/70" />
          </div>

          {/* Current plan */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="h-5 w-28 rounded-md bg-muted" />
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="h-7 w-24 rounded-md bg-muted" />
                <div className="h-4 w-36 rounded-md bg-muted/70" />
                <div className="h-4 w-48 rounded-md bg-muted/60" />
              </div>
              <div className="space-y-2 text-right">
                <div className="ml-auto h-4 w-40 rounded-md bg-muted/70" />
                <div className="ml-auto h-4 w-44 rounded-md bg-muted/60" />
              </div>
            </div>
          </div>

          {/* Free / Pro cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <div className="h-5 w-16 rounded-md bg-muted" />
                <div className="mt-3 h-8 w-28 rounded-md bg-muted" />
                <div className="mt-3 h-4 w-full rounded-md bg-muted/60" />
                <div className="mt-4 space-y-2">
                  <div className="h-3.5 w-[90%] rounded-md bg-muted/70" />
                  <div className="h-3.5 w-[75%] rounded-md bg-muted/60" />
                  <div className="h-3.5 w-[82%] rounded-md bg-muted/50" />
                </div>
                <div className="mt-6 h-11 w-full rounded-xl bg-muted/80" />
              </div>
            ))}
          </div>

          {/* Payment history */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="h-5 w-36 rounded-md bg-muted" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: Math.min(rows, 3) }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-4 w-28 rounded-md bg-muted/70" />
                  <div className="h-4 w-20 rounded-md bg-muted/60" />
                  <div className="h-4 w-16 rounded-md bg-muted/50" />
                  <div className="h-4 flex-1 rounded-md bg-muted/40" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`mx-auto flex w-full max-w-auto flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8 ${className}`.trim()}
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="animate-pulse space-y-6">
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
        <div className="space-y-3 rounded-2xl border border-border bg-card p-6 shadow-sm">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="h-4 rounded-md bg-muted/80"
              style={{ width: `${88 - i * 8}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
