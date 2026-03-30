'use client'
import { useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { Person, CalendarState } from '@/types'
import { signOut } from 'next-auth/react'
import { personColor } from '@/lib/colors'
import PersonSelector from './PersonSelector'
import FavoritesDropdown from './FavoritesDropdown'

interface Props {
  state: CalendarState
  onStateChange: (s: CalendarState) => void
  people: Person[]
  onNewActivity: () => void
  onRefresh: () => void
  onColorSettings: () => void
  onShortcuts: () => void
  onApplyFavorite: (view: CalendarState['view'], personCodes: string[]) => void
  zoom: 1 | 2
  onToggleZoom: () => void
}

export default function CalendarHeader({ state, onStateChange, people, onNewActivity, onRefresh, onColorSettings, onShortcuts, onApplyFavorite, zoom, onToggleZoom }: Props) {
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [hamburgerOpen, setHamburgerOpen] = useState(false)
  const [mobileFavsOpen, setMobileFavsOpen] = useState(false)

  const viewStep = state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1

  function navigate(days: number) {
    onStateChange({ ...state, date: format(addDays(parseISO(state.date), days), 'yyyy-MM-dd') })
  }

  return (
    <header className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border shrink-0 flex-wrap">
      {/* Title */}
      <span className="font-bold text-base mr-auto">
        herbe<span className="text-primary">.</span>calendar
      </span>

      {/* Date navigation */}
      {viewStep > 1 && (
        <button onClick={() => navigate(-viewStep)} className="text-text-muted px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold" title={`Back ${viewStep} days`}>«</button>
      )}
      <button onClick={() => navigate(-1)} className="text-text-muted px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold" title="Previous day (←)">‹</button>
      <span className="text-sm font-semibold whitespace-nowrap">
        {format(parseISO(state.date), 'd MMM yyyy')}
      </span>
      <button onClick={() => navigate(1)} className="text-text-muted px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold" title="Next day (→)">›</button>
      {viewStep > 1 && (
        <button onClick={() => navigate(viewStep)} className="text-text-muted px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold" title={`Forward ${viewStep} days`}>»</button>
      )}
      <button
        onClick={() => onStateChange({ ...state, date: format(new Date(), 'yyyy-MM-dd') })}
        className="text-text-muted px-2 py-1 rounded border border-border hover:bg-border text-xs font-bold"
        title="Go to today (⌃⌘T)"
      >
        Today
      </button>

      {/* View toggle */}
      <div className="flex rounded overflow-hidden border border-border text-xs font-bold divide-x divide-border">
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
            title={`${p.name}${p.email ? ` <${p.email}>` : ''} (Click to remove)`}
          >
            {p.code} <span className="opacity-50">✕</span>
          </button>
        ))}
        <button
          onClick={() => setSelectorOpen(true)}
          className="text-text-muted text-xl leading-none px-1"
          title="Add person"
        >+</button>
        <span className="hidden lg:inline-flex">
          <FavoritesDropdown state={state} onApply={onApplyFavorite} />
        </span>
      </div>

      {/* Sign out — desktop only (mobile: in hamburger menu) */}
      <button
        onClick={() => signOut()}
        className="hidden lg:block text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm"
        title="Sign out"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>

      {/* Hamburger — mobile only; ml-auto keeps it right-aligned even when wrapping to new line */}
      <div className="relative lg:hidden ml-auto">
        <button
          onClick={() => setHamburgerOpen(o => !o)}
          className="text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm"
          title="Menu"
        >☰</button>
        {hamburgerOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setHamburgerOpen(false)} />
            {/* right-0 ensures popup stays on screen regardless of where the hamburger is positioned */}
            <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-xl shadow-xl py-1 min-w-[180px]">
              <button
                onClick={() => { setHamburgerOpen(false); setMobileFavsOpen(true) }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-border flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                Favorites
              </button>
              <button
                onClick={() => { setHamburgerOpen(false); onColorSettings() }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-border flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                  <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                Settings
              </button>
              <button
                onClick={() => { setHamburgerOpen(false); onShortcuts() }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-border"
              >⌨️ Keyboard shortcuts</button>
              <button
                onClick={() => { setHamburgerOpen(false); onRefresh() }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-border"
              >↻ Refresh</button>
              <button
                onClick={() => { setHamburgerOpen(false); signOut() }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-border flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign out
              </button>
            </div>
          </>
        )}
      </div>

      {/* Zoom toggle — desktop only */}
      <button
        onClick={onToggleZoom}
        className="hidden lg:flex items-center gap-1 text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm"
        title={zoom === 1 ? 'Zoom in (2x) — Z' : 'Zoom out (1x) — Z'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          {zoom === 1
            ? <><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></>
            : <line x1="8" y1="11" x2="14" y2="11"/>}
        </svg>
      </button>

      {/* Refresh — desktop only */}
      <button
        onClick={onRefresh}
        className="hidden lg:block text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm"
        title="Refresh"
      >↻</button>

      {/* Keyboard shortcuts — desktop only */}
      <button
        onClick={onShortcuts}
        className="hidden lg:block text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm font-bold"
        title="Keyboard shortcuts (?)"
      >
        ?
      </button>

      {/* Settings — desktop only */}
      <button
        onClick={onColorSettings}
        className="hidden lg:block text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm"
        title="Settings"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>

      {/* New activity — hidden on mobile (FAB is used instead) */}
      <button
        onClick={onNewActivity}
        className="hidden lg:flex bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-lg"
        title="New activity (⌃⌘N)"
      >
        + New
      </button>

      {mobileFavsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 lg:hidden" onClick={() => setMobileFavsOpen(false)}>
          <div className="w-full max-w-md bg-surface border-t border-border rounded-t-2xl shadow-2xl p-4 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">Favorites</h3>
              <button onClick={() => setMobileFavsOpen(false)} className="text-text-muted text-lg">✕</button>
            </div>
            <FavoritesDropdown state={state} onApply={(view, codes) => { setMobileFavsOpen(false); onApplyFavorite(view, codes) }} inline />
          </div>
        </div>
      )}

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
