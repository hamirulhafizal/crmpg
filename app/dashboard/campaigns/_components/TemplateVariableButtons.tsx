'use client'

import { useCallback, useState } from 'react'
import { CUSTOMER_MESSAGE_TEMPLATE_COLUMNS } from '@/app/lib/campaigns/template'

export function TemplateVariableButtons({ compact }: { compact?: boolean }) {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = useCallback(async (col: string) => {
    const token = `{{${col}}}`
    try {
      await navigator.clipboard.writeText(token)
      setCopied(col)
      window.setTimeout(() => setCopied((current) => (current === col ? null : current)), 1500)
    } catch {
      setCopied(null)
    }
  }, [])

  return (
    <div className={compact ? 'mt-1' : 'mt-2'}>
      <p className={`font-medium text-slate-600 ${compact ? 'text-[11px]' : 'text-xs'}`}>Variables</p>
      {!compact ? (
        <p className="mt-0.5 text-[11px] text-slate-500">Click to copy into your message.</p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {CUSTOMER_MESSAGE_TEMPLATE_COLUMNS.map((col) => {
          const isCopied = copied === col
          return (
            <button
              key={col}
              type="button"
              onClick={() => void copy(col)}
              className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
                isCopied
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300'
              }`}
              title={`Copy {{${col}}}`}
              aria-label={`Copy variable {{${col}}}`}
            >
              {isCopied ? 'Copied!' : `{{${col}}}`}
            </button>
          )
        })}
      </div>
    </div>
  )
}
