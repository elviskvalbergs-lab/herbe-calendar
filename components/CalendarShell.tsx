'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { Person, Activity, ActivityType, ActivityClassGroup, CalendarState } from '@/types'
import CalendarHeader from './CalendarHeader'
import CalendarGrid from './CalendarGrid'
import ActivityForm from './ActivityForm'
import SettingsModal from './SettingsModal'
import KeyboardShortcutsModal from './KeyboardShortcutsModal'
import {
  buildClassGroupColorMap, getActivityColor, loadColorOverrides,
} from '@/lib/activityColors'

interface Props { userCode: string; companyCode: string }

export default function CalendarShell({ userCode, companyCode }: Props) {
  const [people, setPeople] = useState<Person[]>([])
  const peopleLoadedRef = useRef(false)
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([])
  const [classGroups, setClassGroups] = useState<ActivityClassGroup[]>([])
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({})
  const [colorSettingsOpen, setColorSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [classGroupsError, setClassGroupsError] = useState<string | null>(null)
  const [state, setState] = useState<CalendarState>(() => {
    try {
      const saved = localStorage.getItem('calendarState')
      if (saved) {
        const { view, date } = JSON.parse(saved)
        if (view && date) return { view, date, selectedPersons: [] }
      }
    } catch {}
    return { view: 'day', date: format(new Date(), 'yyyy-MM-dd'), selectedPersons: [] }
  })
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ msg: string; ok?: boolean } | null>(null)
  const [allCustomers, setAllCustomers] = useState<{ Code: string; Name: string }[]>([])
  const [allProjects, setAllProjects] = useState<{ Code: string; Name: string; CUCode: string | null; CUName: string | null }[]>([])
  const [formState, setFormState] = useState<{
    open: boolean
    initial?: Partial<Activity>
    editId?: string
    canEdit?: boolean
  }>({ open: false })

  // Zoom state: 1 = normal (56px/hour), 2 = zoomed (112px/hour)
  const [zoom, setZoom] = useState<1 | 2>(() => {
    try {
      const saved = localStorage.getItem('calendarZoom')
      if (saved === '2') return 2
    } catch {}
    return 1
  })

  function toggleZoom() {
    setZoom(prev => {
      const next = prev === 1 ? 2 : 1
      try { localStorage.setItem('calendarZoom', String(next)) } catch {}
      return next
    })
  }

  // Theme state — tracks current theme for passing to components
  const [isLightMode, setIsLightMode] = useState(false)

  // Re-apply stored theme on mount + track it in state
  useEffect(() => {
    function syncTheme() {
      const theme = document.documentElement.getAttribute('data-theme')
      setIsLightMode(theme === 'light')
    }
    try {
      const t = localStorage.getItem('theme')
      if (t === 'light') document.documentElement.setAttribute('data-theme', 'light')
      else if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
      else if (!t && window.matchMedia('(prefers-color-scheme: light)').matches)
        document.documentElement.setAttribute('data-theme', 'light')
    } catch {}
    syncTheme()
    // Watch for theme changes (e.g. from SettingsModal)
    const obs = new MutationObserver(syncTheme)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  function canEditActivity(activity: Activity): boolean {
    if (activity.source === 'outlook') return !!activity.isOrganizer
    const inMainPersons = activity.mainPersons?.includes(userCode) ?? false
    const inAccessGroup = activity.accessGroup?.split(',').map(s => s.trim()).includes(userCode) ?? false
    const inCCPersons = activity.ccPersons?.includes(userCode) ?? false
    return activity.personCode === userCode || inMainPersons || inAccessGroup || inCCPersons
  }

  // Persist state to localStorage + keep current history entry in sync
  useEffect(() => {
    if (!peopleLoadedRef.current) return
    const stateSnapshot = {
      view: state.view,
      date: state.date,
      personCodes: state.selectedPersons.map(p => p.code),
    }
    try { localStorage.setItem('calendarState', JSON.stringify(stateSnapshot)) } catch {}
    // Replace (not push) so browser back always returns to the exact pre-drill state
    history.replaceState(stateSnapshot, '')
  }, [state.view, state.date, state.selectedPersons])

  // Global keyboard shortcuts (N/⌘N, T, ←, →, ?, Esc)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Esc closes color settings (form/shortcuts handle their own Esc)
      if (e.key === 'Escape' && colorSettingsOpen) {
        setColorSettingsOpen(false); return
      }
      // Skip if any modal/form is open
      if (formState.open || colorSettingsOpen || shortcutsOpen) return

      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase()
      const inInput = tag === 'input' || tag === 'textarea' || tag === 'select'

      // ⌃⌘N — New activity (works from anywhere when no modal open)
      if (e.metaKey && e.ctrlKey && !e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        setFormState({ open: true, initial: { date: state.date } })
        return
      }
      // ⌃⌘T — Jump to today
      if (e.metaKey && e.ctrlKey && !e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault()
        setState(s => ({ ...s, date: format(new Date(), 'yyyy-MM-dd') }))
        return
      }
      // ⌃⌘← / ⌃⌘→ — Jump by view step (1 / 3 / 5 days)
      if (e.metaKey && e.ctrlKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        const step = state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
        const dir = e.key === 'ArrowLeft' ? -step : step
        setState(s => ({ ...s, date: format(addDays(parseISO(s.date), dir), 'yyyy-MM-dd') }))
        return
      }
      // Skip bare key shortcuts if modifier held or input focused
      if (e.metaKey || e.ctrlKey || e.altKey || inInput) return

      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault()
        toggleZoom()
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        setFormState({ open: true, initial: { date: state.date } })
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        setState(s => ({ ...s, date: format(new Date(), 'yyyy-MM-dd') }))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setState(s => ({ ...s, date: format(subDays(parseISO(s.date), 1), 'yyyy-MM-dd') }))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setState(s => ({ ...s, date: format(addDays(parseISO(s.date), 1), 'yyyy-MM-dd') }))
      } else if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [formState.open, colorSettingsOpen, shortcutsOpen, state.view, state.date])

  // Drill-down: push current state to browser history, then change view
  function drillToDate(date: string) {
    // Save current state so browser back restores it
    history.pushState(
      { view: state.view, date: state.date, personCodes: state.selectedPersons.map(p => p.code) },
      ''
    )
    setState(s => ({ ...s, view: 'day', date }))
  }

  function drillToPerson(personCode: string) {
    history.pushState(
      { view: state.view, date: state.date, personCodes: state.selectedPersons.map(p => p.code) },
      ''
    )
    const person = state.selectedPersons.find(p => p.code === personCode)
    if (person) setState(s => ({ ...s, selectedPersons: [person] }))
  }

  // Restore state on browser back
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      if (e.state?.view && e.state?.date && e.state?.personCodes) {
        const { view, date, personCodes } = e.state
        const resolved = (personCodes as string[])
          .map(code => people.find(p => p.code === code) ?? { code, name: code, email: '' })
        setState({ view, date, selectedPersons: resolved })
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [people])

  // Derived color maps
  const typeToClassGroup = new Map(activityTypes.map(t => [t.code, t.classGroupCode ?? '']))
  const classGroupToColor = buildClassGroupColorMap(classGroups, colorOverrides)
  function colorForActivity(activity: Activity): string {
    return getActivityColor(activity, typeToClassGroup, classGroupToColor)
  }

  function typeGroupColor(typeCode: string): string {
    const grp = typeToClassGroup.get(typeCode)
    if (!grp) return ''
    return classGroupToColor.get(grp) ?? ''
  }

  function getTypeGroup(typeCode: string) {
    const grp = typeToClassGroup.get(typeCode)
    if (!grp) return undefined
    return classGroups.find(g => g.code === grp)
  }

  function getTypeName(typeCode: string): string {
    return activityTypes.find(t => t.code === typeCode)?.name ?? ''
  }

  function reloadColorData(bust = false) {
    const opts: RequestInit = bust ? { cache: 'reload' } : {}
    Promise.all([
      fetch('/api/activity-types', opts).then(r => r.json()),
      fetch('/api/activity-class-groups', opts).then(r => r.json()),
    ]).then(([types, groups]) => {
      if (Array.isArray(types)) setActivityTypes(types as ActivityType[])
      if (Array.isArray(groups)) {
        setClassGroups(groups as ActivityClassGroup[])
        setClassGroupsError(null)
      } else {
        setClassGroupsError(groups?.error ?? JSON.stringify(groups))
      }
    }).catch(e => setClassGroupsError(String(e)))
  }

  // Load activity types + class groups for color mapping
  useEffect(() => {
    setColorOverrides(loadColorOverrides())
    reloadColorData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load people list on mount
  useEffect(() => {
    setStatus({ msg: 'Loading users from Herbe ERP…' })
    fetch('/api/users')
      .then(async r => {
        const text = await r.text()
        let data: unknown
        try { data = JSON.parse(text) } catch {
          throw new Error(`Server error (${r.status}): ${text.slice(0, 120)}`)
        }
        if (!Array.isArray(data)) throw new Error((data as { error?: string }).error ?? JSON.stringify(data))
        return data as Record<string, unknown>[]
      })
      .then((users) => {
        const list: Person[] = users.map(u => ({
          code: u['Code'] as string,
          name: u['Name'] as string,
          email: u['Email'] as string,
        }))
        setPeople(list)
        peopleLoadedRef.current = true
        setStatus({ msg: `Loaded ${list.length} users`, ok: true })
        // Restore saved person selection, or default to logged-in user
        try {
          const saved = localStorage.getItem('calendarState')
          if (saved) {
            const { personCodes } = JSON.parse(saved)
            if (personCodes?.length) {
              const restored = (personCodes as string[])
                .map(code => list.find(p => p.code === code))
                .filter((p): p is Person => !!p)
              if (restored.length > 0) {
                setState(s => ({ ...s, selectedPersons: restored }))
                return
              }
            }
          }
        } catch {}
        const me = list.find(p => p.code === userCode)
        if (me) setState(s => ({ ...s, selectedPersons: [me] }))
        else if (userCode) setStatus({ msg: `Loaded ${list.length} users — user "${userCode}" not found in list`, ok: false })
      })
      .catch(e => {
        // User list unavailable — restore saved person codes from localStorage so
        // the calendar still works (activities will load, just no name/email lookup)
        try {
          const saved = localStorage.getItem('calendarState')
          if (saved) {
            const { personCodes } = JSON.parse(saved)
            if (personCodes?.length) {
              const fallback: Person[] = (personCodes as string[]).map(code => ({ code, name: code, email: '' }))
              setState(s => ({ ...s, selectedPersons: fallback }))
              setStatus({ msg: `User list unavailable (${e}) — restored saved selection`, ok: false })
              return
            }
          }
        } catch {}
        // Last resort: use logged-in user code directly
        if (userCode) {
          setState(s => ({ ...s, selectedPersons: [{ code: userCode, name: userCode, email: '' }] }))
        }
        setStatus({ msg: `Failed to load users: ${e}`, ok: false })
      })
  }, [userCode])

  const fetchActivities = useCallback(async () => {
    if (!state.selectedPersons.length) return
    setLoading(true)
    const codes = state.selectedPersons.map(p => p.code).join(',')
    const dateFrom = state.date
    const dateTo = state.view === '5day'
      ? format(addDays(parseISO(state.date), 4), 'yyyy-MM-dd')
      : state.view === '3day'
      ? format(addDays(parseISO(state.date), 2), 'yyyy-MM-dd')
      : state.date
    const dateParam = dateFrom === dateTo
      ? `date=${dateFrom}`
      : `dateFrom=${dateFrom}&dateTo=${dateTo}`

    setStatus({ msg: `Fetching activities for ${codes} (${dateFrom}${dateTo !== dateFrom ? ` – ${dateTo}` : ''})…` })
    try {
      const [herbeRes, outlookRes] = await Promise.all([
        fetch(`/api/activities?persons=${codes}&${dateParam}`),
        fetch(`/api/outlook?persons=${codes}&${dateParam}`),
      ])
      let herbe: Activity[] = []
      let herbeErrMsg = ''
      if (herbeRes.ok) {
        herbe = await herbeRes.json()
      } else {
        try {
          const e = await herbeRes.json()
          herbeErrMsg = e.error || e.message || JSON.stringify(e)
        } catch {
          herbeErrMsg = `HTTP ${herbeRes.status}`
        }
      }
      let outlook: Activity[] = []
      let outlookErrMsg = ''
      if (outlookRes.ok) {
        outlook = await outlookRes.json()
      } else {
        try {
          const e = await outlookRes.json()
          outlookErrMsg = String(e.error ?? JSON.stringify(e))
        } catch {
          outlookErrMsg = await outlookRes.text().catch(() => String(outlookRes.status))
        }
      }
      setActivities([...herbe, ...outlook])

      const herbeErr = !herbeRes.ok ? ` | Herbe: ${herbeErrMsg}` : ''
      const outlookErr = !outlookRes.ok ? ` | Outlook: ${outlookErrMsg}` : ''
      setStatus({
        msg: `${herbe.length} Herbe + ${outlook.length} Outlook activities${herbeErr}${outlookErr}`,
        ok: herbeRes.ok && outlookRes.ok,
      })
    } catch (e) {
      setStatus({ msg: `Fetch failed: ${e}`, ok: false })
      console.error('Failed to fetch activities:', e)
    } finally {
      setLoading(false)
    }
  }, [state.selectedPersons, state.date, state.view])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  // Fetch full customer + project lists into client state for instant search
  useEffect(() => {
    setStatus({ msg: 'Loading customers & projects…' })
    Promise.all([
      fetch('/api/customers?all=1').then(r => r.ok ? r.json() : []).then(setAllCustomers).catch(() => {}),
      fetch('/api/projects?all=1').then(r => r.ok ? r.json() : []).then(setAllProjects).catch(() => {}),
    ]).then(() => setStatus(s => s?.msg === 'Loading customers & projects…' ? null : s))
  }, [])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg">
      <CalendarHeader
        state={state}
        onStateChange={setState}
        people={people}
        onNewActivity={() => setFormState({ open: true, initial: { date: state.date } })}
        onRefresh={fetchActivities}
        onColorSettings={() => setColorSettingsOpen(true)}
        onShortcuts={() => setShortcutsOpen(true)}
        onApplyFavorite={(view, personCodes) => {
          const resolved = personCodes
            .map(code => people.find(p => p.code === code) ?? { code, name: code, email: '' })
          setState(s => ({ ...s, view, selectedPersons: resolved }))
        }}
        zoom={zoom}
        onToggleZoom={toggleZoom}
      />
      <CalendarGrid
        state={state}
        activities={activities}
        loading={loading}
        sessionUserCode={userCode}
        getActivityColor={colorForActivity}
        getTypeName={getTypeName}
        scale={zoom}
        isLightMode={isLightMode}
        onRefresh={fetchActivities}
        onNavigate={(dir) => {
          const step = state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
          setState(s => ({
            ...s,
            date: format(
              dir === 'next' ? addDays(parseISO(s.date), step) : subDays(parseISO(s.date), step),
              'yyyy-MM-dd'
            ),
          }))
        }}
        onSlotClick={(personCode, time, date) =>
          setFormState({ open: true, initial: { personCode, timeFrom: time, date } })
        }
        onActivityClick={(activity) =>
          setFormState({
            open: true,
            initial: activity,
            editId: activity.id,
            canEdit: canEditActivity(activity)
          })
        }
        onActivityUpdate={fetchActivities}
        onNewForDate={(date) => setFormState({ open: true, initial: { date } })}
        onDrillDate={drillToDate}
        onDrillPerson={drillToPerson}
      />
      {status && (
        <div
          className="px-3 py-1 text-xs font-mono border-t shrink-0 flex items-center justify-between"
          style={status.ok === false
            ? { background: 'var(--status-err-bg)', borderColor: 'var(--status-err-border)', color: 'var(--status-err-text)' }
            : status.ok === true
            ? { background: 'var(--status-ok-bg)', borderColor: 'var(--status-ok-border)', color: 'var(--status-ok-text)' }
            : undefined
          }
        >
          <div>{status.ok === false ? '✗ ' : status.ok === true ? '✓ ' : '⟳ '}{status.msg}</div>
        </div>
      )}

      {shortcutsOpen && (
        <KeyboardShortcutsModal onClose={() => setShortcutsOpen(false)} />
      )}

      {colorSettingsOpen && (
        <SettingsModal
          classGroups={classGroups}
          colorMap={classGroupToColor}
          persons={people}
          error={classGroupsError}
          onClose={() => setColorSettingsOpen(false)}
          onColorChange={(groupCode, color) => {
            setColorOverrides(prev => ({ ...prev, [groupCode]: color }))
          }}
          onReload={() => reloadColorData(true)}
        />
      )}

      {formState.open && (
        <ActivityForm
          initial={formState.initial}
          editId={formState.editId}
          people={people}
          defaultPersonCode={userCode}
          defaultPersonCodes={state.selectedPersons.map(p => p.code)}
          allActivities={activities}
          onClose={() => setFormState({ open: false })}
          onSaved={fetchActivities}
          onDuplicate={(dup) => setFormState({ open: true, initial: dup })}
          onRsvp={(newStatus) => {
            // Update the activity in-state so re-opening the form shows the correct RSVP
            setActivities(prev => prev.map(a =>
              a.id === formState.editId ? { ...a, rsvpStatus: newStatus } : a
            ))
            setFormState(prev => ({
              ...prev,
              initial: prev.initial ? { ...prev.initial, rsvpStatus: newStatus } : prev.initial
            }))
          }}
          canEdit={formState.canEdit}
          getTypeColor={typeGroupColor}
          getTypeGroup={getTypeGroup}
          companyCode={companyCode}
          allCustomers={allCustomers}
          allProjects={allProjects}
        />
      )}

      {/* FAB — mobile only, hidden when form is open */}
      {!formState.open && (
        <div className="fixed bottom-5 right-5 z-50 lg:hidden flex items-center shadow-lg rounded-full overflow-hidden">
          <button
            onClick={toggleZoom}
            className="bg-primary/80 text-white w-11 h-11 flex items-center justify-center border-r border-white/20"
            title={zoom === 1 ? 'Zoom in (2x)' : 'Zoom out (1x)'}
            aria-label={zoom === 1 ? 'Zoom in' : 'Zoom out'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              {zoom === 1
                ? <><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></>
                : <line x1="8" y1="11" x2="14" y2="11"/>}
            </svg>
          </button>
          <button
            onClick={() => setFormState({ open: true, initial: { date: state.date } })}
            className="bg-primary text-white text-xl font-bold w-11 h-11 flex items-center justify-center"
            title="New activity"
            aria-label="New activity"
          >
            +
          </button>
        </div>
      )}

    </div>
  )
}
