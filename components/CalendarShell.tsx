'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { format, addDays, subDays, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, parseISO } from 'date-fns'
import { Person, Activity, ActivityType, ActivityClassGroup, CalendarState, CalendarSource, UserGoogleAccount } from '@/types'
import type { Task, TaskSource } from '@/types/task'
import CalendarHeader from './CalendarHeader'
import CalendarGrid from './CalendarGrid'
import MonthView from './MonthView'
import ActivityForm from './ActivityForm'
import SettingsModal from './SettingsModal'
import KeyboardShortcutsModal from './KeyboardShortcutsModal'
import AccountSwitcher from './AccountSwitcher'
import { TasksSidebar } from './TasksSidebar'
import {
  buildClassGroupColorMap, loadColorOverrides,
  resolveColorWithOverrides, OUTLOOK_COLOR, GOOGLE_COLOR, FALLBACK_COLOR,
  SOURCE_COLOR_CODES, type ColorOverrideRow,
} from '@/lib/activityColors'
import {
  HERBE_ID, OUTLOOK_ID, GOOGLE_ID, HERBE_COLOR, icsId, loadHidden, saveHidden,
} from '@/lib/calendarVisibility'

interface Props { userCode: string; companyCode: string; accountId?: string }

export default function CalendarShell({ userCode, companyCode, accountId = '' }: Props) {
  const [people, setPeople] = useState<Person[]>([])
  const peopleLoadedRef = useRef(false)
  const activityCacheRef = useRef(new Map<string, { data: Activity[]; ts: number }>())
  const [sources, setSources] = useState<{ herbe: boolean; azure: boolean; google?: boolean; zoom?: boolean }>({ herbe: true, azure: true })
  const [erpConnections, setErpConnections] = useState<{ id: string; name: string; companyCode?: string; serpUuid?: string }[]>([])
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([])
  const [classGroups, setClassGroups] = useState<ActivityClassGroup[]>([])
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({})
  const [dbColorOverrides, setDbColorOverrides] = useState<ColorOverrideRow[]>([])
  const [colorSettingsOpen, setColorSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false)
  const [accountName, setAccountName] = useState<string>('')
  const [accountLogo, setAccountLogo] = useState<string>('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')
  // Fetch account name + admin status + email on mount
  useEffect(() => {
    if (!accountId) return
    fetch('/api/settings/accounts').then(r => r.json()).then(data => {
      const current = (data.accounts ?? []).find((a: { id: string }) => a.id === accountId)
      if (current) {
        setAccountName(current.display_name)
        setAccountLogo(current.logo_url ?? '')
      }
      setIsAdmin(!!data.isAdmin)
      if (data.email) setUserEmail(data.email)
    }).catch(() => {})
  }, [accountId])
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
  const [holidays, setHolidays] = useState<{ dates: Record<string, { name: string; country: string }[]>; personCountries: Record<string, string> }>({ dates: {}, personCountries: {} })
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ msg: string; ok?: boolean } | null>(null)
  const [allCustomers, setAllCustomers] = useState<{ Code: string; Name: string }[]>([])
  const [allProjects, setAllProjects] = useState<{ Code: string; Name: string; CUCode: string | null; CUName: string | null }[]>([])
  const [allItems, setAllItems] = useState<{ Code: string; Name: string }[]>([])
  const [formState, setFormState] = useState<{
    open: boolean
    initial?: Partial<Activity>
    editId?: string
    canEdit?: boolean
    mode?: 'event' | 'task'
  }>({ open: false })

  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskSources, setTaskSources] = useState<{ herbe: boolean; outlook: boolean; google: boolean }>({
    herbe: true, outlook: false, google: false,
  })
  const [taskErrors, setTaskErrors] = useState<{ source: TaskSource; msg: string; stale?: boolean }[]>([])
  const [tasksTab, setTasksTab] = useState<'all' | TaskSource>('all')
  const [tasksLoading, setTasksLoading] = useState(false)

  // Month view selected day — tracks state.date for all views
  const [monthSelectedDay, setMonthSelectedDay] = useState<string>(state.date)
  useEffect(() => {
    setMonthSelectedDay(state.date)
  }, [state.date])

  // Calendar visibility state
  const [hiddenCalendars, setHiddenCalendars] = useState<Set<string>>(() => loadHidden())
  const [userIcsCalendars, setUserIcsCalendars] = useState<{ name: string; color?: string; personCode: string; sharing?: string }[]>([])
  const [userGoogleAccounts, setUserGoogleAccounts] = useState<UserGoogleAccount[]>([])

  const selectedCodes = useMemo(() => new Set(state.selectedPersons.map(p => p.code)), [state.selectedPersons])

  // Resolve source colors from DB overrides for calendar source labels
  const resolvedOutlookColor = useMemo(() => {
    if (dbColorOverrides.length > 0) {
      const match = dbColorOverrides.find(o => o.class_group_code === SOURCE_COLOR_CODES.outlook && o.user_email !== null && o.connection_id === null)
        ?? dbColorOverrides.find(o => o.class_group_code === SOURCE_COLOR_CODES.outlook && o.user_email === null && o.connection_id === null)
      if (match) return match.color
    }
    return OUTLOOK_COLOR
  }, [dbColorOverrides])
  const resolvedGoogleColor = useMemo(() => {
    if (dbColorOverrides.length > 0) {
      const match = dbColorOverrides.find(o => o.class_group_code === SOURCE_COLOR_CODES.google && o.user_email !== null && o.connection_id === null)
        ?? dbColorOverrides.find(o => o.class_group_code === SOURCE_COLOR_CODES.google && o.user_email === null && o.connection_id === null)
      if (match) return match.color
    }
    return GOOGLE_COLOR
  }, [dbColorOverrides])

  // Derive shared calendar sources from fetched activities
  const sharedCalendarSources: CalendarSource[] = useMemo(() => {
    const seen = new Set<string>()
    const result: CalendarSource[] = []
    for (const a of activities) {
      if (!a.isShared || !a.icsCalendarName) continue
      const id = icsId(a.icsCalendarName)
      if (seen.has(id)) continue
      seen.add(id)
      const person = state.selectedPersons.find(p => p.code === a.personCode)
      // Strip "(shared)" suffix from label — the group header indicates sharing
      const label = a.icsCalendarName.replace(/ \(shared\)$/, '')
      result.push({
        id,
        label,
        color: a.icsColor ?? FALLBACK_COLOR,
        group: person ? `${person.name} (shared)` : 'Shared calendars',
        sharing: a.sharingLevel,
      })
    }
    return result
  }, [activities, state.selectedPersons])

  const calendarSources: CalendarSource[] = useMemo(() => [
    ...(sources.herbe ? [{ id: HERBE_ID, label: 'ERP', color: HERBE_COLOR }] : []),
    ...(sources.azure ? [{ id: OUTLOOK_ID, label: 'Outlook', color: resolvedOutlookColor }] : []),
    ...(sources.google ? [{ id: GOOGLE_ID, label: 'Google', color: resolvedGoogleColor }] : []),
    ...userGoogleAccounts.flatMap(account =>
      account.calendars.filter(c => c.enabled).map(cal => ({
        id: `google-user:${account.googleEmail}:${cal.calendarId}`,
        label: cal.name,
        color: cal.color ?? '#4285f4',
        group: `Google (${account.googleEmail})`,
        googleTokenId: account.id,
        googleCalendarId: cal.calendarId,
        sharing: cal.sharing,
      }))
    ),
    ...userIcsCalendars
      .filter(c => selectedCodes.has(c.personCode))
      .map(c => ({ id: icsId(c.name), label: c.name, color: c.color ?? FALLBACK_COLOR, personCode: c.personCode, sharing: c.sharing as any })),
    ...sharedCalendarSources,
  ], [sources, resolvedOutlookColor, resolvedGoogleColor, userGoogleAccounts, userIcsCalendars, selectedCodes, sharedCalendarSources])

  const visibleActivities = useMemo(() => {
    if (hiddenCalendars.size === 0) return activities
    return activities.filter(a => {
      // Shared calendar events — check by their calendar name
      if (a.isShared && a.icsCalendarName) return !hiddenCalendars.has(icsId(a.icsCalendarName))
      if (a.isExternal && a.icsCalendarName) return !hiddenCalendars.has(icsId(a.icsCalendarName))
      // For per-user Google events, check if their specific calendar is hidden
      if (a.googleAccountEmail && a.googleCalendarId) {
        const calSourceId = `google-user:${a.googleAccountEmail}:${a.googleCalendarId}`
        return !hiddenCalendars.has(calSourceId)
      }
      if (a.source === 'outlook' && !a.isExternal) return !hiddenCalendars.has(OUTLOOK_ID)
      if (a.source === 'google' && !a.isExternal) return !hiddenCalendars.has(GOOGLE_ID)
      if (a.source === 'herbe') return !hiddenCalendars.has(HERBE_ID)
      // Unknown source — check by source name as calendar ID
      return !hiddenCalendars.has(a.source)
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
    if (activity.okFlag) return false
    // Per-user Google: always editable (user owns the OAuth token)
    if (activity.googleTokenId) return true
    // External calendar sources: only the organizer can edit
    if (activity.source === 'outlook' || activity.source === 'google') return !!activity.isOrganizer
    // ERP activities: check person assignment
    if (activity.source === 'herbe') {
      const inMainPersons = activity.mainPersons?.includes(userCode) ?? false
      const inAccessGroup = activity.accessGroup?.split(',').map(s => s.trim()).includes(userCode) ?? false
      const inCCPersons = activity.ccPersons?.includes(userCode) ?? false
      return activity.personCode === userCode || inMainPersons || inAccessGroup || inCCPersons
    }
    // Unknown source — default to read-only
    return false
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
      // ⌃⌘A — Account switcher (works from anywhere)
      if (e.metaKey && e.ctrlKey && !e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        setAccountSwitcherOpen(o => !o)
        return
      }
      // Esc closes color settings (form/shortcuts handle their own Esc)
      if (e.key === 'Escape' && accountSwitcherOpen) {
        setAccountSwitcherOpen(false); return
      }
      if (e.key === 'Escape' && colorSettingsOpen) {
        setColorSettingsOpen(false); return
      }
      // Skip if any modal/form is open
      if (formState.open || colorSettingsOpen || shortcutsOpen || accountSwitcherOpen) return

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
        const step = state.view === '7day' ? 7 : state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
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
      } else if (e.key === '1') {
        e.preventDefault()
        setState(s => ({ ...s, view: 'day' }))
      } else if (e.key === '3') {
        e.preventDefault()
        setState(s => ({ ...s, view: '3day' }))
      } else if (e.key === '5') {
        e.preventDefault()
        setState(s => ({ ...s, view: '5day' }))
      } else if (e.key === '7') {
        e.preventDefault()
        setState(s => ({ ...s, view: '7day' }))
      } else if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [formState.open, colorSettingsOpen, shortcutsOpen, accountSwitcherOpen, state.view, state.date])

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
    if (activity.icsColor) return activity.icsColor
    if (activity.source === 'google' && !activity.isExternal) {
      if (dbColorOverrides.length > 0) {
        return resolveColorWithOverrides(SOURCE_COLOR_CODES.google, null, classGroups, 0, dbColorOverrides)
      }
      return classGroupToColor.get(SOURCE_COLOR_CODES.google) ?? GOOGLE_COLOR
    }
    if (activity.source === 'outlook' && !activity.isExternal) {
      if (dbColorOverrides.length > 0) {
        return resolveColorWithOverrides(SOURCE_COLOR_CODES.outlook, null, classGroups, 0, dbColorOverrides)
      }
      return classGroupToColor.get(SOURCE_COLOR_CODES.outlook) ?? OUTLOOK_COLOR
    }
    if (!activity.activityTypeCode) {
      return classGroupToColor.get(SOURCE_COLOR_CODES.erp) ?? FALLBACK_COLOR
    }
    const grp = typeToClassGroup.get(activity.activityTypeCode)
    if (!grp) return classGroupToColor.get(SOURCE_COLOR_CODES.erp) ?? FALLBACK_COLOR

    if (dbColorOverrides.length > 0) {
      const groupIndex = classGroups.findIndex(g => g.code === grp)
      return resolveColorWithOverrides(grp, activity.erpConnectionId ?? null, classGroups, groupIndex >= 0 ? groupIndex : 0, dbColorOverrides)
    }

    return classGroupToColor.get(grp) ?? FALLBACK_COLOR
  }

  function typeGroupColor(typeCode: string): string {
    const grp = typeToClassGroup.get(typeCode)
    if (!grp) return ''
    if (dbColorOverrides.length > 0) {
      const groupIndex = classGroups.findIndex(g => g.code === grp)
      return resolveColorWithOverrides(grp, null, classGroups, groupIndex >= 0 ? groupIndex : 0, dbColorOverrides)
    }
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

  // Fetch DB color overrides and migrate localStorage on mount
  useEffect(() => {
    fetch('/api/settings/colors')
      .then(r => r.json())
      .then(async (rows: ColorOverrideRow[]) => {
        setDbColorOverrides(Array.isArray(rows) ? rows : [])

        // One-time migration: move localStorage overrides to DB
        const local = loadColorOverrides()
        const localKeys = Object.keys(local)
        if (localKeys.length > 0 && rows.filter((r: ColorOverrideRow) => r.user_email !== null).length === 0) {
          await Promise.all(localKeys.map(code =>
            fetch('/api/settings/colors', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ classGroupCode: code, color: local[code] }),
            }).catch(() => {})
          ))
          try { localStorage.removeItem('activityClassGroupColors') } catch {}
          // Refetch to get migrated overrides
          const res = await fetch('/api/settings/colors')
          const migrated = await res.json()
          setDbColorOverrides(Array.isArray(migrated) ? migrated : [])
        }
      })
      .catch(() => {})
  }, [])

  // Load people list on mount (with retry on empty result)
  const [usersRetry, setUsersRetry] = useState(0)
  useEffect(() => {
    setStatus({ msg: usersRetry > 0 ? `Retrying users (${usersRetry}/2)…` : 'Loading users…' })
    fetch('/api/users' + (usersRetry > 0 ? '?bust=1' : ''))
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
        if (list.length === 0 && usersRetry < 2) {
          setTimeout(() => setUsersRetry(n => n + 1), 3000)
          return
        }
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
  }, [userCode, usersRetry]) // eslint-disable-line react-hooks/exhaustive-deps

  // Check if Zoom is configured for this account
  useEffect(() => {
    fetch('/api/zoom/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).then(r => {
      // 400 means "bad request / not configured", anything else (200, 422, 401) means Zoom is configured
      if (r.status !== 400) setSources(prev => ({ ...prev, zoom: true }))
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Stable string of selected person codes — avoids refetching when stubs are replaced with full objects
  const selectedCodesKey = state.selectedPersons.map(p => p.code).join(',')
  const activeFetchKeyRef = useRef('')

  const fetchActivities = useCallback(async (bustIcsCache = false) => {
    if (!selectedCodesKey) return
    const codes = selectedCodesKey
    const dateFrom = state.view === 'month'
      ? format(startOfWeek(startOfMonth(parseISO(state.date)), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      : state.date
    const dateTo = state.view === 'month'
      ? format(endOfWeek(endOfMonth(parseISO(state.date)), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      : state.view === '7day'
      ? format(addDays(parseISO(state.date), 6), 'yyyy-MM-dd')
      : state.view === '5day'
      ? format(addDays(parseISO(state.date), 4), 'yyyy-MM-dd')
      : state.view === '3day'
      ? format(addDays(parseISO(state.date), 2), 'yyyy-MM-dd')
      : state.date
    const dateParam = dateFrom === dateTo
      ? `date=${dateFrom}`
      : `dateFrom=${dateFrom}&dateTo=${dateTo}`

    // Track which fetch is current — results for a different key are discarded
    const cacheKey = `${codes}:${dateFrom}:${dateTo}`
    activeFetchKeyRef.current = cacheKey
    const cacheEntry = activityCacheRef.current.get(cacheKey)
    // Stale-while-revalidate: show cached data immediately (if any), then always
    // background-refresh. The previous "skip refresh if < 60s old" behavior hid
    // updates from the user — if the initial fetch returned incomplete data
    // (e.g. sync still catching up), the user had no way to see the real state
    // without manually switching views and back.
    if (cacheEntry && !bustIcsCache) {
      setActivities(cacheEntry.data)
      setLoading(true)
      setStatus({ msg: `${cacheEntry.data.length} activities · refreshing…`, ok: true })
    } else {
      setLoading(true)
      setStatus({ msg: 'Loading...' })
    }
    const icsWarnings: string[] = []
    const errors: string[] = []

    // Progressive: each source replaces only its own portion in the activities array
    // This prevents non-ERP events from vanishing while waiting for Google/Outlook
    const loaded: { herbe: Activity[] | null; outlook: Activity[] | null; google: Activity[] | null } = { herbe: null, outlook: null, google: null }

    function mergeAndSetActivities() {
      if (activeFetchKeyRef.current !== cacheKey) return // stale fetch for different date range — ignore
      setActivities(prev => {
        // Keep previous source data for sources that haven't loaded yet
        const h = loaded.herbe ?? prev.filter(a => a.source === 'herbe')
        const o = loaded.outlook ?? prev.filter(a => a.source === 'outlook' || a.isExternal)
        const g = loaded.google ?? prev.filter(a => a.source === 'google' && !a.isExternal)

        const seenGoogleKeys = new Set<string>()
        const uniqueGoogle = g.filter(a => {
          const key = `${a.id}:${a.personCode}`
          if (seenGoogleKeys.has(key)) return false
          seenGoogleKeys.add(key)
          return true
        })
        return [...h, ...o, ...uniqueGoogle]
      })
    }

    const promises: Promise<void>[] = []

    if (sources.herbe) {
      promises.push(
        fetch(`/api/activities?persons=${codes}&${dateParam}`)
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json()
              if (Array.isArray(data)) {
                loaded.herbe = data
              } else {
                loaded.herbe = data.activities ?? []
                if (data.staleConnections?.length) {
                  icsWarnings.push(`ERP ${data.staleConnections.join(', ')} using cached data (connection unreachable)`)
                }
              }
            } else {
              const e = await res.json().catch(() => null)
              errors.push(`ERP: ${e?.error ?? res.status}`)
            }
            mergeAndSetActivities()
          })
          .catch(e => { errors.push(`ERP: ${e}`) })
      )
    }

    if (sources.azure) {
      promises.push(
        fetch(`/api/outlook?persons=${codes}&${dateParam}${bustIcsCache ? '&bustIcsCache=1' : ''}`)
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json()
              if (Array.isArray(data)) {
                loaded.outlook = data
              } else {
                loaded.outlook = data.activities ?? []
                if (data.warnings?.length) icsWarnings.push(...data.warnings)
              }
            } else {
              const e = await res.json().catch(() => null)
              errors.push(`Outlook: ${e?.error ?? res.status}`)
            }
            mergeAndSetActivities()
          })
          .catch(e => { errors.push(`Outlook: ${e}`) })
      )
    }

    // Always call Google route — it handles domain-wide, per-user OAuth, AND shared calendars
    promises.push(
      fetch(`/api/google?persons=${codes}&${dateParam}`)
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json()
            if (Array.isArray(data)) {
              loaded.google = data
            } else {
              loaded.google = data.activities ?? []
              if (data.warnings?.length) icsWarnings.push(...data.warnings)
            }
          } else {
            const e = await res.json().catch(() => null)
            // Don't report error if Google just isn't configured
            if (e?.error !== 'Google not configured') errors.push(`Google: ${e?.error ?? res.status}`)
          }
          mergeAndSetActivities()
        })
        .catch(e => { errors.push(`Google: ${e}`) })
    )

    // Fetch holidays for the visible date range (fire-and-forget alongside activity fetches)
    const personCodes = state.selectedPersons.map(p => p.code).join(',')
    if (personCodes) {
      fetch(`/api/holidays?persons=${personCodes}&dateFrom=${dateFrom}&dateTo=${dateTo}`)
        .then(r => r.ok ? r.json() : { dates: {}, personCountries: {} })
        .then(data => setHolidays(data.dates ? data : { dates: data, personCountries: {} }))
        .catch(() => setHolidays({ dates: {}, personCountries: {} }))
    }

    // Wait for all to finish for final status
    await Promise.all(promises)

    // If a newer fetch for a different date range started, discard these results
    if (activeFetchKeyRef.current !== cacheKey) return

    // Final status
    const parts: string[] = []
    if (sources.herbe) parts.push(`${(loaded.herbe ?? []).length} ERP`)
    if (sources.azure) parts.push(`${(loaded.outlook ?? []).length} Outlook`)
    {
      const googleEvents = loaded.google ?? []
      const uniqueCount = new Set(googleEvents.map(a => `${a.id}:${a.personCode}`)).size
      if (uniqueCount > 0 || sources.google) parts.push(`${uniqueCount} Google`)
    }
    let statusMsg = parts.join(' + ') + ' activities'
    if (errors.length > 0) statusMsg += ` | ${errors.join('; ')}`
    if (icsWarnings.length > 0) statusMsg += ` | ⚠ ${icsWarnings.join('; ')}`
    setStatus({ msg: statusMsg, ok: errors.length === 0 && icsWarnings.length === 0 })

    // Cache the result
    activityCacheRef.current.set(cacheKey, { data: [...(loaded.herbe ?? []), ...(loaded.outlook ?? []), ...(loaded.google ?? [])], ts: Date.now() })
    if (activityCacheRef.current.size > 20) {
      const firstKey = activityCacheRef.current.keys().next().value
      if (firstKey) activityCacheRef.current.delete(firstKey)
    }

    setLoading(false)

    // Prefetch adjacent date ranges in the background for instant navigation (skip for month view — range already large)
    if (state.view === 'month') { setLoading(false); return }
    const viewDays = state.view === '7day' ? 7 : state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
    const prefetchDates = [
      format(addDays(parseISO(dateFrom), -viewDays), 'yyyy-MM-dd'),
      format(addDays(parseISO(dateTo), 1), 'yyyy-MM-dd'),
    ]
    for (const pfDate of prefetchDates) {
      const pfTo = format(addDays(parseISO(pfDate), viewDays - 1), 'yyyy-MM-dd')
      const pfKey = `${codes}:${pfDate}:${pfTo}`
      if (activityCacheRef.current.has(pfKey)) continue
      const pfParam = pfDate === pfTo ? `date=${pfDate}` : `dateFrom=${pfDate}&dateTo=${pfTo}`
      // Fire-and-forget prefetch
      Promise.all([
        sources.herbe ? fetch(`/api/activities?persons=${codes}&${pfParam}`).then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) ? d : d.activities ?? []) : Promise.resolve([]),
        sources.azure ? fetch(`/api/outlook?persons=${codes}&${pfParam}`).then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) ? d : d.activities ?? []) : Promise.resolve([]),
        sources.google ? fetch(`/api/google?persons=${codes}&${pfParam}`).then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) ? d : d.activities ?? []) : Promise.resolve([]),
      ]).then(([h, o, g]) => {
        activityCacheRef.current.set(pfKey, { data: [...h, ...o, ...g], ts: Date.now() })
      }).catch(() => {})
    }
  // For month view, only refetch when the MONTH changes (not every day click within the same month)
  }, [selectedCodesKey, state.view === 'month' ? state.date.slice(0, 7) : state.date, state.view, sources.herbe, sources.azure, sources.google]) // eslint-disable-line react-hooks/exhaustive-deps

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
      fetch('/api/items?all=1').then(r => r.ok ? r.json() : []).then(setAllItems).catch(() => {}),
    ]).then(() => setStatus(s => s?.msg === 'Loading customers & projects…' ? null : s))
  }, [sources.herbe])

  // Fetch user's ICS calendars for the source list
  useEffect(() => {
    fetch('/api/settings/calendars')
      .then(r => r.ok ? r.json() : [])
      .then((cals: { name: string; color?: string; personCode: string; sharing?: string }[]) => setUserIcsCalendars(cals))
      .catch(() => {})
    fetch('/api/google/calendars').then(r => r.ok ? r.json() : []).then(setUserGoogleAccounts).catch(() => {})
  }, [])

  // Fetch tasks on mount or after a change. `silent` suppresses the loading
  // spinner for post-save background refreshes. `source` scopes the fetch to
  // a single channel — editing a Google task should not wait on the ERP
  // fetch, which takes tens of seconds. `live` bypasses the server's cache
  // and forces a fresh upstream fetch, used by the manual refresh button.
  const loadTasks = useCallback(async (silent = false, source?: TaskSource, live = false) => {
    if (!silent) setTasksLoading(true)
    try {
      const params = new URLSearchParams()
      if (source) params.set('source', source)
      if (live) params.set('live', '1')
      const url = params.toString() ? `/api/tasks?${params.toString()}` : '/api/tasks'
      const res = await fetch(url)
      if (!res.ok) {
        console.warn('[CalendarShell] /api/tasks non-ok:', res.status)
        return
      }
      const body = await res.json() as {
        tasks: Task[]
        configured: Partial<Record<TaskSource, boolean>>
        errors: { source: TaskSource; msg: string; stale?: boolean }[]
        timings?: Partial<Record<TaskSource, number>>
      }
      console.log('[CalendarShell] tasks loaded:', body.tasks.length, 'configured:', body.configured, 'errors:', body.errors, 'timings:', body.timings, 'source:', source ?? 'all')
      if (body.timings) {
        const parts = Object.entries(body.timings).map(([s, ms]) => `${s} ${ms}ms`).join(' · ')
        if (parts) setStatus({ msg: `Tasks: ${parts}`, ok: (body.errors?.length ?? 0) === 0 })
      }
      if (source) {
        // Merge — preserve tasks/configured/errors from other sources.
        setTasks(prev => [...prev.filter(t => t.source !== source), ...body.tasks])
        setTaskSources(prev => ({ ...prev, ...body.configured }))
        setTaskErrors(prev => [...prev.filter(e => e.source !== source), ...body.errors])
      } else {
        setTasks(body.tasks)
        setTaskSources({
          herbe: body.configured.herbe ?? false,
          outlook: body.configured.outlook ?? false,
          google: body.configured.google ?? false,
        })
        setTaskErrors(body.errors)
      }
    } catch (e) {
      console.warn('[CalendarShell] /api/tasks failed:', e)
    } finally {
      if (!silent) setTasksLoading(false)
    }
  }, [])

  useEffect(() => { loadTasks() }, [loadTasks])

  // Task handlers
  async function handleToggleTaskDone(task: Task, done: boolean) {
    const prev = tasks
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, done } : t))
    const sourceId = task.id.split(':', 2)[1]
    const body: Record<string, unknown> = { done }
    if (task.source === 'herbe') body.connectionId = task.sourceConnectionId
    try {
      const res = await fetch(`/api/tasks/${task.source}/${sourceId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        const msg = errBody?.error ?? `status ${res.status}`
        throw new Error(String(msg))
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('task toggle failed:', msg)
      setTasks(prev)
      // Surface the error so the user sees WHY the check didn't stick.
      setStatus({ msg: `Could not mark task as ${done ? 'done' : 'not done'}: ${msg}`, ok: false })
    }
  }

  function activityShapeFromTask(task: Task, asEvent = false): Partial<Activity> {
    // Tasks are personal — the signed-in user is always the MainPerson.
    // Without this, the form falls through to the calendar's selectedPersons.
    const shape: Partial<Activity> = {
      source: task.source === 'herbe' ? 'herbe' : task.source,
      description: task.title,
      textInMatrix: task.description ?? task.erp?.textInMatrix,
      date: task.dueDate ?? format(new Date(), 'yyyy-MM-dd'),
      personCode: userCode,
      mainPersons: [userCode],
      ccPersons: task.ccPersons ?? [],
      activityTypeCode: task.erp?.activityTypeCode,
      projectCode: task.erp?.projectCode,
      projectName: task.erp?.projectName,
      customerCode: task.erp?.customerCode,
      customerName: task.erp?.customerName,
      erpConnectionId: task.sourceConnectionId,
      done: task.done,
    }
    if (asEvent) return shape
    return shape
  }

  function handleEditTask(task: Task) {
    setFormState({
      open: true,
      initial: activityShapeFromTask(task),
      editId: task.id,
      canEdit: true,
      mode: 'task',
    })
  }

  function handleCopyTaskToEvent(task: Task) {
    setFormState({
      open: true,
      initial: activityShapeFromTask(task, true),
      canEdit: true,
      mode: 'event',
    })
  }

  function handleCopyTaskAsTask(task: Task) {
    // Duplicate: same shape as the source task, no editId (treated as create),
    // and force done=false so the new task starts open.
    setFormState({
      open: true,
      initial: { ...activityShapeFromTask(task), done: false },
      canEdit: true,
      mode: 'task',
    })
  }

  function handleCreateTask(source: TaskSource) {
    const initial: Partial<Activity> = {
      personCode: userCode,
      mainPersons: [userCode],
    }
    if (source === 'outlook') initial.source = 'outlook'
    else if (source === 'google') initial.source = 'google'
    else initial.source = 'herbe'
    setFormState({ open: true, initial, canEdit: true, mode: 'task' })
  }

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-bg">
      <CalendarHeader
        state={state}
        onStateChange={setState}
        people={people}
        onNewActivity={() => setFormState({ open: true, initial: { date: state.date } })}
        onRefresh={() => { fetchActivities(true); reloadColorData(true); loadTasks(false, undefined, true) }}
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
        accountName={accountName}
        onAccountSwitch={() => setAccountSwitcherOpen(true)}
        isAdmin={isAdmin}
        userEmail={userEmail}
        accountLogo={accountLogo}
        monthSelectedDay={monthSelectedDay}
      />
      {state.view === 'month' ? (
        <MonthView
          activities={visibleActivities}
          date={state.date}
          holidays={holidays}
          personCode={state.selectedPersons[0]?.code ?? userCode}
          personCount={state.selectedPersons.length}
          getActivityColor={colorForActivity}
          onSelectDate={(date) => setState(s => ({ ...s, view: 'day', date }))}
          onSelectWeek={(monday) => setState(s => ({ ...s, view: '7day', date: monday }))}
          onSelectedDayChange={(day) => {
            setMonthSelectedDay(day)
            setState(s => ({ ...s, date: day }))
          }}
          loading={loading}
          isLightMode={isLightMode}
          onNavigateMonth={(dir) => {
            setState(s => ({
              ...s,
              date: format(dir > 0 ? addMonths(parseISO(s.date), 1) : subMonths(parseISO(s.date), 1), 'yyyy-MM-dd'),
            }))
          }}
          onActivityClick={(activity) =>
            setFormState({
              open: true,
              initial: activity,
              editId: activity.id,
              canEdit: canEditActivity(activity)
            })
          }
          tasks={tasks}
          tasksLoading={tasksLoading}
          taskSources={taskSources}
          taskErrors={taskErrors}
          tasksTab={tasksTab}
          onTasksTabChange={setTasksTab}
          onToggleTaskDone={handleToggleTaskDone}
          onEditTask={handleEditTask}
          onCopyTaskAsTask={handleCopyTaskAsTask}
          onCopyTaskToEvent={handleCopyTaskToEvent}
          onCreateTask={handleCreateTask}
          dayViewPanel={(
            <CalendarGrid
              state={{ ...state, view: 'day', date: monthSelectedDay }}
              activities={visibleActivities}
              loading={loading}
              holidays={holidays}
              sessionUserCode={userCode}
              getActivityColor={colorForActivity}
              getTypeName={getTypeName}
              scale={zoom}
              isLightMode={isLightMode}
              onRefresh={() => { fetchActivities(true); reloadColorData(true); loadTasks(false, undefined, true) }}
              onNavigate={() => {}}
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
          )}
        />
      ) : (
        <CalendarGrid
          state={state}
          activities={visibleActivities}
          loading={loading}
          holidays={holidays}
          sessionUserCode={userCode}
          getActivityColor={colorForActivity}
          getTypeName={getTypeName}
          scale={zoom}
          isLightMode={isLightMode}
          onRefresh={() => { fetchActivities(true); reloadColorData(true); loadTasks(false, undefined, true) }}
          onNavigate={(dir) => {
            const step = state.view === '7day' ? 7 : state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
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
          onSwitchToMonth={() => setState(s => ({ ...s, view: 'month' }))}
        />
      )}
      {status && state.view !== 'month' && (
        <div
          className={`substrip tone-${status.ok === false ? 'error' : status.ok === true ? 'ok' : 'info'}`}
        >
          <div className="ss-primary">
            <span className={`ss-dot ${status.ok === false ? 'error' : status.ok === true ? '' : 'info'}`} />
            <span className="ss-detail">{status.msg}</span>
          </div>
        </div>
      )}

      {shortcutsOpen && (
        <KeyboardShortcutsModal onClose={() => setShortcutsOpen(false)} />
      )}

      {accountSwitcherOpen && (
        <AccountSwitcher currentAccountId={accountId} onClose={() => setAccountSwitcherOpen(false)} />
      )}

      {colorSettingsOpen && (
        <SettingsModal
          classGroups={classGroups}
          colorMap={classGroupToColor}
          persons={people}
          connections={erpConnections}
          colorOverrides={dbColorOverrides}
          error={classGroupsError}
          onClose={() => {
            setColorSettingsOpen(false)
            // Refetch calendar data in case sharing or other settings changed
            fetch('/api/google/calendars').then(r => r.ok ? r.json() : []).then(setUserGoogleAccounts).catch(() => {})
            fetch('/api/settings/calendars').then(r => r.ok ? r.json() : []).then(setUserIcsCalendars).catch(() => {})
          }}
          onColorChange={(groupCode, color) => {
            setColorOverrides(prev => ({ ...prev, [groupCode]: color }))
          }}
          onColorOverridesChange={() => {
            fetch('/api/settings/colors').then(r => r.json()).then(rows => {
              setDbColorOverrides(Array.isArray(rows) ? rows : [])
            }).catch(() => {})
          }}
          azureConfigured={sources.azure}
          googleConfigured={sources.google}
          zoomConfigured={sources.zoom}
        />
      )}

      {formState.open && (
        <ActivityForm
          initial={formState.initial}
          editId={formState.editId}
          mode={formState.mode ?? 'event'}
          people={people}
          defaultPersonCode={userCode}
          defaultPersonCodes={state.selectedPersons.map(p => p.code)}
          allActivities={activities}
          onClose={() => setFormState({ open: false })}
          onSaved={(taskInfo) => {
            if (formState.mode === 'task') {
              if (taskInfo?.patch) {
                // Optimistic update — merge the edited fields into the local
                // task so the sidebar reflects the change immediately; the
                // background refetch below reconciles with server truth.
                setTasks(prev => prev.map(t => t.id === taskInfo.patch!.taskId ? { ...t, ...taskInfo.patch!.fields } : t))
              }
              loadTasks(true, taskInfo?.source)
            } else {
              fetchActivities(true)
            }
          }}
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
          allItems={allItems}
          erpConnections={erpConnections}
          zoomConfigured={sources.zoom ?? false}
        />
      )}

      {/* FAB — mobile only, hidden when form is open */}
      {!formState.open && (
        <div
          className="fixed bottom-5 right-5 z-50 lg:hidden flex items-center overflow-hidden"
          style={{
            background: 'var(--app-accent)',
            borderRadius: 999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.15)',
          }}
        >
          <button
            onClick={toggleZoom}
            className="w-11 h-11 flex items-center justify-center"
            style={{ color: '#fff', background: 'rgba(255,255,255,0.10)', borderRight: '1px solid rgba(255,255,255,0.22)' }}
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
            className="w-11 h-11 flex items-center justify-center"
            style={{ color: '#fff', fontSize: 22, fontWeight: 700, lineHeight: 1 }}
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
