'use client'
import { useState, useEffect, useCallback } from 'react'
import { format, addDays, parseISO } from 'date-fns'
import { Person, Activity, CalendarState } from '@/types'
import CalendarHeader from './CalendarHeader'
import CalendarGrid from './CalendarGrid'
import ActivityForm from './ActivityForm'

interface Props { userCode: string }

export default function CalendarShell({ userCode }: Props) {
  const [people, setPeople] = useState<Person[]>([])
  const [state, setState] = useState<CalendarState>({
    view: 'day',
    date: format(new Date(), 'yyyy-MM-dd'),
    selectedPersons: [],
  })
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(false)
  const [formState, setFormState] = useState<{
    open: boolean
    initial?: Partial<Activity>
    editId?: string
  }>({ open: false })

  // Load people list on mount
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then((users: Record<string, unknown>[]) => {
        const list: Person[] = users.map(u => ({
          code: u['Code'] as string,
          name: u['Name'] as string,
          email: u['Email'] as string,
        }))
        setPeople(list)
        // Default: show logged-in user
        const me = list.find(p => p.code === userCode)
        if (me) setState(s => ({ ...s, selectedPersons: [me] }))
      })
      .catch(console.error)
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

    try {
      const [herbeRes, outlookRes] = await Promise.all([
        fetch(`/api/activities?persons=${codes}&${dateParam}`),
        fetch(`/api/outlook?persons=${codes}&${dateParam}`),
      ])
      const herbe = herbeRes.ok ? await herbeRes.json() : []
      const outlook = outlookRes.ok ? await outlookRes.json() : []
      setActivities([...herbe, ...outlook])
    } catch (e) {
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
          setFormState({ open: true, initial: activity, editId: activity.id })
        }
        onActivityUpdate={fetchActivities}
      />
      {formState.open && (
        <ActivityForm
          initial={formState.initial}
          editId={formState.editId}
          people={people}
          defaultPersonCode={userCode}
          todayActivities={activities.filter(a => a.date === state.date)}
          onClose={() => setFormState({ open: false })}
          onSaved={fetchActivities}
          onDuplicate={(dup) => setFormState({ open: true, initial: dup })}
        />
      )}
    </div>
  )
}
