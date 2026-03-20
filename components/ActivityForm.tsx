'use client'
import { useState, useEffect, useRef } from 'react'
import { Activity, ActivityType, SearchResult, Person } from '@/types'
import ErrorBanner from './ErrorBanner'
import { format } from 'date-fns'

interface Props {
  initial?: Partial<Activity>
  editId?: string
  people: Person[]
  defaultPersonCode: string
  defaultPersonCodes?: string[]
  todayActivities: Activity[]
  onClose: () => void
  onSaved: () => void
  onDuplicate: (initial: Partial<Activity>) => void
  canEdit?: boolean  // if true, show edit/delete controls; undefined treated as true for create mode
}

export default function ActivityForm({
  initial, editId, people, defaultPersonCode, defaultPersonCodes, todayActivities, onClose, onSaved, onDuplicate, canEdit = true
}: Props) {
  const isEdit = !!editId
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [source, setSource] = useState<'herbe' | 'outlook'>(initial?.source ?? 'herbe')
  const [selectedPersonCodes, setSelectedPersonCodes] = useState<string[]>(
    isEdit && initial?.mainPersons?.length
      ? initial.mainPersons
      : initial?.personCode
      ? [initial.personCode]
      : (defaultPersonCodes?.length ? defaultPersonCodes : [defaultPersonCode])
  )
  const [description, setDescription] = useState(initial?.description ?? '')
  const [date, setDate] = useState(initial?.date ?? format(new Date(), 'yyyy-MM-dd'))
  const [timeFrom, setTimeFrom] = useState(initial?.timeFrom ?? smartDefaultStart())
  const [timeTo, setTimeTo] = useState(initial?.timeTo ?? '')
  const [activityTypeCode, setActivityTypeCode] = useState(initial?.activityTypeCode ?? '')
  const [activityTypeName, setActivityTypeName] = useState('')
  const [activityTypeResults, setActivityTypeResults] = useState<ActivityType[]>([])
  const [projectCode, setProjectCode] = useState(initial?.projectCode ?? '')
  const [projectName, setProjectName] = useState(initial?.projectName ?? '')
  const [customerCode, setCustomerCode] = useState(initial?.customerCode ?? '')
  const [customerName, setCustomerName] = useState(initial?.customerName ?? '')
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([])
  const [projectResults, setProjectResults] = useState<SearchResult[]>([])
  const [customerResults, setCustomerResults] = useState<SearchResult[]>([])
  const [searchingProjects, setSearchingProjects] = useState(false)
  const [searchingCustomers, setSearchingCustomers] = useState(false)
  const [projectSearchMsg, setProjectSearchMsg] = useState<string | null>(null)
  const [customerSearchMsg, setCustomerSearchMsg] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [savedActivity, setSavedActivity] = useState<Partial<Activity> | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Load activity types on mount
  useEffect(() => {
    fetch('/api/activity-types')
      .then(r => r.json())
      .then((types: Record<string, unknown>[]) => {
        const list = types.map(t => ({ code: t['Code'] as string, name: (t['Comment'] || t['Name'] || t['Code']) as string }))
        setActivityTypes(list)
        // Set display name for pre-selected type (edit mode)
        if (initial?.activityTypeCode) {
          const found = list.find(t => t.code === initial.activityTypeCode)
          if (found) setActivityTypeName(found.name)
        }
      })
      .catch(console.error)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  function filterActivityTypes(q: string) {
    const lower = q.toLowerCase()
    if (!lower) { setActivityTypeResults(activityTypes.slice(0, 10)); return }
    setActivityTypeResults(
      activityTypes.filter(t =>
        t.code.toLowerCase().startsWith(lower) ||
        t.name.toLowerCase().includes(lower)
      ).slice(0, 10)
    )
  }

  function smartDefaultStart(): string {
    const todayForPerson = todayActivities
      .filter(a => a.personCode === defaultPersonCode)
      .sort((a, b) => b.timeTo.localeCompare(a.timeTo))
    return todayForPerson[0]?.timeTo ?? '09:00'
  }

  async function searchProjects(q: string) {
    if (q.length < 2) { setProjectResults([]); setProjectSearchMsg(null); return }
    setSearchingProjects(true)
    setProjectSearchMsg(null)
    try {
      const res = await fetch(`/api/projects?q=${encodeURIComponent(q)}`)
      if (!res.ok) { setProjectSearchMsg(`Search error (${res.status})`); return }
      const data = await res.json() as Record<string, unknown>[]
      const results = data.map(d => ({
        code: String(d['Code'] ?? ''),
        name: String(d['Name'] ?? ''),
        customerCode: (d['CUCode'] as string | null) || undefined,
        customerName: (d['CUName'] as string | null) || undefined,
      })).filter(r => r.code)
      setProjectResults(results)
      if (results.length === 0) setProjectSearchMsg('No results')
      else (document.activeElement as HTMLElement)?.blur()
    } catch (e) {
      setProjectSearchMsg(String(e))
    } finally {
      setSearchingProjects(false)
    }
  }

  async function searchCustomers(q: string) {
    if (q.length < 2) { setCustomerResults([]); setCustomerSearchMsg(null); return }
    setSearchingCustomers(true)
    setCustomerSearchMsg(null)
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`)
      if (!res.ok) { setCustomerSearchMsg(`Search error (${res.status})`); return }
      const data = await res.json() as Record<string, unknown>[]
      const results = data.map(d => ({
        code: String(d['Code'] ?? d['CUCode'] ?? ''),
        name: String(d['Name'] ?? d['CUName'] ?? ''),
      })).filter(r => r.code)
      setCustomerResults(results)
      if (results.length === 0) setCustomerSearchMsg('No results')
      else (document.activeElement as HTMLElement)?.blur()
    } catch (e) {
      setCustomerSearchMsg(String(e))
    } finally {
      setSearchingCustomers(false)
    }
  }

  function buildHerbePayload() {
    return {
      Comment: description,
      TransDate: date,
      StartTime: timeFrom,
      EndTime: timeTo,
      ActType: activityTypeCode || undefined,
      PRCode: projectCode || undefined,
      CUCode: customerCode || undefined,
      MainPersons: selectedPersonCodes.join(','),
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

      // Extract the created activity ID from the response
      const createdId = !isEdit
        ? String(data?.SerNr ?? data?.id ?? '')
        : ''

      onSaved()
      setSavedActivity({
        id: createdId,
        source, personCode: selectedPersonCodes[0], description, date, timeFrom, timeTo,
        activityTypeCode, projectCode, projectName, customerCode, customerName,
      })
      setSaving(false)
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

  function resetToCreate(copy: Partial<Activity> | null) {
    setSavedActivity(null)
    setErrors([])
    if (copy) {
      setDescription(copy.description ?? '')
      setDate(copy.date ?? format(new Date(), 'yyyy-MM-dd'))
      setActivityTypeCode(copy.activityTypeCode ?? '')
      setProjectCode(copy.projectCode ?? '')
      setProjectName(copy.projectName ?? '')
      setCustomerCode(copy.customerCode ?? '')
      setCustomerName(copy.customerName ?? '')
    } else {
      setDescription('')
      setActivityTypeCode('')
      setProjectCode('')
      setProjectName('')
      setCustomerCode('')
      setCustomerName('')
    }
    if (copy) {
      setTimeFrom('')
      setTimeTo('')
    } else {
      // Same smart default as initial New Activity open
      setTimeFrom(smartDefaultStart())
      setTimeTo('')
    }
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
          <div>
            <h2 className="font-bold">{isEdit ? 'Edit Activity' : 'New Activity'}</h2>
            {isEdit && editId && (
              <p className="text-[11px] text-text-muted font-mono">#{editId}</p>
            )}
          </div>
          <button onClick={onClose} className="text-text-muted text-xl leading-none">✕</button>
        </div>

        {/* Success state */}
        {savedActivity && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center">
            <div className="text-4xl">✓</div>
            <p className="text-green-400 font-bold text-lg">
              {isEdit ? 'Activity updated' : 'Activity created'}
            </p>
            {savedActivity.id && (
              <p className="text-text-muted text-xs font-mono">#{savedActivity.id}</p>
            )}
            <p className="text-text-muted text-sm">{savedActivity.description}</p>
            {savedActivity.joinUrl && (
              <a
                href={savedActivity.joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#464EB8] text-white font-bold text-sm"
              >
                Join Teams call
              </a>
            )}
            <div className="w-full space-y-2 pt-2">
              {!isEdit && (
                <>
                  <button
                    onClick={() => resetToCreate(savedActivity)}
                    className="w-full border border-border text-text font-bold py-3 rounded-xl text-sm"
                  >
                    Create another (copy)
                  </button>
                  <button
                    onClick={() => resetToCreate(null)}
                    className="w-full border border-border text-text-muted font-bold py-3 rounded-xl text-sm"
                  >
                    Create blank
                  </button>
                </>
              )}
              <button onClick={onClose} className="w-full bg-primary text-white font-bold py-3 rounded-xl">
                Close
              </button>
            </div>
          </div>
        )}

        {/* Scrollable body */}
        {!savedActivity && <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {/* Teams join button (Outlook meetings only) */}
          {initial?.joinUrl && (
            <a
              href={initial.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#464EB8] text-white font-bold text-sm"
            >
              Join Teams call
            </a>
          )}

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
                onChange={e => {
                  const newFrom = e.target.value
                  if (timeFrom && timeTo && newFrom) {
                    const [oh, om] = timeFrom.split(':').map(Number)
                    const [nh, nm] = newFrom.split(':').map(Number)
                    const [th, tm] = timeTo.split(':').map(Number)
                    const delta = (nh * 60 + nm) - (oh * 60 + om)
                    const newToMins = th * 60 + tm + delta
                    if (newToMins > 0 && newToMins <= 24 * 60) {
                      setTimeTo(`${String(Math.floor(newToMins / 60)).padStart(2, '0')}:${String(newToMins % 60).padStart(2, '0')}`)
                    }
                  }
                  setTimeFrom(newFrom)
                }}
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

          {/* Duration quick-select */}
          {timeFrom && (() => {
            const DURATIONS = [
              { label: "5'", mins: 5 },
              { label: "10'", mins: 10 },
              { label: "15'", mins: 15 },
              { label: "30'", mins: 30 },
              { label: '1h', mins: 60 },
              { label: '1.5h', mins: 90 },
              { label: '2h', mins: 120 },
            ]
            const [fh, fm] = timeFrom.split(':').map(Number)
            const fromMins = fh * 60 + fm
            const currentDur = timeTo
              ? (() => { const [th, tm] = timeTo.split(':').map(Number); return th * 60 + tm - fromMins })()
              : null
            return (
              <div className="flex gap-1.5 flex-wrap -mt-1">
                {DURATIONS.map(({ label, mins }) => {
                  const active = currentDur === mins
                  const toMins = fromMins + mins
                  const hh = String(Math.floor(toMins / 60) % 24).padStart(2, '0')
                  const mm = String(toMins % 60).padStart(2, '0')
                  return (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setTimeTo(`${hh}:${mm}`)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                        active ? 'bg-primary/20 border-primary text-primary' : 'border-border text-text-muted hover:border-primary/50'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            )
          })()}

          {/* Activity type (Herbe only) */}
          {source === 'herbe' && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Activity Type</label>
              <input
                value={activityTypeName}
                onChange={e => { setActivityTypeName(e.target.value); setActivityTypeCode(''); filterActivityTypes(e.target.value) }}
                onFocus={() => { if (!activityTypeResults.length) filterActivityTypes(activityTypeName) }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLElement).blur() }}
                enterKeyHint="search"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                placeholder="Type code or name…"
              />
              {activityTypeCode && (
                <p className="text-[11px] text-text-muted mt-0.5">Code: <span className="font-mono text-primary">{activityTypeCode}</span></p>
              )}
              {activityTypeResults.length > 0 && (
                <div className="bg-bg border border-border rounded-lg mt-1 max-h-40 overflow-y-auto">
                  {activityTypeResults.map(t => (
                    <button
                      key={t.code}
                      onClick={() => {
                        setActivityTypeCode(t.code)
                        setActivityTypeName(t.name)
                        setActivityTypeResults([])
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-border flex items-center gap-2"
                    >
                      <span className="font-mono text-primary text-xs w-10 shrink-0">{t.code}</span>
                      <span>{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Project (Herbe only) */}
          {source === 'herbe' && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Project</label>
              <div className="relative">
                <input
                  value={projectName}
                  onChange={e => { setProjectName(e.target.value); setProjectCode(''); searchProjects(e.target.value) }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLElement).blur() }}
                  enterKeyHint="search"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary pr-8"
                  placeholder="Type to search… (min 2 chars)"
                />
                {searchingProjects && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-primary text-sm animate-spin inline-block">⟳</span>
                )}
              </div>
              {projectCode && (
                <p className="text-[11px] text-text-muted mt-0.5">Code: <span className="font-mono text-primary">{projectCode}</span></p>
              )}
              {projectSearchMsg && !searchingProjects && (
                <p className="text-[11px] text-text-muted mt-0.5">{projectSearchMsg}</p>
              )}
              {projectResults.length > 0 && (
                <div className="bg-bg border border-border rounded-lg mt-1 max-h-32 overflow-y-auto">
                  {projectResults.map(r => (
                    <button
                      key={r.code}
                      onClick={() => {
                        setProjectCode(r.code)
                        setProjectName(r.name)
                        setProjectResults([])
                        setProjectSearchMsg(null)
                        if (r.customerCode) {
                          setCustomerCode(r.customerCode)
                          setCustomerName(r.customerName ?? r.customerCode)
                        }
                      }}
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
              <div className="relative">
                <input
                  value={customerName}
                  onChange={e => { setCustomerName(e.target.value); setCustomerCode(''); searchCustomers(e.target.value) }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLElement).blur() }}
                  enterKeyHint="search"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary pr-8"
                  placeholder="Type to search… (min 2 chars)"
                />
                {searchingCustomers && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-primary text-sm animate-spin inline-block">⟳</span>
                )}
              </div>
              {customerCode && (
                <p className="text-[11px] text-text-muted mt-0.5">Code: <span className="font-mono text-primary">{customerCode}</span></p>
              )}
              {customerSearchMsg && !searchingCustomers && (
                <p className="text-[11px] text-text-muted mt-0.5">{customerSearchMsg}</p>
              )}
              {customerResults.length > 0 && (
                <div className="bg-bg border border-border rounded-lg mt-1 max-h-32 overflow-y-auto">
                  {customerResults.map(r => (
                    <button
                      key={r.code}
                      onClick={() => { setCustomerCode(r.code); setCustomerName(r.name); setCustomerResults([]); setCustomerSearchMsg(null) }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-border"
                    >
                      {r.name} <span className="text-text-muted text-xs">({r.code})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>}

        {/* Footer actions */}
        {!savedActivity && <div className="p-4 border-t border-border space-y-2">
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
        </div>}
      </div>
    </div>
  )
}
