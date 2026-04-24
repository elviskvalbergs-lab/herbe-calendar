'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Destination, DestinationMode } from '@/lib/destinations/types'

interface Props {
  mode: DestinationMode
  value: string | null
  initialKey?: string | null
  /** Optional predicate to restrict the dropdown to a subset of destinations — e.g. only Outlook task lists for an in-place list move. */
  filter?: (d: Destination) => boolean
  /** Optional override for the label above the select. */
  label?: string
  /** Placeholder option shown when `value` is null. If omitted, auto-fires onChange on load. */
  placeholder?: string
  onChange: (dest: Destination) => void
}

const SOURCE_ORDER: Record<string, number> = { ERP: 0, Outlook: 1, Google: 2 }

export function DestinationPicker({ mode, value, initialKey, filter, label, placeholder, onChange }: Props) {
  const [destinations, setDestinations] = useState<Destination[] | null>(null)
  const fired = useRef(false)
  const labelText = label ?? 'Destination'

  // Auto-fire is a one-shot initializer: the parent reads value/initialKey/onChange
  // only at mount (or on an explicit mode swap), not on every render. Deps are
  // intentionally narrow — if the mode prop changes we reset the fired flag so a
  // new destination can be auto-selected for the new mode's list. Auto-fire is
  // suppressed when a placeholder is supplied so the picker starts unselected.
  useEffect(() => {
    fired.current = false
    let cancelled = false
    fetch(`/api/destinations?mode=${mode}`)
      .then(r => r.ok ? r.json() : [])
      .then((list: Destination[]) => {
        if (cancelled) return
        const filtered = filter ? list.filter(filter) : list
        setDestinations(filtered)
        if (!placeholder && !fired.current && filtered.length > 0 && value === null) {
          fired.current = true
          const preferred = initialKey ? filtered.find(d => d.key === initialKey) : undefined
          onChange(preferred ?? filtered[0])
        }
      })
      .catch(() => { if (!cancelled) setDestinations([]) })
    return () => { cancelled = true }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    const by = new Map<string, Destination[]>()
    for (const d of destinations ?? []) {
      const bucket = by.get(d.sourceLabel) ?? []
      bucket.push(d)
      by.set(d.sourceLabel, bucket)
    }
    return [...by.entries()]
      .sort((a, b) => (SOURCE_ORDER[a[0]] ?? 99) - (SOURCE_ORDER[b[0]] ?? 99))
      .map(([label, items]) => [label, items.slice().sort((x, y) => x.label.localeCompare(y.label))] as const)
  }, [destinations])

  if (destinations === null) {
    return (
      <div className="destination-picker">
        <label className="aed-label">{labelText}</label>
        <div className="select-field aed-input destination-picker-loading">Loading destinations…</div>
      </div>
    )
  }

  if (destinations.length === 0) {
    return (
      <div className="destination-picker">
        <label className="aed-label">{labelText}</label>
        <select className="select-field aed-input" disabled value="">
          <option value="">No destinations configured</option>
        </select>
      </div>
    )
  }

  const currentColor = destinations.find(d => d.key === value)?.color

  return (
    <div className="destination-picker">
      <label className="aed-label">{labelText}</label>
      <div className="destination-picker-row">
        {currentColor && (
          <span className="destination-color-dot" style={{ background: currentColor }} aria-hidden="true" />
        )}
        <select
          className="select-field aed-input"
          value={value ?? ''}
          onChange={e => {
            if (!e.target.value) return
            const dest = (destinations ?? []).find(d => d.key === e.target.value)
            if (dest) onChange(dest)
          }}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {grouped.map(([label, items]) => (
            <optgroup key={label} label={label}>
              {items.map(d => (
                <option key={d.key} value={d.key}>
                  {d.sourceLabel} · {d.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  )
}
