'use client'

import type { ComponentProps } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CampaignWorkflowModal } from '@/app/dashboard/campaigns/_components/CampaignWorkflowModal'
import { draftFromCampaignPayload } from '@/app/lib/campaigns/workflow-layout'
import {
  applyWorkflowProgressEvent,
  createInitialWorkflowUi,
  runCampaignTestWithStream,
} from '@/app/dashboard/campaigns/_components/campaign-workflow-client'
import { AnimatePresence, motion } from 'framer-motion'
import { CampaignEditor } from '@/app/dashboard/campaigns/_components/CampaignEditor'
import {
  CampaignDetailContent,
  CampaignDetailSkeleton,
  type CampaignDetailPayload,
} from '@/app/dashboard/campaigns/_components/CampaignDetailContent'
import { CampaignEditorSkeleton } from '@/app/dashboard/campaigns/_components/CampaignEditorSkeleton'
import type { CampaignAudienceFilters, CampaignStatus, CampaignTriggerType } from '@/app/lib/campaigns/types'

const Z_PANEL = 'z-[950]'

export type CampaignPanelMode = 'create' | { edit: string } | { view: string }

type Props = {
  panelMode: CampaignPanelMode | null
  onClose: () => void
  onNavigateEdit: (id: string) => void
  onNavigateView: (id: string) => void
  pushToast: (type: 'success' | 'error', text: string) => void
  onSaved: () => void
}

export function CampaignFullScreenPanel({
  panelMode,
  onClose,
  onNavigateEdit,
  onNavigateView,
  pushToast,
  onSaved,
}: Props) {
  const transition = { type: 'tween' as const, duration: 0.35, ease: [0.22, 1, 0.36, 1] as const }

  return (
    <AnimatePresence>
      {panelMode ? (
        <motion.div
          key={
            panelMode === 'create'
              ? 'create'
              : 'edit' in panelMode
                ? `edit-${panelMode.edit}`
                : `view-${panelMode.view}`
          }
          className={`fixed inset-0 ${Z_PANEL} flex justify-end`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.button
            type="button"
            aria-label="Close panel"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="relative flex h-full w-full max-w-full flex-col bg-white shadow-2xl md:max-w-3xl lg:max-w-4xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={transition}
          >
            <CampaignPanelBody
              mode={panelMode}
              onClose={onClose}
              onNavigateEdit={onNavigateEdit}
              onNavigateView={onNavigateView}
              pushToast={pushToast}
              onSaved={onSaved}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function CampaignPanelBody({
  mode,
  onClose,
  onNavigateEdit,
  onNavigateView,
  pushToast,
  onSaved,
}: {
  mode: CampaignPanelMode
  onClose: () => void
  onNavigateEdit: (id: string) => void
  onNavigateView: (id: string) => void
  pushToast: (type: 'success' | 'error', text: string) => void
  onSaved: () => void
}) {
  if (mode === 'create') {
    return (
      <>
        <PanelChrome title="New campaign" subtitle="Define audience, triggers, and drip steps." onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8">
          <CampaignEditor
            mode="create"
            onCancel={onClose}
            onSaveSuccess={({ id }) => {
              pushToast('success', 'Campaign created.')
              onSaved()
              onNavigateView(id)
            }}
          />
        </div>
      </>
    )
  }

  if ('edit' in mode) {
    return (
      <EditPanelInner
        id={mode.edit}
        onClose={onClose}
        onNavigateView={onNavigateView}
        pushToast={pushToast}
        onSaved={onSaved}
      />
    )
  }

  return (
    <ViewPanelInner
      id={mode.view}
      onClose={onClose}
      onNavigateEdit={onNavigateEdit}
      pushToast={pushToast}
    />
  )
}

function PanelChrome(props: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{props.title}</h1>
        {props.subtitle ? <p className="mt-1 text-sm text-slate-600">{props.subtitle}</p> : null}
      </div>
      <button
        type="button"
        onClick={props.onClose}
        className="shrink-0 rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
        aria-label="Close"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </header>
  )
}

function EditPanelInner({
  id,
  onClose,
  onNavigateView,
  pushToast,
  onSaved,
}: {
  id: string
  onClose: () => void
  onNavigateView: (id: string) => void
  pushToast: (type: 'success' | 'error', text: string) => void
  onSaved: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [initial, setInitial] = useState<ComponentProps<typeof CampaignEditor>['initial']>()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setInitial(undefined)
    ;(async () => {
      try {
        const res = await fetch(`/api/campaigns/${id}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed')
        if (cancelled) return
        const camp = json.data.campaign
        const steps = json.data.steps as Array<{
          step_order: number
          delay_days: number
          send_time: string
          message_template: string
        }>
        setInitial({
          name: camp.name,
          description: camp.description,
          status: camp.status as CampaignStatus,
          trigger_type: camp.trigger_type as CampaignTriggerType,
          trigger_offset_days: camp.trigger_offset_days,
          timezone: camp.timezone,
          audience_filters: (camp.audience_filters || {}) as CampaignAudienceFilters,
          daily_send_limit: camp.daily_send_limit,
          cooldown_days: camp.cooldown_days,
          start_at: camp.start_at,
          end_at: camp.end_at,
          steps,
        })
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <>
      <PanelChrome title="Edit campaign" onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8">
        {loading ? (
          <CampaignEditorSkeleton />
        ) : error || !initial ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error || 'Not found'}
          </div>
        ) : (
          <CampaignEditor
            mode="edit"
            campaignId={id}
            initial={initial}
            onCancel={onClose}
            onSaveSuccess={() => {
              pushToast('success', 'Campaign saved.')
              onSaved()
              onNavigateView(id)
            }}
          />
        )}
      </div>
    </>
  )
}

function ViewPanelInner({
  id,
  onClose,
  onNavigateEdit,
  pushToast,
}: {
  id: string
  onClose: () => void
  onNavigateEdit: (id: string) => void
  pushToast: (type: 'success' | 'error', text: string) => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<CampaignDetailPayload | null>(null)
  const [testRunBusy, setTestRunBusy] = useState(false)
  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [workflowUi, setWorkflowUi] = useState(() => createInitialWorkflowUi([]))

  const stepOrders = useMemo(() => {
    const steps = (payload?.steps ?? []) as Array<{ step_order: number; is_active?: boolean }>
    return steps.filter((s) => s.is_active !== false).map((s) => s.step_order)
  }, [payload?.steps])

  useEffect(() => {
    if (!workflowOpen) return
    setWorkflowUi(createInitialWorkflowUi(stepOrders))
  }, [workflowOpen, id, stepOrders.join(',')])

  const load = useCallback(async (): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setPayload(json.data as CampaignDetailPayload)
      return true
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
      setPayload(null)
      return false
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const cName = payload?.campaign && typeof payload.campaign === 'object' ? String((payload.campaign as { name?: string }).name ?? '') : ''

  const runTestWithWorkflow = useCallback(async () => {
    setWorkflowOpen(true)
    setWorkflowUi(createInitialWorkflowUi(stepOrders))
    setTestRunBusy(true)
    try {
      const result = await runCampaignTestWithStream(id, (event) => {
        setWorkflowUi((prev) => applyWorkflowProgressEvent(prev, event))
      })
      if (!result.ok) {
        pushToast('error', result.error || 'Run failed')
      } else {
        pushToast('success', 'Test run finished. See workflow for details.')
        await load()
      }
    } catch (e: unknown) {
      pushToast('error', e instanceof Error ? e.message : 'Run failed')
    } finally {
      setTestRunBusy(false)
    }
  }, [id, stepOrders, load, pushToast])

  const camp = payload?.campaign as {
    name?: string
    status?: string
    trigger_type?: string
    trigger_offset_days?: number
    audience_filters?: Record<string, unknown>
    daily_send_limit?: number
    cooldown_days?: number
    workflow_layout?: { nodes?: Record<string, { x: number; y: number }> }
  } | undefined

  const workflowDraft = useMemo(() => {
    if (!payload || !camp) return null
    const stepRows = (payload.steps as Array<Record<string, unknown>>).map((s) => ({
      id: String(s.id),
      step_order: Number(s.step_order),
      delay_days: Number(s.delay_days ?? 0),
      send_time: String(s.send_time ?? '10:00'),
      message_template: String(s.message_template ?? ''),
      is_active: s.is_active !== false,
    }))
    return draftFromCampaignPayload(camp, stepRows)
  }, [payload, camp])

  return (
    <>
      <PanelChrome title={'Campaign'} subtitle="Details & analytics" onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8">
        {loading ? (
          <CampaignDetailSkeleton />
        ) : error || !payload ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error || 'Not found'}</div>
        ) : (
          <CampaignDetailContent
            payload={payload}
            onEdit={() => onNavigateEdit(id)}
            onOpenWorkflow={() => setWorkflowOpen(true)}
            onRefresh={() => {
              void load().then((ok) => {
                if (ok) pushToast('success', 'Refreshed.')
                else pushToast('error', 'Could not refresh.')
              })
            }}
            testRunBusy={testRunBusy}
            onTestRun={runTestWithWorkflow}
          />
        )}
      </div>
      {payload && camp ? (
        <CampaignWorkflowModal
          open={workflowOpen}
          onClose={() => setWorkflowOpen(false)}
          campaignId={id}
          editable
          initialDraft={workflowDraft ?? undefined}
          onSaved={() => {
            pushToast('success', 'Workflow saved.')
            void load()
          }}
          campaignName={String(camp.name ?? cName)}
          campaignStatus={String(camp.status ?? 'draft')}
          triggerType={String(camp.trigger_type ?? 'manual')}
          steps={(payload.steps as Array<Record<string, unknown>>).map((s) => ({
            id: String(s.id),
            step_order: Number(s.step_order),
            delay_days: Number(s.delay_days ?? 0),
            send_time: String(s.send_time ?? '10:00'),
            message_template: String(s.message_template ?? ''),
            is_active: s.is_active !== false,
          }))}
          enrolled={payload.stats.enrolled}
          dueNow={payload.audience?.due_now.total ?? 0}
          matchingAudience={payload.audience?.eligible.matching_total}
          nodeStates={workflowUi.nodeStates}
          logs={workflowUi.logs}
          running={testRunBusy}
          currentSend={workflowUi.currentSend}
          onRunTest={() => void runTestWithWorkflow()}
          testRunDisabled={camp.status !== 'active'}
        />
      ) : null}
    </>
  )
}
