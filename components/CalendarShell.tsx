'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { format, addDays, parseISO } from 'date-fns'
import { Person, Activity, CalendarState } from '@/types'
import CalendarHeader from './CalendarHeader'
import CalendarGrid from './CalendarGrid'
import ActivityForm from './ActivityForm'

interface Props { userCode: string }

export default function CalendarShell({ userCode }: Props) {
  const [people, setPeople] = useState<Person[]>([])
  const peopleLoadedRef = useRef(false)
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
  const [formState, setFormState] = useState<{
    open: boolean
    initial?: Partial<Activity>
    editId?: string
    canEdit?: boolean
  }>({ open: false })

  function canEditActivity(activity: Activity): boolean {
    if (activity.source === 'outlook') return !!activity.isOrganizer
    if (!activity.accessGroup) return activity.personCode === userCode
    return activity.personCode === userCode ||
      activity.accessGroup.split(',').map(s => s.trim()).includes(userCode)
  }

  // Persist state to localStorage (only after people have loaded, to avoid overwriting saved person codes on mount)
  useEffect(() => {
    if (!peopleLoadedRef.current) return
    try {
      localStorage.setItem('calendarState', JSON.stringify({
        view: state.view,
        date: state.date,
        personCodes: state.selectedPersons.map(p => p.code),
      }))
    } catch {}
  }, [state.view, state.date, state.selectedPersons])

  // Load people list on mount
  useEffect(() => {
    setStatus({ msg: 'Loading users from Herbe ERP…' })
    fetch('/api/users')
      .then(r => r.json())
      .then((users: Record<string, unknown>[]) => {
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
      .catch(e => setStatus({ msg: `Failed to load users: ${e}`, ok: false }))
  }, [userCode])

  const fetchActivities = useCallback(async () => {
    if (!state.selectedPersons.length) return
    setLoading(true)
    const codes = state.selectedPersons.map(p => p.code).join(',')
    const dateFrom = state.date
    const dateTo = state.view === '3day'
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
      const herbe: Activity[] = herbeRes.ok ? await herbeRes.json() : []
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

      const herbeErr = !herbeRes.ok ? ` | Herbe error ${herbeRes.status}` : ''
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

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg">
      <CalendarHeader
        state={state}
        onStateChange={setState}
        people={people}
        onNewActivity={() => setFormState({ open: true })}
        onRefresh={fetchActivities}
      />
      <CalendarGrid
        state={state}
        activities={activities}
        loading={loading}
        sessionUserCode={userCode}
        onRefresh={fetchActivities}
        onSlotClick={(personCode, time) =>
          setFormState({ open: true, initial: { personCode, timeFrom: time, date: state.date } })
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
      />
      {status && (
        <div className={`px-3 py-1 text-xs font-mono border-t shrink-0 ${
          status.ok === false
            ? 'bg-red-900/30 border-red-700/50 text-red-300'
            : status.ok === true
            ? 'bg-green-900/20 border-green-700/30 text-green-400'
            : 'bg-surface border-border text-text-muted'
        }`}>
          {status.ok === false ? '✗ ' : status.ok === true ? '✓ ' : '⟳ '}{status.msg}
        </div>
      )}

      {formState.open && (
        <ActivityForm
          initial={formState.initial}
          editId={formState.editId}
          people={people}
          defaultPersonCode={userCode}
          defaultPersonCodes={state.selectedPersons.map(p => p.code)}
          todayActivities={activities.filter(a => a.date === state.date)}
          onClose={() => setFormState({ open: false })}
          onSaved={fetchActivities}
          onDuplicate={(dup) => setFormState({ open: true, initial: dup })}
          canEdit={formState.canEdit}
        />
      )}
    </div>
  )
}
