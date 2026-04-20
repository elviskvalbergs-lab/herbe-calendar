'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { addDays, addMonths, subMonths, startOfMonth, startOfWeek, format, parseISO } from 'date-fns'
import { Person, CalendarState, CalendarSource } from '@/types'
import { signOut } from 'next-auth/react'
import { personColor } from '@/lib/colors'
import PersonSelector from './PersonSelector'
import FavoritesDropdown from './FavoritesDropdown'
import CalendarSourcesDropdown from './CalendarSourcesDropdown'
import MonthNavigator from './MonthNavigator'

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
  monthSelectedDay?: string
}

export default function CalendarHeader({ state, onStateChange, people, onNewActivity, onRefresh, onColorSettings, onShortcuts, calendarSources, hiddenCalendars, onToggleCalendar, onSetAllCalendars, calendarSourcesOpen, onCalendarSourcesOpenChange, onApplyFavorite, zoom, onToggleZoom, accountName, onAccountSwitch, isAdmin, userEmail, accountLogo, monthSelectedDay }: Props) {
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [hamburgerOpen, setHamburgerOpen] = useState(false)
  const hamburgerBtnRef = useRef<HTMLButtonElement>(null)
  const [hamburgerMenuPos, setHamburgerMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (!hamburgerOpen || !hamburgerBtnRef.current) return
    const rect = hamburgerBtnRef.current.getBoundingClientRect()
    const right = Math.max(8, window.innerWidth - rect.right)
    const top = rect.bottom + 4
    setHamburgerMenuPos({ top, right })
  }, [hamburgerOpen])
  const [mobileFavsOpen, setMobileFavsOpen] = useState(false)
  const [mobileCalendarsOpen, setMobileCalendarsOpen] = useState(false)
  const [monthNavOpen, setMonthNavOpen] = useState(false)

  const isMonth = state.view === 'month'
  const viewStep = isMonth ? 0 : state.view === '7day' ? 7 : state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1

  function navigate(days: number) {
    onStateChange({ ...state, date: format(addDays(parseISO(state.date), days), 'yyyy-MM-dd') })
  }

  function navigateMonth(dir: number) {
    const current = parseISO(state.date)
    const newDate = dir > 0 ? addMonths(current, 1) : subMonths(current, 1)
    onStateChange({ ...state, date: format(newDate, 'yyyy-MM-dd') })
  }

  return (
    <header className="topbar shrink-0">
      {/* Brand */}
      <div className="brand">
        <span className="brand-b">herbe<span style={{ color: 'var(--app-accent)' }}>.</span></span>
        <span style={{ fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--app-fg-subtle)', fontWeight: 500 }}>calendar</span>
      </div>
      {accountName && (
        <button
          onClick={onAccountSwitch}
          className="icon-btn hidden lg:inline-flex mr-auto"
          title={`${accountName} — Switch account (⌃⌘A)`}
          style={{ width: 26, height: 26, borderRadius: 3, overflow: 'hidden', background: 'rgba(205,76,56,0.15)', color: 'var(--app-accent)', fontSize: 10, fontWeight: 700 }}
        >
          {accountLogo
            ? <img src={accountLogo} alt={accountName} className="w-full h-full object-cover" />
            : accountName.charAt(0).toUpperCase()}
        </button>
      )}
      {!accountName && <span className="mr-auto" />}

      <div className="sep hidden lg:block" />

      {/* Date navigation group */}
      <div className="topbar-group">
        {(viewStep > 1 || isMonth) && (
          <button onClick={() => isMonth ? navigateMonth(-1) : navigate(-viewStep)} className="icon-btn" title={isMonth ? 'Previous month' : `Back ${viewStep} days`} aria-label={isMonth ? 'Previous month' : `Back ${viewStep} days`}>«</button>
        )}
        <button onClick={() => navigate(-1)} className="icon-btn" title="Previous day (←)" aria-label="Previous day">‹</button>
        <button
          onClick={() => setMonthNavOpen(true)}
          className="btn btn-ghost"
          title={isMonth ? 'Pick a month' : 'Pick a date'}
          style={{ fontWeight: 600 }}
        >
          {format(parseISO(state.date), 'd MMM yyyy')}
        </button>
        <button
          onClick={() => onStateChange({ ...state, date: format(new Date(), 'yyyy-MM-dd') })}
          className="btn btn-outline btn-sm hidden lg:inline-flex"
          title="Jump to today (T)"
        >Today</button>
        <button onClick={() => navigate(1)} className="icon-btn" title="Next day (→)" aria-label="Next day">›</button>
        {(viewStep > 1 || isMonth) && (
          <button onClick={() => isMonth ? navigateMonth(1) : navigate(viewStep)} className="icon-btn" title={isMonth ? 'Next month' : `Forward ${viewStep} days`} aria-label={isMonth ? 'Next month' : `Forward ${viewStep} days`}>»</button>
        )}
      </div>

      {/* View segmented control */}
      <div className="segmented">
        {([
          { view: 'day' as const, short: '1D', long: '1D' },
          { view: '3day' as const, short: '3D', long: '3D' },
          { view: '5day' as const, short: '5D', long: '5D' },
          { view: '7day' as const, short: '7D', long: '7D' },
          { view: 'month' as const, short: '', long: 'Month' },
        ]).map(({ view: v, short, long }) => {
          const active = state.view === v
          return (
            <button
              key={v}
              onClick={() => onStateChange({ ...state, view: v })}
              aria-pressed={active}
              title={v === 'month' ? 'Month view' : `${long} view`}
            >
              {v === 'month' ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block lg:hidden">
                    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="10" y1="4" x2="10" y2="10" />
                  </svg>
                  <span className="hidden lg:inline">{long}</span>
                </>
              ) : (
                <>
                  <span className="lg:hidden">{short}</span>
                  <span className="hidden lg:inline">{long}</span>
                </>
              )}
            </button>
          )
        })}
      </div>

      <div className="sep hidden lg:block" />

      {/* Person chips */}
      <div className="topbar-persons flex items-center gap-1 flex-wrap">
        {state.selectedPersons.map((p, i) => {
          const c = personColor(i)
          return (
            <span
              key={p.code}
              className="person-chip"
              style={{ ['--pcolor' as string]: c }}
              title={`${p.name}${p.email ? ` <${p.email}>` : ''}`}
            >
              <span className="p-dot" style={{ background: c }} />
              <span>{p.code}</span>
              <button
                className="x"
                onClick={() => onStateChange({ ...state, selectedPersons: state.selectedPersons.filter(sp => sp.code !== p.code) })}
                title="Remove"
                aria-label={`Remove ${p.code}`}
              >×</button>
            </span>
          )
        })}
        <button
          onClick={() => setSelectorOpen(true)}
          className="icon-btn"
          title="Add person"
          aria-label="Add person"
          style={{ fontSize: 16 }}
        >+</button>
        <span className="hidden lg:inline-flex">
          <FavoritesDropdown state={state} onApply={onApplyFavorite} hiddenCalendars={hiddenCalendars} />
        </span>
        <span className="hidden lg:inline-flex">
          <CalendarSourcesDropdown sources={calendarSources} hidden={hiddenCalendars} onToggle={onToggleCalendar} onSetAll={onSetAllCalendars} people={people} open={calendarSourcesOpen} onOpenChange={onCalendarSourcesOpenChange} />
        </span>
      </div>

      <div className="topbar-spacer" />

      {/* Admin — desktop only, admin/superadmin only */}
      {isAdmin && (
        <a href="/admin" className="icon-btn hidden lg:inline-flex" title="Admin panel" aria-label="Admin panel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </a>
      )}

      {/* Sign out — desktop only */}
      <button
        onClick={() => signOut()}
        className="icon-btn hidden lg:inline-flex"
        title="Sign out"
        aria-label="Sign out"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>

      {/* Hamburger — mobile only */}
      <div className="topbar-hamburger relative lg:hidden ml-auto">
        <button
          ref={hamburgerBtnRef}
          onClick={() => setHamburgerOpen(o => !o)}
          className="icon-btn"
          title="Menu"
          aria-label="Menu"
          aria-expanded={hamburgerOpen}
        >☰</button>
        {mounted && hamburgerOpen && createPortal(
          <>
            <div className="fixed inset-0" style={{ zIndex: 999 }} onClick={() => setHamburgerOpen(false)} />
            <div role="menu" style={{ position: 'fixed', top: hamburgerMenuPos.top, right: hamburgerMenuPos.right, zIndex: 1000 }} className="bg-surface border border-border rounded-xl shadow-xl py-1 min-w-[180px]">
              {userEmail && (
                <div className="px-4 py-2 border-b border-border mb-1">
                  <p className="text-[10px] text-text-muted truncate">{userEmail}</p>
                  {accountName && <p className="text-[10px] text-text-muted/60 truncate">{accountName}</p>}
                </div>
              )}
              <button
                role="menuitem"
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
                role="menuitem"
                onClick={() => { setHamburgerOpen(false); setMobileFavsOpen(true) }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-border flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                Favorites
              </button>
              <button
                role="menuitem"
                onClick={() => { setHamburgerOpen(false); onColorSettings() }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-border flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                  <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                Settings
              </button>
              <button
                role="menuitem"
                onClick={() => { setHamburgerOpen(false); onShortcuts() }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-border"
              >⌨️ Keyboard shortcuts</button>
              <button
                role="menuitem"
                onClick={() => { setHamburgerOpen(false); onRefresh() }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-border"
              >↻ Refresh</button>
              {accountName && onAccountSwitch && (
                <button
                  role="menuitem"
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
                  role="menuitem"
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
                role="menuitem"
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
          </>,
          document.body
        )}
      </div>

      {/* Zoom toggle — desktop only */}
      <button
        onClick={onToggleZoom}
        className="icon-btn hidden lg:inline-flex"
        title={zoom === 1 ? 'Zoom in (2x) — Z' : 'Zoom out (1x) — Z'}
        aria-label={zoom === 1 ? 'Zoom in' : 'Zoom out'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          {zoom === 1
            ? <><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></>
            : <line x1="8" y1="11" x2="14" y2="11"/>}
        </svg>
      </button>

      {/* Refresh — desktop only */}
      <button onClick={onRefresh} className="icon-btn hidden lg:inline-flex" title="Refresh" aria-label="Refresh">↻</button>

      {/* Keyboard shortcuts — desktop only */}
      <button onClick={onShortcuts} className="icon-btn hidden lg:inline-flex" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" style={{ fontWeight: 700 }}>?</button>

      {/* Help — desktop only */}
      <a
        href="/docs/getting-started"
        target="_blank"
        rel="noopener"
        className="icon-btn hidden lg:inline-flex"
        title="Help: Getting started"
        aria-label="Help"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </a>

      {/* Settings — desktop only */}
      <button onClick={onColorSettings} className="icon-btn hidden lg:inline-flex" title="Settings" aria-label="Settings">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>

      {/* New activity — hidden on mobile (FAB is used instead) */}
      <button
        onClick={onNewActivity}
        className="btn btn-primary hidden lg:inline-flex"
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
          <div className="w-full max-w-md bg-surface border-t border-border rounded-t-2xl shadow-2xl p-4 pb-8 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="font-bold text-sm">Calendars</h3>
              <button onClick={() => setMobileCalendarsOpen(false)} className="text-text-muted text-lg">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              <CalendarSourcesDropdown sources={calendarSources} hidden={hiddenCalendars} onToggle={onToggleCalendar} onSetAll={onSetAllCalendars} people={people} inline />
            </div>
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
      <MonthNavigator
        open={monthNavOpen}
        currentDate={state.date}
        currentView={state.view}
        persons={state.selectedPersons.map(p => p.code)}
        onSelectDate={(date) => {
          onStateChange({ ...state, date })
          setMonthNavOpen(false)
        }}
        onSelectWeek={(monday) => {
          onStateChange({ ...state, view: '7day', date: monday })
          setMonthNavOpen(false)
        }}
        onClose={() => setMonthNavOpen(false)}
      />
    </header>
  )
}
