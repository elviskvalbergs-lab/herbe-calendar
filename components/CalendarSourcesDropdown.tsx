'use client'
import { useState } from 'react'
import type { CalendarSource } from '@/types'

interface Props {
  sources: CalendarSource[]
  hidden: Set<string>
  onToggle: (id: string) => void
  /** Render as flat list (no dropdown wrapper). Used inside mobile bottom sheet. */
  inline?: boolean
}

export default function CalendarSourcesDropdown({ sources, hidden, onToggle, inline }: Props) {
  const [open, setOpen] = useState(false)
  const anyHidden = sources.some(s => hidden.has(s.id))

  const list = (
    <div className="py-1">
      {sources.map(src => {
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
      })}
    </div>
  )

  if (inline) return list

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-text-muted px-1.5 py-1 rounded-lg hover:bg-border text-base leading-none"
        title="Calendar sources"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={anyHidden ? 'text-primary' : ''}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-xl shadow-xl py-1 min-w-[200px]">
            {list}
          </div>
        </>
      )}
    </div>
  )
}
