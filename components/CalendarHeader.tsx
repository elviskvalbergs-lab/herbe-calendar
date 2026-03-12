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
}

export default function CalendarHeader({ state, onStateChange, people, onNewActivity }: Props) {
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
      <button onClick={() => navigate(-1)} className="text-text-muted px-2 py-1 rounded hover:bg-border">‹</button>
      <span className="text-sm font-semibold whitespace-nowrap">
        {format(parseISO(state.date), 'd MMM yyyy')}
      </span>
      <button onClick={() => navigate(1)} className="text-text-muted px-2 py-1 rounded hover:bg-border">›</button>

      {/* View toggle */}
      <div className="flex rounded overflow-hidden border border-border text-xs font-bold">
        {(['day', '3day'] as const).map(v => (
          <button
            key={v}
            onClick={() => onStateChange({ ...state, view: v })}
            className={`px-3 py-1 ${state.view === v ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            {v === 'day' ? 'Day' : '3 Day'}
          </button>
        ))}
      </div>

      {/* Person chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {state.selectedPersons.map((p, i) => (
          <span
            key={p.code}
            className="px-2 py-0.5 rounded-full text-xs font-bold border"
            style={{
              color: personColor(i),
              borderColor: personColor(i) + '44',
              background: personColor(i) + '22',
            }}
          >
            {p.code}
          </span>
        ))}
        <button
          onClick={() => setSelectorOpen(true)}
          className="text-text-muted text-xl leading-none px-1"
          title="Add person"
        >+</button>
      </div>

      {/* New activity */}
      <button
        onClick={onNewActivity}
        className="bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-lg"
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
