'use client'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Destination, DestinationMode } from '@/lib/destinations/types'

// Module-level cache so reopening the form within the same session is instant.
// /api/destinations fans out to Microsoft Graph + Google Tasks per request, so
// a fresh fetch on every open is visibly slow. 60s is long enough to span the
// usual "create / cancel / create again" flow but short enough that a list
// added in another tab shows up on the next open.
//
// Keyed by `${accountId}:${mode}` so an account switch (Ctrl+Cmd+A) doesn't
// serve the previous tenant's destinations to the new tenant — that was a real
// data-leak bug pre-fix.
const CACHE_TTL_MS = 60_000
type CacheKey = string
const cache = new Map<CacheKey, { ts: number; list: Destination[] }>()
function cacheKey(accountId: string | undefined, mode: DestinationMode): CacheKey {
  return `${accountId ?? '_'}:${mode}`
}

/** Test-only: drop the in-memory cache so fixtures don't bleed across cases. */
export function __resetDestinationsCacheForTests(): void {
  cache.clear()
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ok'; list: Destination[] }
  | { kind: 'unauthorized' }
  | { kind: 'error' }

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
  /** Edit-mode hint: when `value` is the empty string (synthetic edit destination
   *  with an unknown list id), the picker matches by `label === editLabelHint`
   *  and fires onChange so the parent learns the real key. */
  editLabelHint?: string
  /** Active tenant id. When it changes, the cache serves a different bucket so
   *  data from one tenant never leaks to another. Optional: callers that don't
   *  pass it share an "_" bucket (older behavior). */
  accountId?: string
  onChange: (dest: Destination) => void
}

const SOURCE_ORDER: Record<string, number> = { ERP: 0, Outlook: 1, Google: 2 }

export function DestinationPicker({
  mode, value, initialKey, filter, label, placeholder, editLabelHint, accountId, onChange,
}: Props) {
  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'loading' })
  const [retryNonce, setRetryNonce] = useState(0)
  const labelText = label ?? 'Destination'

  // Effect 1: fetch destinations for (mode, accountId). Pure data-loading;
  // independent of value/initialKey/onChange so identity changes from the
  // parent don't restart the network call.
  useEffect(() => {
    let cancelled = false

    const ck = cacheKey(accountId, mode)
    const cached = cache.get(ck)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setFetchState({ kind: 'ok', list: cached.list })
      return () => { cancelled = true }
    }

    setFetchState({ kind: 'loading' })
    fetch(`/api/destinations?mode=${mode}`)
      .then(async r => {
        if (cancelled) return
        if (r.status === 401) { setFetchState({ kind: 'unauthorized' }); return }
        if (!r.ok) { setFetchState({ kind: 'error' }); return }
        const list = await r.json() as Destination[]
        if (cancelled) return
        // Cache only on 200 — never let a failed call poison the cache.
        cache.set(ck, { ts: Date.now(), list })
        setFetchState({ kind: 'ok', list })
      })
      .catch(() => { if (!cancelled) setFetchState({ kind: 'error' }) })

    return () => { cancelled = true }
  }, [mode, accountId, retryNonce])

  // Filtered list derived from fetch state + filter prop. Memoized so the
  // auto-fire effect doesn't re-run on every render.
  const filtered = useMemo<Destination[] | null>(() => {
    if (fetchState.kind !== 'ok') return null
    return filter ? fetchState.list.filter(filter) : fetchState.list
  }, [fetchState, filter])

  // Effect 2: one-shot auto-fire that picks an initial destination once the
  // list is available. Reset on mode change so a swap re-arms it.
  const fired = useRef(false)
  useEffect(() => { fired.current = false }, [mode])

  useEffect(() => {
    if (!filtered || placeholder || fired.current || filtered.length === 0) return
    const hasRealMatch = !!value && filtered.some(d => d.key === value)
    if (hasRealMatch) return
    if (editLabelHint) {
      // Edit-mode synthetic destination (empty or stale key) — recover by
      // matching on the user-visible label so the dropdown shows the actual list.
      const matched = filtered.find(d => d.label === editLabelHint)
      if (matched) {
        fired.current = true
        onChange(matched)
        return
      }
      // editLabelHint set but no match in the current list — fall through to
      // first/initialKey so the form still shows a usable selection.
    }
    if (value === null || value === '') {
      // No selection yet — pick initialKey if it's still present, else first.
      fired.current = true
      const preferred = initialKey ? filtered.find(d => d.key === initialKey) : undefined
      onChange(preferred ?? filtered[0])
    }
    // initialKey, value, editLabelHint, onChange intentionally excluded:
    // - onChange identity changes per render in the parent — we'd loop.
    // - We only want to fire once per (mode, filtered list) pair; subsequent
    //   value updates from the parent are user-driven and shouldn't refire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, placeholder])

  const grouped = useMemo(() => {
    if (!filtered) return []
    const by = new Map<string, Destination[]>()
    for (const d of filtered) {
      const bucket = by.get(d.sourceLabel) ?? []
      bucket.push(d)
      by.set(d.sourceLabel, bucket)
    }
    return [...by.entries()]
      .sort((a, b) => (SOURCE_ORDER[a[0]] ?? 99) - (SOURCE_ORDER[b[0]] ?? 99))
      .map(([groupLabel, items]) => [groupLabel, items.slice().sort((x, y) => x.label.localeCompare(y.label))] as const)
  }, [filtered])

  const labelId = useId()

  if (fetchState.kind === 'loading') {
    return (
      <div className="destination-picker">
        <label className="aed-label" id={labelId}>{labelText}</label>
        <div className="select-field aed-input destination-picker-loading" aria-busy="true">Loading destinations…</div>
      </div>
    )
  }

  if (fetchState.kind === 'unauthorized') {
    return (
      <div className="destination-picker">
        <label className="aed-label" id={labelId}>{labelText}</label>
        <div className="select-field aed-input destination-picker-error" role="alert">
          Session expired — please <a href="/api/auth/signin">sign in again</a>.
        </div>
      </div>
    )
  }

  if (fetchState.kind === 'error') {
    return (
      <div className="destination-picker">
        <label className="aed-label" id={labelId}>{labelText}</label>
        <div className="select-field aed-input destination-picker-error" role="alert">
          Couldn’t load destinations.{' '}
          <button type="button" className="destination-retry" onClick={() => setRetryNonce(n => n + 1)}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  // fetchState.kind === 'ok' from here on; filtered is non-null.
  if (filtered && filtered.length === 0) {
    return (
      <div className="destination-picker">
        <label className="aed-label" id={labelId}>{labelText}</label>
        <div className="select-field aed-input destination-picker-empty" aria-disabled="true">
          No destinations configured
        </div>
      </div>
    )
  }

  return <DestinationDropdown
    labelId={labelId}
    label={labelText}
    placeholder={placeholder}
    value={value}
    grouped={grouped}
    destinations={filtered ?? []}
    onChange={onChange}
  />
}

function DestinationDropdown({
  labelId, label, placeholder, value, grouped, destinations, onChange,
}: {
  labelId: string
  label: string
  placeholder?: string
  value: string | null
  grouped: ReadonlyArray<readonly [string, Destination[]]>
  destinations: Destination[]
  onChange: (dest: Destination) => void
}) {
  const [open, setOpen] = useState(false)
  // Active descendant index into the flat (visually-sorted) list. -1 = none.
  const [activeIdx, setActiveIdx] = useState<number>(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxId = useId()
  const optionIdPrefix = useId()

  // Flat list in the same visual order as `grouped`, so keyboard nav matches.
  const flat = useMemo<Destination[]>(() => grouped.flatMap(([, items]) => items), [grouped])
  const current = value ? destinations.find(d => d.key === value) ?? null : null
  const optionId = (i: number) => `${optionIdPrefix}-opt-${i}`
  const activeId = activeIdx >= 0 && activeIdx < flat.length ? optionId(activeIdx) : undefined

  const focusTrigger = useCallback(() => {
    // Defer to next tick so the click that closed the menu doesn't refocus body.
    queueMicrotask(() => triggerRef.current?.focus())
  }, [])

  const closeAndFocus = useCallback(() => {
    setOpen(false)
    focusTrigger()
  }, [focusTrigger])

  const select = useCallback((dest: Destination) => {
    onChange(dest)
    setOpen(false)
    focusTrigger()
  }, [onChange, focusTrigger])

  // Click-outside closes the menu. Escape is handled in onKeyDown.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Sync activeIdx with `value` whenever the menu opens, so keyboard navigation
  // starts from the currently-selected option (or 0 if no selection).
  useEffect(() => {
    if (!open) return
    const idx = current ? flat.findIndex(d => d.key === current.key) : -1
    setActiveIdx(idx >= 0 ? idx : 0)
  }, [open, current, flat])

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape') {
      if (open) { e.preventDefault(); closeAndFocus() }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setActiveIdx(i => Math.min(flat.length - 1, (i < 0 ? 0 : i + 1)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setActiveIdx(i => Math.max(0, (i < 0 ? 0 : i - 1)))
      return
    }
    if (e.key === 'Home') {
      if (open) { e.preventDefault(); setActiveIdx(0) }
      return
    }
    if (e.key === 'End') {
      if (open) { e.preventDefault(); setActiveIdx(flat.length - 1) }
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (!open) { e.preventDefault(); setOpen(true); return }
      if (activeIdx >= 0 && activeIdx < flat.length) {
        e.preventDefault()
        select(flat[activeIdx])
      }
      return
    }
  }

  return (
    <div className="destination-picker" ref={wrapRef}>
      <label className="aed-label" id={labelId}>{label}</label>
      <div className="destination-picker-row destination-trigger-row">
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-labelledby={labelId}
          aria-activedescendant={open ? activeId : undefined}
          data-value={value ?? ''}
          className="select-field aed-input destination-trigger"
          onClick={() => setOpen(o => !o)}
          onKeyDown={onKeyDown}
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
          <ul
            id={listboxId}
            className="destination-menu"
            role="listbox"
            aria-labelledby={labelId}
          >
            {grouped.map(([groupLabel, items]) => (
              <li key={groupLabel} className="destination-group" role="presentation">
                <div className="destination-group-label" role="presentation">{groupLabel}</div>
                <ul role="presentation">
                  {items.map(d => {
                    const i = flat.indexOf(d)
                    const isActive = i === activeIdx
                    return (
                      <li
                        key={d.key || `${d.source}:${d.label}`}
                        id={optionId(i)}
                        role="option"
                        aria-selected={d.key === value}
                        className={
                          'destination-option'
                          + (d.key === value ? ' is-selected' : '')
                          + (isActive ? ' is-active' : '')
                        }
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={() => select(d)}
                      >
                        <span className="destination-color-dot" style={{ background: d.color }} aria-hidden="true" />
                        <span>{d.sourceLabel} · {d.label}</span>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
