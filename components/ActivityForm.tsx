'use client'
import { useState, useEffect } from 'react'
import { Activity, ActivityType, SearchResult, Person } from '@/types'
import ErrorBanner from './ErrorBanner'
import { format } from 'date-fns'

interface Props {
  initial?: Partial<Activity>
  editId?: string
  people: Person[]
  defaultPersonCode: string
  todayActivities: Activity[]
  onClose: () => void
  onSaved: () => void
  onDuplicate: (initial: Partial<Activity>) => void
  canEdit?: boolean  // if true, show edit/delete controls; undefined treated as true for create mode
}

export default function ActivityForm({
  initial, editId, people, defaultPersonCode, todayActivities, onClose, onSaved, onDuplicate, canEdit = true
}: Props) {
  const isEdit = !!editId

  const [source, setSource] = useState<'herbe' | 'outlook'>(initial?.source ?? 'herbe')
  const [selectedPersonCodes, setSelectedPersonCodes] = useState<string[]>(
    initial?.personCode ? [initial.personCode] : [defaultPersonCode]
  )
  const [description, setDescription] = useState(initial?.description ?? '')
  const [date, setDate] = useState(initial?.date ?? format(new Date(), 'yyyy-MM-dd'))
  const [timeFrom, setTimeFrom] = useState(initial?.timeFrom ?? smartDefaultStart())
  const [timeTo, setTimeTo] = useState(initial?.timeTo ?? '')
  const [activityTypeCode, setActivityTypeCode] = useState(initial?.activityTypeCode ?? '')
  const [projectCode, setProjectCode] = useState(initial?.projectCode ?? '')
  const [projectName, setProjectName] = useState(initial?.projectName ?? '')
  const [customerCode, setCustomerCode] = useState(initial?.customerCode ?? '')
  const [customerName, setCustomerName] = useState(initial?.customerName ?? '')
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([])
  const [projectResults, setProjectResults] = useState<SearchResult[]>([])
  const [customerResults, setCustomerResults] = useState<SearchResult[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Load activity types on mount
  useEffect(() => {
    fetch('/api/activity-types')
      .then(r => r.json())
      .then((types: Record<string, unknown>[]) => {
        setActivityTypes(types.map(t => ({ code: t['Code'] as string, name: t['Name'] as string })))
      })
      .catch(console.error)
  }, [])

  function smartDefaultStart(): string {
    const todayForPerson = todayActivities
      .filter(a => a.personCode === defaultPersonCode)
      .sort((a, b) => b.timeTo.localeCompare(a.timeTo))
    return todayForPerson[0]?.timeTo ?? '09:00'
  }

  async function searchProjects(q: string) {
    if (q.length < 2) { setProjectResults([]); return }
    const res = await fetch(`/api/projects?q=${encodeURIComponent(q)}`)
    const data = await res.json() as Record<string, unknown>[]
    setProjectResults(data.map(d => ({ code: d['Code'] as string, name: d['Name'] as string })))
  }

  async function searchCustomers(q: string) {
    if (q.length < 2) { setCustomerResults([]); return }
    const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`)
    const data = await res.json() as Record<string, unknown>[]
    setCustomerResults(data.map(d => ({ code: d['Code'] as string, name: d['Name'] as string })))
  }

  function buildHerbePayload() {
    return {
      Description: description,
      Date: date,
      TimeFrom: timeFrom,
      TimeTo: timeTo,
      ActivityType: activityTypeCode || undefined,
      Project: projectCode || undefined,
      Customer: customerCode || undefined,
      AccessGroup: selectedPersonCodes.join(','),
    }
  }

  function buildOutlookPayload() {
    return {
      subject: description,
      start: { dateTime: `${date}T${timeFrom}:00`, timeZone: 'Europe/Riga' },
      end: { dateTime: `${date}T${timeTo}:00`, timeZone: 'Europe/Riga' },
      attendees: selectedPersonCodes
        .map(code => people.find(p => p.code === code))
        .filter((p): p is Person => !!p)
        .map(p => ({ emailAddress: { address: p.email, name: p.name }, type: 'required' })),
    }
  }

  async function handleSave() {
    const errs: string[] = []
    if (!description.trim()) errs.push('Description is required')
    if (!timeFrom) errs.push('Start time is required')
    if (!timeTo) errs.push('End time is required')
    if (timeFrom && timeTo && timeFrom >= timeTo) errs.push('End time must be after start time')
    if (errs.length) { setErrors(errs); return }

    setSaving(true)
    setErrors([])

    try {
      const url = source === 'herbe'
        ? (isEdit ? `/api/activities/${editId}` : '/api/activities')
        : (isEdit ? `/api/outlook/${editId}` : '/api/outlook')
      const method = isEdit ? 'PUT' : 'POST'
      const body = source === 'herbe' ? buildHerbePayload() : buildOutlookPayload()

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        const apiErrors = Array.isArray(data?.errors)
          ? data.errors.map((e: { message?: string }) => e.message ?? String(e))
          : [data?.error ?? `Server error (${res.status})`]
        setErrors(apiErrors)
        setSaving(false)
        return
      }

      onSaved()
      onClose()
    } catch (e) {
      setErrors([String(e)])
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editId) return
    setSaving(true)
    try {
      const url = source === 'herbe' ? `/api/activities/${editId}` : `/api/outlook/${editId}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setErrors([data?.error ?? `Delete failed (${res.status})`])
        setSaving(false)
        return
      }
      onSaved()
      onClose()
    } catch (e) {
      setErrors([String(e)])
      setSaving(false)
    }
  }

  function handleDuplicate() {
    onClose()
    onDuplicate({
      source,
      personCode: selectedPersonCodes[0],
      description,
      date,
      activityTypeCode,
      projectCode,
      projectName,
      customerCode,
      customerName,
      // timeFrom and timeTo intentionally omitted — user sets them on the new form
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-bold">{isEdit ? 'Edit Activity' : 'New Activity'}</h2>
          <button onClick={onClose} className="text-text-muted text-xl leading-none">✕</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {/* Source toggle (create only) */}
          {!isEdit && (
            <div className="flex rounded overflow-hidden border border-border text-sm font-bold">
              {(['herbe', 'outlook'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={`flex-1 py-2 ${source === s ? 'bg-primary text-white' : 'text-text-muted'}`}
                >
                  {s === 'herbe' ? 'Herbe ERP' : 'Outlook'}
                </button>
              ))}
            </div>
          )}

          <ErrorBanner errors={errors} />

          {/* Person(s) */}
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Person(s)</label>
            <div className="flex flex-wrap gap-1">
              {people.map(p => {
                const sel = selectedPersonCodes.includes(p.code)
                return (
                  <button
                    key={p.code}
                    onClick={() => setSelectedPersonCodes(prev =>
                      sel ? prev.filter(c => c !== p.code) : [...prev, p.code]
                    )}
                    className={`px-2 py-0.5 rounded-full text-xs font-bold border transition-colors ${
                      sel ? 'bg-primary/20 border-primary text-primary' : 'border-border text-text-muted'
                    }`}
                  >
                    {p.code}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Description</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              placeholder="What are you working on?"
            />
          </div>

          {/* Date + Time From + Time To */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">From</label>
              <input
                type="time"
                value={timeFrom}
                onChange={e => setTimeFrom(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">To</label>
              <input
                type="time"
                value={timeTo}
                onChange={e => setTimeTo(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Activity type (Herbe only) */}
          {source === 'herbe' && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Activity Type</label>
              <select
                value={activityTypeCode}
                onChange={e => setActivityTypeCode(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">— select type —</option>
                {activityTypes.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
            </div>
          )}

          {/* Project (Herbe only) */}
          {source === 'herbe' && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Project</label>
              <input
                value={projectName}
                onChange={e => { setProjectName(e.target.value); setProjectCode(''); searchProjects(e.target.value) }}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                placeholder="Type to search… (min 2 chars)"
              />
              {projectResults.length > 0 && (
                <div className="bg-bg border border-border rounded-lg mt-1 max-h-32 overflow-y-auto">
                  {projectResults.map(r => (
                    <button
                      key={r.code}
                      onClick={() => { setProjectCode(r.code); setProjectName(r.name); setProjectResults([]) }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-border"
                    >
                      {r.name} <span className="text-text-muted text-xs">({r.code})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Customer (Herbe only) */}
          {source === 'herbe' && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Customer</label>
              <input
                value={customerName}
                onChange={e => { setCustomerName(e.target.value); setCustomerCode(''); searchCustomers(e.target.value) }}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                placeholder="Type to search… (min 2 chars)"
              />
              {customerResults.length > 0 && (
                <div className="bg-bg border border-border rounded-lg mt-1 max-h-32 overflow-y-auto">
                  {customerResults.map(r => (
                    <button
                      key={r.code}
                      onClick={() => { setCustomerCode(r.code); setCustomerName(r.name); setCustomerResults([]) }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-border"
                    >
                      {r.name} <span className="text-text-muted text-xs">({r.code})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-border space-y-2">
          {/* If editing but canEdit is false, show close only */}
          {isEdit && !(canEdit ?? true) ? (
            <button onClick={onClose} className="w-full border border-border text-text-muted font-bold py-3 rounded-xl">
              Close
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-primary text-white font-bold py-3 rounded-xl disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create activity'}
            </button>
          )}

          {isEdit && (canEdit ?? true) && (
            <div className="flex gap-2">
              <button
                onClick={handleDuplicate}
                className="flex-1 border border-border text-text-muted font-bold py-2 rounded-xl text-sm"
              >
                Duplicate
              </button>
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex-1 border border-red-800 text-red-400 font-bold py-2 rounded-xl text-sm"
                >
                  Delete
                </button>
              ) : (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex-1 bg-red-800 text-white font-bold py-2 rounded-xl text-sm"
                >
                  Confirm delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
