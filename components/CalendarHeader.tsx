'use client'
import { useState, useRef } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { Person, CalendarState, CalendarSource } from '@/types'
import { signOut } from 'next-auth/react'
import { personColor } from '@/lib/colors'
import PersonSelector from './PersonSelector'
import FavoritesDropdown from './FavoritesDropdown'
import CalendarSourcesDropdown from './CalendarSourcesDropdown'

interface Props {
  state: CalendarState
  onStateChange: (s: CalendarState) => void
  people: Person[]
  onNewActivity: () => void
  onRefresh: () => void
  onColorSettings: () => void
  onShortcuts: () => void
  calendarSources: CalendarSource[]
  hiddenCalendars: Set<string>
  onToggleCalendar: (id: string) => void
  onSetAllCalendars: (show: boolean) => void
  calendarSourcesOpen: boolean
  onCalendarSourcesOpenChange: (open: boolean) => void
  onApplyFavorite: (view: CalendarState['view'], personCodes: string[], hiddenCalendars?: string[]) => void
  zoom: 1 | 2
  onToggleZoom: () => void
  accountName?: string
  onAccountSwitch?: () => void
  isAdmin?: boolean
  userEmail?: string
  accountLogo?: string
}

export default function CalendarHeader({ state, onStateChange, people, onNewActivity, onRefresh, onColorSettings, onShortcuts, calendarSources, hiddenCalendars, onToggleCalendar, onSetAllCalendars, calendarSourcesOpen, onCalendarSourcesOpenChange, onApplyFavorite, zoom, onToggleZoom, accountName, onAccountSwitch, isAdmin, userEmail, accountLogo }: Props) {
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [hamburgerOpen, setHamburgerOpen] = useState(false)
  const [mobileFavsOpen, setMobileFavsOpen] = useState(false)
  const [mobileCalendarsOpen, setMobileCalendarsOpen] = useState(false)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const viewStep = state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1

  function navigate(days: number) {
    onStateChange({ ...state, date: format(addDays(parseISO(state.date), days), 'yyyy-MM-dd') })
  }

  return (
    <header className="flex items-center gap-1 lg:gap-2 px-2 lg:px-3 py-2 bg-surface border-b border-border shrink-0 flex-wrap">
      {/* Title */}
      <span className="font-bold text-base pr-0.5 lg:pr-1">
        herbe<span className="text-primary">.</span>calendar
      </span>
      {accountName && (
        <button
          onClick={onAccountSwitch}
          className="hidden lg:inline-flex items-center justify-center w-6 h-6 rounded-full overflow-hidden bg-primary/15 text-primary text-[10px] font-bold hover:bg-primary/25 mr-auto transition-colors"
          title={`${accountName} — Switch account (⌃⌘A)`}
        >
          {accountLogo
            ? <img src={accountLogo} alt={accountName} className="w-full h-full object-cover" />
            : accountName.charAt(0).toUpperCase()}
        </button>
      )}
      {!accountName && <span className="mr-auto" />}

      {/* Date navigation */}
      {viewStep > 1 && (
        <button onClick={() => navigate(-viewStep)} className="text-text-muted px-1.5 lg:px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold" title={`Back ${viewStep} days`}>«</button>
      )}
      <button onClick={() => navigate(-1)} className="text-text-muted px-1.5 lg:px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold" title="Previous day (←)">‹</button>
      <button
        onClick={() => dateInputRef.current?.showPicker()}
        className="text-text-muted px-1.5 lg:px-2 py-1 rounded border border-border hover:bg-border text-sm font-semibold whitespace-nowrap relative"
        title="Pick a date"
      >
        {format(parseISO(state.date), 'd MMM yyyy')}
        <input
          ref={dateInputRef}
          type="date"
          value={state.date}
          onChange={e => {
            if (e.target.value) onStateChange({ ...state, date: e.target.value })
          }}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer pointer-events-none"
          tabIndex={-1}
        />
      </button>
      <button onClick={() => navigate(1)} className="text-text-muted px-1.5 lg:px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold" title="Next day (→)">›</button>
      {viewStep > 1 && (
        <button onClick={() => navigate(viewStep)} className="text-text-muted px-1.5 lg:px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold" title={`Forward ${viewStep} days`}>»</button>
      )}
      <button
        onClick={() => onStateChange({ ...state, date: format(new Date(), 'yyyy-MM-dd') })}
        className="text-text-muted px-1.5 lg:px-2 py-1 rounded border border-border hover:bg-border text-xs font-bold"
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
            className={`px-2 lg:px-3 py-1 ${state.view === v ? 'bg-primary text-white' : 'text-text-muted'}`}
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
          <FavoritesDropdown state={state} onApply={onApplyFavorite} hiddenCalendars={hiddenCalendars} />
        </span>
        <span className="hidden lg:inline-flex">
          <CalendarSourcesDropdown sources={calendarSources} hidden={hiddenCalendars} onToggle={onToggleCalendar} onSetAll={onSetAllCalendars} people={people} open={calendarSourcesOpen} onOpenChange={onCalendarSourcesOpenChange} />
        </span>
      </div>

      {/* Admin — desktop only, admin/superadmin only */}
      {isAdmin && (
        <a
          href="/admin"
          className="hidden lg:flex items-center gap-1 text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm"
          title="Admin panel"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </a>
      )}

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
              {userEmail && (
                <div className="px-4 py-2 border-b border-border mb-1">
                  <p className="text-[10px] text-text-muted truncate">{userEmail}</p>
                  {accountName && <p className="text-[10px] text-text-muted/60 truncate">{accountName}</p>}
                </div>
              )}
              <button
                onClick={() => { setHamburgerOpen(false); setMobileCalendarsOpen(true) }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-border flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Calendars
              </button>
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
              {accountName && onAccountSwitch && (
                <button
                  onClick={() => { setHamburgerOpen(false); onAccountSwitch() }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-border flex items-center gap-2"
                >
                  <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center shrink-0 overflow-hidden">
                    {accountLogo
                      ? <img src={accountLogo} alt="" className="w-full h-full object-cover" />
                      : accountName.charAt(0).toUpperCase()}
                  </span>
                  {accountName}
                </button>
              )}
              {isAdmin && (
                <a
                  href="/admin"
                  onClick={() => setHamburgerOpen(false)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-border flex items-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  Admin
                </a>
              )}
              <button
                onClick={() => { setHamburgerOpen(false); signOut() }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-border flex items-center gap-1.5 border-t border-border"
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
            <FavoritesDropdown state={state} onApply={(view, codes) => { setMobileFavsOpen(false); onApplyFavorite(view, codes) }} hiddenCalendars={hiddenCalendars} inline />
          </div>
        </div>
      )}

      {mobileCalendarsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 lg:hidden" onClick={() => setMobileCalendarsOpen(false)}>
          <div className="w-full max-w-md bg-surface border-t border-border rounded-t-2xl shadow-2xl p-4 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">Calendars</h3>
              <button onClick={() => setMobileCalendarsOpen(false)} className="text-text-muted text-lg">✕</button>
            </div>
            <CalendarSourcesDropdown sources={calendarSources} hidden={hiddenCalendars} onToggle={onToggleCalendar} onSetAll={onSetAllCalendars} people={people} inline />
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
