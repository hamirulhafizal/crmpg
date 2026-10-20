'use client'

export function CampaignEditorSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16" aria-busy="true" aria-live="polite">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-6 w-32 rounded bg-slate-200/90 animate-pulse" />
        <div className="space-y-2">
          <div className="h-3 w-16 rounded bg-slate-200/80 animate-pulse" />
          <div className="h-10 w-full rounded-xl bg-slate-100 animate-pulse" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-slate-200/80 animate-pulse" />
          <div className="h-20 w-full rounded-xl bg-slate-100 animate-pulse" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
          <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-6 w-28 rounded bg-slate-200/90 animate-pulse" />
        <div className="h-40 rounded-2xl border border-slate-200 bg-slate-50 animate-pulse" />
      </div>
      <div className="flex justify-end gap-3">
        <div className="h-10 w-24 rounded-xl bg-slate-200/70 animate-pulse" />
        <div className="h-10 w-36 rounded-xl bg-slate-200/90 animate-pulse" />
      </div>
    </div>
  )
}
