'use client'

import { memo, type ReactNode } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { WorkflowNodeState } from '@/app/dashboard/campaigns/_components/CampaignWorkflowModal'

export type WorkflowNodeKind =
  | 'trigger'
  | 'schedule'
  | 'audience'
  | 'database'
  | 'enroll'
  | 'loop'
  | 'transform'
  | 'step'
  | 'http'
  | 'wait'
  | 'pass'
  | 'complete'

export type WorkflowNodeData = {
  title: string
  subtitle: string
  kind: WorkflowNodeKind
  nodeType?: string
  state: WorkflowNodeState
  badge?: string
  selected?: boolean
  editable?: boolean
  onTestNode?: (nodeId: string) => void
  testing?: boolean
}

const KIND_META: Record<
  WorkflowNodeKind,
  { accent: string; iconBg: string; icon: ReactNode }
> = {
  trigger: {
    accent: 'border-l-amber-500',
    iconBg: 'bg-amber-100 text-amber-700',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  schedule: {
    accent: 'border-l-amber-500',
    iconBg: 'bg-amber-100 text-amber-800',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  database: {
    accent: 'border-l-emerald-600',
    iconBg: 'bg-emerald-100 text-emerald-800',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
  },
  loop: {
    accent: 'border-l-cyan-500',
    iconBg: 'bg-cyan-100 text-cyan-800',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    ),
  },
  transform: {
    accent: 'border-l-blue-500',
    iconBg: 'bg-blue-100 text-blue-800',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
  http: {
    accent: 'border-l-violet-600',
    iconBg: 'bg-violet-100 text-violet-800',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
        />
      </svg>
    ),
  },
  wait: {
    accent: 'border-l-pink-500',
    iconBg: 'bg-pink-100 text-pink-800',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  pass: {
    accent: 'border-l-slate-500',
    iconBg: 'bg-slate-100 text-slate-700',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
      </svg>
    ),
  },
  audience: {
    accent: 'border-l-sky-500',
    iconBg: 'bg-sky-100 text-sky-700',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
  enroll: {
    accent: 'border-l-violet-500',
    iconBg: 'bg-violet-100 text-violet-700',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  step: {
    accent: 'border-l-emerald-500',
    iconBg: 'bg-emerald-100 text-emerald-700',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    ),
  },
  complete: {
    accent: 'border-l-slate-400',
    iconBg: 'bg-slate-100 text-slate-600',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
}

function CampaignWorkflowNodeComponent({
  id,
  data,
  sourcePosition,
  targetPosition,
}: NodeProps<Node<WorkflowNodeData>>) {
  const meta = KIND_META[data.kind]
  const state = data.state
  const verticalHandles =
    sourcePosition === Position.Bottom || targetPosition === Position.Top

  const shell =
    data.selected && data.editable
      ? 'border-violet-400 shadow-lg shadow-violet-100/80 ring-2 ring-violet-300/60'
      : state === 'active'
        ? 'border-sky-400 shadow-lg shadow-sky-100/80 ring-2 ring-sky-300/50'
        : state === 'complete'
          ? 'border-emerald-300 shadow-md shadow-emerald-50'
          : 'border-slate-200 shadow-sm'

  return (
    <div
      className={`relative w-[220px] overflow-hidden rounded-xl border border-l-[3px] bg-white ${meta.accent} ${shell} ${data.editable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {state === 'active' ? (
        <span className="absolute right-2 top-2 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-500" />
        </span>
      ) : null}

      <Handle
        id="main"
        type="target"
        position={targetPosition ?? Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-slate-300 !bg-white"
      />

      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.iconBg}`}>{meta.icon}</div>
        <div className="min-w-0 flex-1 pr-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-slate-900">{data.title}</p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">{data.subtitle}</p>
          {data.badge ? (
            <span className="mt-1.5 inline-flex max-w-full truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
              {data.badge}
            </span>
          ) : null}
        </div>
      </div>

      {data.nodeType === 'crm.flow.loop' ? (
        <>
          <Handle
            id="done"
            type="source"
            position={sourcePosition ?? Position.Right}
            style={verticalHandles ? { left: '28%' } : { top: '35%' }}
            className="!h-2.5 !w-2.5 !border-2 !border-slate-400 !bg-white"
          />
          <Handle
            id="loop"
            type="source"
            position={sourcePosition ?? Position.Right}
            style={verticalHandles ? { left: '72%' } : { top: '72%' }}
            className="!h-2.5 !w-2.5 !border-2 !border-cyan-400 !bg-white"
          />
        </>
      ) : (
        <Handle
          id="main"
          type="source"
          position={sourcePosition ?? Position.Right}
          className="!h-2.5 !w-2.5 !border-2 !border-slate-300 !bg-white"
        />
      )}

      {data.editable && data.onTestNode ? (
        <button
          type="button"
          title="Test this node"
          disabled={data.testing}
          onClick={(e) => {
            e.stopPropagation()
            data.onTestNode?.(id)
          }}
          className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#ff6d5a] text-white shadow-md ring-2 ring-white transition hover:bg-[#f25a47] disabled:opacity-60 nodrag nopan"
        >
          {data.testing ? (
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M16.023 9.348h4.992" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
          )}
        </button>
      ) : null}
    </div>
  )
}

export const campaignWorkflowNodeTypes = {
  workflow: memo(CampaignWorkflowNodeComponent),
}
