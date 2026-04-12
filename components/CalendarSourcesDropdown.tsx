'use client'
import { useEffect } from 'react'
import type { CalendarSource, Person } from '@/types'

interface Props {
  sources: CalendarSource[]
  hidden: Set<string>
  onToggle: (id: string) => void
  onSetAll: (show: boolean) => void
  people?: Person[]
  /** Controlled open state (desktop). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Render as flat list (no dropdown wrapper). Used inside mobile bottom sheet. */
  inline?: boolean
}

export default function CalendarSourcesDropdown({ sources, hidden, onToggle, onSetAll, people, open, onOpenChange, inline }: Props) {
  const visibleCount = sources.filter(s => !hidden.has(s.id)).length
  const totalCount = sources.length
  const allVisible = visibleCount === totalCount
  const allHidden = visibleCount === 0

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange?.(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  // Split sources into global (herbe/outlook), grouped Google, and per-person ICS groups
  const globalSources = sources.filter(s => !s.personCode && !s.group)
  // Group sources by their group field (e.g. per-user Google calendars)
  const groupedSources = sources.filter(s => s.group)
  const googleGroups = new Map<string, CalendarSource[]>()
  for (const src of groupedSources) {
    const list = googleGroups.get(src.group!) ?? []
    list.push(src)
    googleGroups.set(src.group!, list)
  }
  const personGroups: { code: string; name: string; sources: CalendarSource[] }[] = []
  const icsSourcesByPerson = new Map<string, CalendarSource[]>()
  for (const src of sources) {
    if (!src.personCode || src.group) continue  // skip grouped sources (shared calendars have their own group)
    let group = icsSourcesByPerson.get(src.personCode)
    if (!group) { group = []; icsSourcesByPerson.set(src.personCode, group) }
    group.push(src)
  }
  for (const [code, srcs] of icsSourcesByPerson) {
    const person = people?.find(p => p.code === code)
    personGroups.push({ code, name: person?.name ?? code, sources: srcs })
  }

  function renderRow(src: CalendarSource) {
    const isHidden = hidden.has(src.id)
    return (
      <button
        key={src.id}
        onClick={() => onToggle(src.id)}
        className={`w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-border flex items-center gap-2 ${isHidden ? 'opacity-50' : ''}`}
      >
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: src.color }}
        />
        <span className="truncate flex-1">{src.label}</span>
        {src.sharing && src.sharing !== 'private' && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${src.sharing === 'full' ? 'border-amber-500/30 text-amber-400' : src.sharing === 'titles' ? 'border-blue-500/30 text-blue-400' : 'border-green-500/30 text-green-400'}`}>
            {src.sharing === 'busy' ? 'Shared busy' : src.sharing === 'titles' ? 'Shared titles' : 'Shared fully'}
          </span>
        )}
        {isHidden ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-muted">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-muted">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </button>
    )
  }

  const list = (
    <div className="py-1">
      {/* Show All / Hide All */}
      <button
        onClick={() => onSetAll(allVisible ? false : true)}
        className="w-full text-left px-3 py-2 text-xs font-semibold text-primary hover:bg-border rounded-lg"
      >
        {allVisible ? 'Hide All' : allHidden ? 'Show All' : 'Show All'}
      </button>
      <div className="h-px bg-border my-1" />

      {/* Global sources (Herbe, Outlook) */}
      {globalSources.map(renderRow)}

      {/* Per-user Google calendar groups */}
      {[...googleGroups.entries()].map(([group, srcs]) => (
        <div key={group}>
          <div className="px-3 py-1 text-[10px] text-text-muted uppercase tracking-wide font-bold mt-1">{group}</div>
          {srcs.map(renderRow)}
        </div>
      ))}

      {/* Per-person ICS groups */}
      {personGroups.map(group => (
        <div key={group.code}>
          <div className="h-px bg-border my-1" />
          <div className="px-3 py-1 text-[10px] font-bold text-text-muted uppercase tracking-wider">
            {group.name}
          </div>
          {group.sources.map(renderRow)}
        </div>
      ))}
    </div>
  )

  if (inline) return list

  return (
    <div className="relative">
      <button
        onClick={() => onOpenChange?.(!open)}
        className="text-text-muted px-1.5 py-1 rounded-lg hover:bg-border text-sm leading-none flex items-center gap-1"
        title="Calendar sources (C)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={!allVisible ? 'text-primary' : ''}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span className={`text-[10px] font-bold tabular-nums ${!allVisible ? 'text-primary' : 'text-text-muted'}`}>
          {visibleCount}/{totalCount}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange?.(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-xl shadow-xl py-1 min-w-[200px] max-h-[70vh] overflow-y-auto">
            {list}
          </div>
        </>
      )}
    </div>
  )
}
