'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  AUTOMATION_TEMPLATE_OPTIONS,
  matchAutomationTemplateKey,
  normalizeAutomationTemplateMap,
  type AutomationTemplateKey,
  type AutomationTemplateMap,
} from '@/app/lib/automation/default-templates'

type Props = {
  messageTemplate: string
  onSelectTemplate: (text: string) => void
}

export function AutomationTemplatePicker({ messageTemplate, onSelectTemplate }: Props) {
  const [templates, setTemplates] = useState<AutomationTemplateMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void fetch('/api/automation/templates', { cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as {
          templates?: unknown
          error?: string
        }
        if (!res.ok) {
          throw new Error(typeof json.error === 'string' ? json.error : 'Failed to load templates')
        }
        return normalizeAutomationTemplateMap(json.templates)
      })
      .then((loaded) => {
        if (cancelled) return
        setTemplates(loaded)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Failed to load templates')
        setTemplates(normalizeAutomationTemplateMap(null))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const selectedKey = useMemo(() => {
    if (!templates) return ''
    return matchAutomationTemplateKey(messageTemplate, templates) ?? ''
  }, [messageTemplate, templates])

  return (
    <div className="mb-2 space-y-1">
      <label className="block text-xs font-medium text-slate-600">
        Automation default template
      </label>
      <select
        className="input text-sm text-black"
        value={selectedKey}
        disabled={loading || !templates}
        onChange={(e) => {
          const key = e.target.value as AutomationTemplateKey | ''
          if (!key || !templates) return
          onSelectTemplate(templates[key])
        }}
      >
        <option value="">
          {loading ? 'Loading templates…' : 'Choose a template…'}
        </option>
        {AUTOMATION_TEMPLATE_OPTIONS.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
      {loadError ? (
        <p className="text-xs text-amber-700">Using built-in defaults — {loadError}</p>
      ) : (
        <p className="text-xs text-slate-500">
          From Admin → Settings → Automation templates. You can still edit the text below.
        </p>
      )}
    </div>
  )
}
