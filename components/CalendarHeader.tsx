'use client'
import { useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { Person, CalendarState } from '@/types'
import { signOut } from 'next-auth/react'
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
  const [hamburgerOpen, setHamburgerOpen] = useState(false)

  const viewStep = state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1

  function navigate(days: number) {
    onStateChange({ ...state, date: format(addDays(parseISO(state.date), days), 'yyyy-MM-dd') })
  }

  return (
    <header className="flex items-center gap-3 px-4 py-3 glass border-b border-border/50 sticky top-0 z-30 shrink-0 flex-wrap shadow-premium">
      {/* Title */}
      <span className="font-black text-lg mr-auto tracking-tighter">
        herbe<span className="text-primary italic">.</span>calendar
      </span>

      {/* Date navigation */}
      <div className="flex items-center gap-1 bg-black/10 p-1 rounded-xl border border-white/5">
        {viewStep > 1 && (
          <button onClick={() => navigate(-viewStep)} className="text-text-muted w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 hover:text-text transition-all font-bold text-xs" title={`Back ${viewStep} days`}>«</button>
        )}
        <button onClick={() => navigate(-1)} className="text-text-muted w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 hover:text-text transition-all font-bold text-base" title="Previous day (←)">‹</button>
        <div className="px-3 min-w-[120px] text-center">
          <span className="text-sm font-black tracking-tight uppercase">
            {format(parseISO(state.date), 'd MMM yyyy')}
          </span>
        </div>
        <button onClick={() => navigate(1)} className="text-text-muted w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 hover:text-text transition-all font-bold text-base" title="Next day (→)">›</button>
        {viewStep > 1 && (
          <button onClick={() => navigate(viewStep)} className="text-text-muted w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 hover:text-text transition-all font-bold text-xs" title={`Forward ${viewStep} days`}>»</button>
        )}
      </div>

      <button
        onClick={() => onStateChange({ ...state, date: format(new Date(), 'yyyy-MM-dd') })}
        className="text-[10px] uppercase font-black tracking-widest text-text-muted px-3 py-2 rounded-xl border border-border hover:bg-white/5 hover:text-text transition-all"
        title="Go to today (⌃⌘T)"
      >
        Today
      </button>

      {/* View toggle */}
      <div className="flex bg-black/20 p-1 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest">
        {(['day', '3day', '5day'] as const).map(v => (
          <button
            key={v}
            onClick={() => onStateChange({ ...state, view: v })}
            className={`px-3 py-1.5 rounded-lg transition-all ${state.view === v ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-text-muted hover:text-text'}`}
          >
            {v === 'day' ? 'Day' : v === '3day' ? '3d' : '5d'}
          </button>
        ))}
      </div>

      {/* Person chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {state.selectedPersons.map((p, i) => (
          <button
            key={p.code}
            onClick={() => onStateChange({ ...state, selectedPersons: state.selectedPersons.filter(sp => sp.code !== p.code) })}
            className="px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wider border shadow-sm transition-all hover:scale-105 active:scale-95"
            style={{
              color: personColor(i),
              borderColor: personColor(i) + '22',
              background: personColor(i) + '11',
              boxShadow: `0 4px 12px -2px ${personColor(i)}22`
            }}
            title={`${p.name}${p.email ? ` <${p.email}>` : ''} (Click to remove)`}
          >
            {p.code} <span className="ml-1 opacity-40">✕</span>
          </button>
        ))}
        <button
          onClick={() => setSelectorOpen(true)}
          className="w-7 h-7 flex items-center justify-center text-text-muted bg-white/5 border border-white/5 rounded-full hover:bg-white/10 hover:text-text transition-all text-lg leading-none"
          title="Add person"
        >+</button>
      </div>

      <div className="flex-1 lg:hidden" />

      {/* Control Buttons */}
      <div className="flex items-center gap-1">
        {/* Refresh */}
        <button
          onClick={onRefresh}
          className="p-2 text-text-muted hover:text-text transition-all rounded-xl hover:bg-white/5 hidden lg:block"
          title="Refresh"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>

        {/* Shortcuts */}
        <button
          onClick={onShortcuts}
          className="p-2 text-text-muted hover:text-text transition-all rounded-xl hover:bg-white/5 hidden lg:block font-black text-sm"
          title="Keyboard shortcuts (?)"
        >?</button>

        {/* Settings (Palette) */}
        <button
          onClick={onColorSettings}
          className="p-2 text-text-muted hover:text-text transition-all rounded-xl hover:bg-white/5"
          title="Settings (Colors & Calendars)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        {/* Sign out */}
        <button
          onClick={() => signOut()}
          className="p-2 text-text-muted hover:text-red-400 transition-all rounded-xl hover:bg-white/5 hidden lg:block"
          title="Sign out"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>

        <div className="w-px h-6 bg-white/10 mx-1 hidden lg:block" />

        {/* New activity — hidden on mobile */}
        <button
          onClick={onNewActivity}
          className="hidden lg:flex bg-primary text-white text-[10px] uppercase font-black tracking-widest px-4 py-2.5 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-105 active:scale-95 transition-all"
          title="New activity (⌃⌘N)"
        >
          + Activity
        </button>

        {/* Hamburger — mobile only */}
        <div className="relative lg:hidden">
          <button
            onClick={() => setHamburgerOpen(o => !o)}
            className="p-2 text-text-muted hover:text-text transition-all rounded-xl hover:bg-white/5"
            title="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          {hamburgerOpen && (
            <>
              <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setHamburgerOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 glass shadow-premium rounded-2xl py-2 min-w-[200px] border border-white/10 animate-fade-in overflow-hidden">
                <button onClick={() => { setHamburgerOpen(false); onRefresh() }} className="w-full text-left px-4 py-3 text-xs font-bold hover:bg-white/5 flex items-center gap-3">↻ Refresh</button>
                <button onClick={() => { setHamburgerOpen(false); onShortcuts() }} className="w-full text-left px-4 py-3 text-xs font-bold hover:bg-white/5 flex items-center gap-3">⌨️ Shortcuts</button>
                <div className="h-px bg-white/5 my-1" />
                <button onClick={() => { setHamburgerOpen(false); signOut() }} className="w-full text-left px-4 py-3 text-xs font-bold hover:bg-red-400/10 text-red-400 flex items-center gap-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

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
