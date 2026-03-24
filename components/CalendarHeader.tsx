'use client'
import { useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { Person, CalendarState } from '@/types'
import { personColor } from '@/lib/colors'
import PersonSelector from './PersonSelector'

interface Props {
  state: CalendarState
  onStateChange: (s: CalendarState) => void
  people: Person[]
  onNewActivity: () => void
  onRefresh: () => void
  onColorSettings: () => void
  onShortcuts: () => void
}

export default function CalendarHeader({ state, onStateChange, people, onNewActivity, onRefresh, onColorSettings, onShortcuts }: Props) {
  const [selectorOpen, setSelectorOpen] = useState(false)

  function navigate(delta: number) {
    const d = addDays(parseISO(state.date), delta)
    onStateChange({ ...state, date: format(d, 'yyyy-MM-dd') })
  }

  return (
    <header className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border shrink-0 flex-wrap">
      {/* Title */}
      <span className="font-bold text-base mr-auto">
        herbe<span className="text-primary">.</span>calendar
      </span>

      {/* Date navigation */}
      <button onClick={() => navigate(-1)} className="text-text-muted px-2 py-1 rounded hover:bg-border" title="Previous (←)">‹</button>
      <span className="text-sm font-semibold whitespace-nowrap">
        {format(parseISO(state.date), 'd MMM yyyy')}
      </span>
      <button onClick={() => navigate(1)} className="text-text-muted px-2 py-1 rounded hover:bg-border" title="Next (→)">›</button>
      <button
        onClick={() => onStateChange({ ...state, date: format(new Date(), 'yyyy-MM-dd') })}
        className="text-text-muted px-2 py-1 rounded border border-border hover:bg-border text-xs font-bold"
        title="Go to today (⌃⌘T)"
      >
        Today
      </button>

      {/* View toggle */}
      <div className="flex rounded overflow-hidden border border-border text-xs font-bold">
        {(['day', '3day', '5day'] as const).map(v => (
          <button
            key={v}
            onClick={() => onStateChange({ ...state, view: v })}
            className={`px-3 py-1 ${state.view === v ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            {v === 'day' ? 'Day' : v === '3day' ? '3 Day' : '5 Day'}
          </button>
        ))}
      </div>

      {/* Person chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {state.selectedPersons.map((p, i) => (
          <button
            key={p.code}
            onClick={() => onStateChange({ ...state, selectedPersons: state.selectedPersons.filter(sp => sp.code !== p.code) })}
            className="px-2 py-0.5 rounded-full text-xs font-bold border cursor-pointer hover:opacity-70"
            style={{
              color: personColor(i),
              borderColor: personColor(i) + '44',
              background: personColor(i) + '22',
            }}
            title={`Remove ${p.code}`}
          >
            {p.code} <span className="opacity-50">✕</span>
          </button>
        ))}
        <button
          onClick={() => setSelectorOpen(true)}
          className="text-text-muted text-xl leading-none px-1"
          title="Add person"
        >+</button>
      </div>

      {/* Refresh */}
      <button
        onClick={onRefresh}
        className="text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm"
        title="Refresh"
      >
        ↻
      </button>

      {/* Keyboard shortcuts */}
      <button
        onClick={onShortcuts}
        className="text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm font-bold"
        title="Keyboard shortcuts (?)"
      >
        ?
      </button>

      {/* Color settings */}
      <button
        onClick={onColorSettings}
        className="text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm"
        title="Activity colors &amp; theme"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="13.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
          <circle cx="17.5" cy="10.5" r="1" fill="currentColor" stroke="none"/>
          <circle cx="8.5" cy="7.5" r="1" fill="currentColor" stroke="none"/>
          <circle cx="6.5" cy="12.5" r="1" fill="currentColor" stroke="none"/>
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
        </svg>
      </button>

      {/* New activity */}
      <button
        onClick={onNewActivity}
        className="bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-lg"
        title="New activity (⌃⌘N)"
      >
        + New
      </button>

      {selectorOpen && (
        <PersonSelector
          people={people}
          selected={state.selectedPersons}
          onClose={() => setSelectorOpen(false)}
          onChange={persons => {
            onStateChange({ ...state, selectedPersons: persons })
            setSelectorOpen(false)
          }}
        />
      )}
    </header>
  )
}
