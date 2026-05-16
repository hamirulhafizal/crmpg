'use client'

import { memo, type ReactNode } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { WorkflowNodeState } from '@/app/dashboard/campaigns/_components/CampaignWorkflowModal'

export type WorkflowNodeKind = 'trigger' | 'audience' | 'enroll' | 'step' | 'complete'

export type WorkflowNodeData = {
  title: string
  subtitle: string
  kind: WorkflowNodeKind
  state: WorkflowNodeState
  badge?: string
  selected?: boolean
  editable?: boolean
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

function CampaignWorkflowNodeComponent({ data, sourcePosition, targetPosition }: NodeProps<Node<WorkflowNodeData>>) {
  const meta = KIND_META[data.kind]
  const state = data.state

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

      <Handle
        type="source"
        position={sourcePosition ?? Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-slate-300 !bg-white"
      />
    </div>
  )
}

export const campaignWorkflowNodeTypes = {
  workflow: memo(CampaignWorkflowNodeComponent),
}
