'use client'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { Destination, DestinationMode } from '@/lib/destinations/types'

// Module-level cache so reopening the form within the same session is instant.
// /api/destinations fans out to Microsoft Graph + Google Tasks per request, so
// a fresh fetch on every open is visibly slow. 60s is long enough to span the
// usual "create / cancel / create again" flow but short enough that a list
// added in another tab shows up on the next open.
const CACHE_TTL_MS = 60_000
const cache = new Map<DestinationMode, { ts: number; list: Destination[] }>()

/** Test-only: drop the in-memory cache so fixtures don't bleed across cases. */
export function __resetDestinationsCacheForTests(): void {
  cache.clear()
}

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
  /** Edit-mode hint: when `value` is a synthesized key (e.g. "outlook:__edit__") that won't match any real destination, the picker matches by `label === editLabelHint` instead and fires onChange so the parent learns the real key. */
  editLabelHint?: string
  onChange: (dest: Destination) => void
}

const SOURCE_ORDER: Record<string, number> = { ERP: 0, Outlook: 1, Google: 2 }

export function DestinationPicker({ mode, value, initialKey, filter, label, placeholder, editLabelHint, onChange }: Props) {
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

    const apply = (list: Destination[]) => {
      if (cancelled) return
      const filtered = filter ? list.filter(filter) : list
      setDestinations(filtered)
      if (!placeholder && !fired.current && filtered.length > 0) {
        if (value === null) {
          fired.current = true
          const preferred = initialKey ? filtered.find(d => d.key === initialKey) : undefined
          onChange(preferred ?? filtered[0])
        } else if (editLabelHint && !filtered.some(d => d.key === value)) {
          // Edit-mode synthesized key didn't match any real destination —
          // recover by matching the user-visible label (the original list's
          // name) so the dropdown shows the task's actual list selected.
          const matched = filtered.find(d => d.label === editLabelHint)
          if (matched) {
            fired.current = true
            onChange(matched)
          }
        }
      }
    }

    const cached = cache.get(mode)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      apply(cached.list)
      return () => { cancelled = true }
    }

    fetch(`/api/destinations?mode=${mode}`)
      .then(r => r.ok ? r.json() : [])
      .then((list: Destination[]) => {
        cache.set(mode, { ts: Date.now(), list })
        apply(list)
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

  return <DestinationDropdown
    label={labelText}
    placeholder={placeholder}
    value={value}
    grouped={grouped}
    destinations={destinations}
    onChange={onChange}
  />
}

function DestinationDropdown({
  label, placeholder, value, grouped, destinations, onChange,
}: {
  label: string
  placeholder?: string
  value: string | null
  grouped: ReadonlyArray<readonly [string, Destination[]]>
  destinations: Destination[]
  onChange: (dest: Destination) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const current = value ? destinations.find(d => d.key === value) ?? null : null

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="destination-picker" ref={wrapRef}>
      <label className="aed-label">{label}</label>
      <div className="destination-picker-row destination-trigger-row">
        <button
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          data-value={value ?? ''}
          className="select-field aed-input destination-trigger"
          onClick={() => setOpen(o => !o)}
        >
          {current ? (
            <>
              <span className="destination-color-dot" style={{ background: current.color }} aria-hidden="true" />
              <span className="destination-trigger-label">{current.sourceLabel} · {current.label}</span>
            </>
          ) : (
            <span className="destination-trigger-label destination-trigger-placeholder">{placeholder ?? 'Select…'}</span>
          )}
          <span className="destination-trigger-chev" aria-hidden="true">▾</span>
        </button>
        {open && (
          <ul className="destination-menu" role="listbox">
            {grouped.map(([groupLabel, items]) => (
              <li key={groupLabel} className="destination-group">
                <div className="destination-group-label">{groupLabel}</div>
                <ul>
                  {items.map(d => (
                    <li
                      key={d.key}
                      role="option"
                      aria-selected={d.key === value}
                      className={`destination-option${d.key === value ? ' is-selected' : ''}`}
                      onClick={() => { onChange(d); setOpen(false) }}
                    >
                      <span className="destination-color-dot" style={{ background: d.color }} aria-hidden="true" />
                      <span>{d.sourceLabel} · {d.label}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
