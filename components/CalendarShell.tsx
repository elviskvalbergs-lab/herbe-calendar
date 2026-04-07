'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { Person, Activity, ActivityType, ActivityClassGroup, CalendarState, CalendarSource } from '@/types'
import CalendarHeader from './CalendarHeader'
import CalendarGrid from './CalendarGrid'
import ActivityForm from './ActivityForm'
import SettingsModal from './SettingsModal'
import KeyboardShortcutsModal from './KeyboardShortcutsModal'
import {
  buildClassGroupColorMap, getActivityColor, loadColorOverrides, OUTLOOK_COLOR, FALLBACK_COLOR,
} from '@/lib/activityColors'
import {
  HERBE_ID, OUTLOOK_ID, HERBE_COLOR, icsId, loadHidden, saveHidden,
} from '@/lib/calendarVisibility'

interface Props { userCode: string; companyCode: string }

export default function CalendarShell({ userCode, companyCode }: Props) {
  const [people, setPeople] = useState<Person[]>([])
  const peopleLoadedRef = useRef(false)
  const [sources, setSources] = useState<{ herbe: boolean; azure: boolean; google?: boolean }>({ herbe: true, azure: true })
  const [erpConnections, setErpConnections] = useState<{ id: string; name: string; companyCode?: string; serpUuid?: string }[]>([])
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
        const { view, date, personCodes } = JSON.parse(saved)
        // Restore person codes as stubs immediately so the calendar isn't empty while loading
        const persons: Person[] = (personCodes as string[] | undefined)?.map(code => ({ code, name: code, email: '' })) ?? []
        if (view && date) return { view, date, selectedPersons: persons }
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

  // Calendar visibility state
  const [hiddenCalendars, setHiddenCalendars] = useState<Set<string>>(() => loadHidden())
  const [userIcsCalendars, setUserIcsCalendars] = useState<{ name: string; color?: string; personCode: string }[]>([])

  const selectedCodes = useMemo(() => new Set(state.selectedPersons.map(p => p.code)), [state.selectedPersons])

  const calendarSources: CalendarSource[] = useMemo(() => [
    { id: HERBE_ID, label: 'ERP', color: HERBE_COLOR },
    { id: OUTLOOK_ID, label: 'Outlook', color: OUTLOOK_COLOR },
    ...userIcsCalendars
      .filter(c => selectedCodes.has(c.personCode))
      .map(c => ({ id: icsId(c.name), label: c.name, color: c.color ?? FALLBACK_COLOR, personCode: c.personCode })),
  ], [userIcsCalendars, selectedCodes])

  const visibleActivities = useMemo(() => {
    if (hiddenCalendars.size === 0) return activities
    return activities.filter(a => {
      if (a.isExternal && a.icsCalendarName) return !hiddenCalendars.has(icsId(a.icsCalendarName))
      if (a.source === 'outlook' && !a.isExternal) return !hiddenCalendars.has(OUTLOOK_ID)
      if (a.source === 'herbe') return !hiddenCalendars.has(HERBE_ID)
      return true
    })
  }, [activities, hiddenCalendars])

  const [calendarSourcesOpen, setCalendarSourcesOpen] = useState(false)

  function toggleCalendar(id: string) {
    setHiddenCalendars(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      saveHidden(next)
      return next
    })
  }

  function setAllCalendars(show: boolean) {
    if (show) {
      setHiddenCalendars(new Set())
      saveHidden(new Set())
    } else {
      const all = new Set(calendarSources.map(s => s.id))
      setHiddenCalendars(all)
      saveHidden(all)
    }
  }

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
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        setCalendarSourcesOpen(o => !o)
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

  // Load activity types + class groups for color mapping (Herbe only)
  useEffect(() => {
    setColorOverrides(loadColorOverrides())
    if (sources.herbe) reloadColorData()
  }, [sources.herbe]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load people list on mount
  useEffect(() => {
    setStatus({ msg: 'Loading users…' })
    fetch('/api/users')
      .then(async r => {
        const text = await r.text()
        let data: unknown
        try { data = JSON.parse(text) } catch {
          throw new Error(`Server error (${r.status}): ${text.slice(0, 120)}`)
        }
        // Handle both new { users, sources } format and legacy array format
        const envelope = data as { users?: unknown[]; sources?: { herbe: boolean; azure: boolean } }
        if (envelope.users && Array.isArray(envelope.users)) {
          if (envelope.sources) setSources(envelope.sources)
          if ((envelope as any).erpConnections) setErpConnections((envelope as any).erpConnections)
          return envelope.users as Record<string, unknown>[]
        }
        if (Array.isArray(data)) return data as Record<string, unknown>[]
        throw new Error((data as { error?: string }).error ?? JSON.stringify(data))
      })
      .then((users) => {
        const list: Person[] = users.map(u => ({
          code: u['Code'] as string,
          name: u['Name'] as string,
          email: (u['emailAddr'] || u['LoginEmailAddr'] || u['Email'] || '') as string,
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

  // Stable string of selected person codes — avoids refetching when stubs are replaced with full objects
  const selectedCodesKey = state.selectedPersons.map(p => p.code).join(',')

  const fetchActivities = useCallback(async (bustIcsCache = false) => {
    if (!selectedCodesKey) return
    setLoading(true)
    const codes = selectedCodesKey
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
      const fetches: Promise<Response>[] = []
      if (sources.herbe) fetches.push(fetch(`/api/activities?persons=${codes}&${dateParam}`))
      if (sources.azure) fetches.push(fetch(`/api/outlook?persons=${codes}&${dateParam}${bustIcsCache ? '&bustIcsCache=1' : ''}`))
      if (sources.google) fetches.push(fetch(`/api/google?persons=${codes}&${dateParam}`))

      const responses = await Promise.all(fetches)
      let idx = 0

      let herbe: Activity[] = []
      let herbeErrMsg = ''
      if (sources.herbe) {
        const herbeRes = responses[idx++]
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
      }
      let outlook: Activity[] = []
      let outlookErrMsg = ''
      if (sources.azure) {
        const outlookRes = responses[idx++]
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
      }
      let googleEvents: Activity[] = []
      let googleErrMsg = ''
      if (sources.google) {
        const googleRes = responses[idx++]
        if (googleRes.ok) {
          googleEvents = await googleRes.json()
        } else {
          try {
            const e = await googleRes.json()
            googleErrMsg = String(e.error ?? JSON.stringify(e))
          } catch {
            googleErrMsg = await googleRes.text().catch(() => String(googleRes.status))
          }
        }
      }
      setActivities([...herbe, ...outlook, ...googleEvents])

      const parts: string[] = []
      if (sources.herbe) parts.push(`${herbe.length} ERP${herbeErrMsg ? ` (${herbeErrMsg})` : ''}`)
      if (sources.azure) parts.push(`${outlook.length} Outlook${outlookErrMsg ? ` (${outlookErrMsg})` : ''}`)
      if (sources.google) parts.push(`${googleEvents.length} Google${googleErrMsg ? ` (${googleErrMsg})` : ''}`)
      setStatus({
        msg: parts.join(' + ') + ' activities',
        ok: !herbeErrMsg && !outlookErrMsg && !googleErrMsg,
      })
    } catch (e) {
      setStatus({ msg: `Fetch failed: ${e}`, ok: false })
      console.error('Failed to fetch activities:', e)
    } finally {
      setLoading(false)
    }
  }, [selectedCodesKey, state.date, state.view, sources.herbe, sources.azure, sources.google]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  // Fetch full customer + project lists into client state for instant search (Herbe only)
  useEffect(() => {
    if (!sources.herbe) return
    setStatus({ msg: 'Loading customers & projects…' })
    Promise.all([
      fetch('/api/customers?all=1').then(r => r.ok ? r.json() : []).then(setAllCustomers).catch(() => {}),
      fetch('/api/projects?all=1').then(r => r.ok ? r.json() : []).then(setAllProjects).catch(() => {}),
    ]).then(() => setStatus(s => s?.msg === 'Loading customers & projects…' ? null : s))
  }, [sources.herbe])

  // Fetch user's ICS calendars for the source list
  useEffect(() => {
    fetch('/api/settings/calendars')
      .then(r => r.ok ? r.json() : [])
      .then((cals: { name: string; color?: string; personCode: string }[]) => setUserIcsCalendars(cals))
      .catch(() => {})
  }, [])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg">
      <CalendarHeader
        state={state}
        onStateChange={setState}
        people={people}
        onNewActivity={() => setFormState({ open: true, initial: { date: state.date } })}
        onRefresh={() => { fetchActivities(true); reloadColorData(true) }}
        onColorSettings={() => setColorSettingsOpen(true)}
        onShortcuts={() => setShortcutsOpen(true)}
        calendarSources={calendarSources}
        hiddenCalendars={hiddenCalendars}
        onToggleCalendar={toggleCalendar}
        onSetAllCalendars={setAllCalendars}
        calendarSourcesOpen={calendarSourcesOpen}
        onCalendarSourcesOpenChange={setCalendarSourcesOpen}
        onApplyFavorite={(view: CalendarState['view'], personCodes: string[], hiddenCals?: string[]) => {
          const resolved = personCodes
            .map((code: string) => people.find(p => p.code === code) ?? { code, name: code, email: '' })
          setState(s => ({ ...s, view, selectedPersons: resolved }))
          if (hiddenCals !== undefined) {
            const next = new Set<string>(hiddenCals)
            setHiddenCalendars(next)
            saveHidden(next)
          }
        }}
        zoom={zoom}
        onToggleZoom={toggleZoom}
      />
      <CalendarGrid
        state={state}
        activities={visibleActivities}
        loading={loading}
        sessionUserCode={userCode}
        getActivityColor={colorForActivity}
        getTypeName={getTypeName}
        scale={zoom}
        isLightMode={isLightMode}
        onRefresh={() => { fetchActivities(true); reloadColorData(true) }}
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
          erpConnections={erpConnections}
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
