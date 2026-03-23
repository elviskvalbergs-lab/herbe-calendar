'use client'
import { useState, useEffect, useRef } from 'react'
import { Activity, ActivityType, ActivityClassGroup, SearchResult, Person } from '@/types'
import ErrorBanner from './ErrorBanner'
import { format } from 'date-fns'
import { serpLink } from '@/lib/serpLink'

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
  getTypeColor?: (typeCode: string) => string
  getTypeGroup?: (typeCode: string) => ActivityClassGroup | undefined
  companyCode?: string
}

function SerpIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

export default function ActivityForm({
  initial, editId, people, defaultPersonCode, defaultPersonCodes, todayActivities, onClose, onSaved, onDuplicate, canEdit = true, getTypeColor, getTypeGroup, companyCode = '1'
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
  const [currentGroup, setCurrentGroup] = useState<ActivityClassGroup | undefined>()
  const [planned, setPlanned] = useState(initial?.planned ?? false)
  const [itemCode, setItemCode] = useState(initial?.itemCode ?? '')
  const [textInMatrix, setTextInMatrix] = useState(initial?.textInMatrix ?? '')
  const [projectResults, setProjectResults] = useState<SearchResult[]>([])
  const [customerResults, setCustomerResults] = useState<SearchResult[]>([])
  const [searchingProjects, setSearchingProjects] = useState(false)
  const [searchingCustomers, setSearchingCustomers] = useState(false)
  const [projectSearchMsg, setProjectSearchMsg] = useState<string | null>(null)
  const [customerSearchMsg, setCustomerSearchMsg] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [savedActivity, setSavedActivity] = useState<Partial<Activity> | null>(null)
  const [focusedTypeIdx, setFocusedTypeIdx] = useState(-1)
  const [focusedProjectIdx, setFocusedProjectIdx] = useState(-1)
  const [focusedCustomerIdx, setFocusedCustomerIdx] = useState(-1)
  const [personsExpanded, setPersonsExpanded] = useState(false)
  const handleSaveRef = useRef<() => void>(() => {})
  const handleDuplicateRef = useRef<() => void>(() => {})
  const descInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const customerInputRef = useRef<HTMLInputElement>(null)
  const swipeX = useRef<number | null>(null)
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const saveShortcut = isMac ? '⌃⌘S' : 'Ctrl+S'

  // Esc to close · ⌃⌘S to save · ⌃⌘Y to duplicate · ⌃⌘O to open in ERP
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return }
      if (e.metaKey && e.ctrlKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault(); handleSaveRef.current(); return
      }
      if (e.metaKey && e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        if (isEdit && (canEdit ?? true)) handleDuplicateRef.current()
        return
      }
      if (e.metaKey && e.ctrlKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault()
        if (isEdit && editId) {
          const link = serpLink('ActVc', editId, companyCode)
          if (link) window.location.href = link
        }
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isEdit, editId, companyCode, canEdit])

  // Load activity types on mount
  useEffect(() => {
    fetch('/api/activity-types')
      .then(r => r.json())
      .then((types: ActivityType[]) => {
        setActivityTypes(types)
        // Set display name + group requirements for pre-selected type (edit mode)
        if (initial?.activityTypeCode) {
          const found = types.find(t => t.code === initial.activityTypeCode)
          if (found) {
            setActivityTypeName(found.name)
            setCurrentGroup(getTypeGroup?.(initial.activityTypeCode))
          }
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
        code: String(d['Code'] ?? ''),
        name: String(d['Name'] ?? ''),
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
      ItemCode: itemCode || undefined,
      Text: textInMatrix || undefined,
      MainPersons: selectedPersonCodes.join(','),
      CalTimeFlag: planned ? '2' : '1',
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
    if (source === 'herbe' && currentGroup?.forceProj && !projectCode) errs.push('Project is required for this activity type')
    if (source === 'herbe' && currentGroup?.forceCust && !customerCode) errs.push('Customer is required for this activity type')
    if (source === 'herbe' && currentGroup?.forceItem && !itemCode.trim()) errs.push('Item code is required for this activity type')
    if (source === 'herbe' && currentGroup?.forceTextInMatrix && !textInMatrix.trim()) errs.push('Additional text is required for this activity type')
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
          : [String(data?.error ?? `Server error (${res.status})`)]
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

  handleSaveRef.current = handleSave
  handleDuplicateRef.current = handleDuplicate

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
      planned,
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
      setCurrentGroup(copy.activityTypeCode ? getTypeGroup?.(copy.activityTypeCode) : undefined)
      setProjectCode(copy.projectCode ?? '')
      setProjectName(copy.projectName ?? '')
      setCustomerCode(copy.customerCode ?? '')
      setCustomerName(copy.customerName ?? '')
      setPlanned(copy.planned ?? false)
      setItemCode(copy.itemCode ?? '')
      setTextInMatrix(copy.textInMatrix ?? '')
    } else {
      setDescription('')
      setActivityTypeCode('')
      setActivityTypeName('')
      setCurrentGroup(undefined)
      setProjectCode('')
      setProjectName('')
      setCustomerCode('')
      setCustomerName('')
      setPlanned(false)
      setItemCode('')
      setTextInMatrix('')
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
      <div
        className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onTouchStart={e => { swipeX.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          if (swipeX.current !== null && e.changedTouches[0].clientX - swipeX.current < -80) onCloseRef.current()
          swipeX.current = null
        }}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-bold flex items-center gap-2">
            {isEdit ? 'Edit Activity' : 'New Activity'}
            {isEdit && editId && (() => {
              const link = serpLink('ActVc', editId, companyCode)
              const cls = 'font-mono text-[11px] font-normal px-2 py-0.5 rounded-lg border border-primary/50 bg-primary/10 text-primary flex items-center gap-1 transition-colors'
              return link ? (
                <a href={link} title="Open in Standard ERP (⌃⌘O)" tabIndex={-1}
                   className={cls + ' hover:border-primary hover:bg-primary/20'}>
                  #{editId} <SerpIcon />
                </a>
              ) : (
                <span className={cls}>#{editId}</span>
              )
            })()}
          </h2>
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
            <label className="text-xs text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1.5">
              Person(s)
              {!personsExpanded && people.some(p => !selectedPersonCodes.includes(p.code)) && (
                <button type="button" tabIndex={-1} onClick={() => setPersonsExpanded(true)}
                  className="ml-auto text-[10px] text-text-muted hover:text-text">
                  +{people.filter(p => !selectedPersonCodes.includes(p.code)).length} more
                </button>
              )}
              {personsExpanded && (
                <button type="button" tabIndex={-1} onClick={() => setPersonsExpanded(false)}
                  className="ml-auto text-[10px] text-text-muted hover:text-text">
                  Collapse
                </button>
              )}
            </label>
            <div className="flex flex-wrap gap-1">
              {(personsExpanded ? people : people.filter(p => selectedPersonCodes.includes(p.code))).map(p => {
                const sel = selectedPersonCodes.includes(p.code)
                return (
                  <button
                    key={p.code}
                    tabIndex={-1}
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
            <label className="text-xs text-text-muted uppercase tracking-wide mb-1 flex items-center justify-between">
              Description
              <span className="normal-case font-normal text-[9px] opacity-40 tracking-normal">↹ Tab moves fields · {saveShortcut} saves</span>
            </label>
            <input
              ref={descInputRef}
              value={description}
              onChange={e => setDescription(e.target.value)}
              autoFocus={!isEdit && !initial?.timeFrom}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              placeholder="What are you working on?"
            />
          </div>

          {/* Date + Time From + Time To */}
          <div className="grid grid-cols-3 gap-1">
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                tabIndex={-1}
                className="w-full bg-bg border border-border rounded-lg px-1.5 sm:px-2 py-2 text-sm focus:outline-none focus:border-primary"
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
                className="w-full bg-bg border border-border rounded-lg px-1.5 sm:px-2 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">To</label>
              <input
                type="time"
                value={timeTo}
                onChange={e => setTimeTo(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-1.5 sm:px-2 py-2 text-sm focus:outline-none focus:border-primary"
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
              <div className="flex items-center gap-1.5 flex-wrap -mt-1">
                {DURATIONS.map(({ label, mins }) => {
                  const active = currentDur === mins
                  const toMins = fromMins + mins
                  const hh = String(Math.floor(toMins / 60) % 24).padStart(2, '0')
                  const mm = String(toMins % 60).padStart(2, '0')
                  return (
                    <button
                      key={mins}
                      type="button"
                      tabIndex={-1}
                      onClick={() => setTimeTo(`${hh}:${mm}`)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                        active ? 'bg-primary/20 border-primary text-primary' : 'border-border text-text-muted hover:border-primary/50'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
                {source === 'herbe' && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setPlanned(p => !p)}
                    className={`ml-auto text-[9px] font-bold px-1.5 py-1 rounded-lg border transition-colors ${
                      planned
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                        : 'border-border text-text-muted hover:border-primary/50 hover:text-text'
                    }`}
                  >
                    {planned ? '○ Planned' : '● Actual'}
                  </button>
                )}
              </div>
            )
          })()}

          {/* Activity type (Herbe only) */}
          {source === 'herbe' && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1.5">
                Activity Type
                {activityTypeCode && <span className="font-mono text-primary normal-case text-[11px]">{activityTypeCode}</span>}
              </label>
              <input
                value={activityTypeName}
                onChange={e => { setActivityTypeName(e.target.value); setActivityTypeCode(''); setFocusedTypeIdx(-1); filterActivityTypes(e.target.value) }}
                onFocus={() => { if (!activityTypeResults.length) filterActivityTypes(activityTypeName) }}
                onKeyDown={e => {
                  const n = activityTypeResults.length
                  if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedTypeIdx(i => Math.min(i + 1, n - 1)); if (!n) filterActivityTypes(activityTypeName) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedTypeIdx(i => Math.max(i - 1, -1)) }
                  else if ((e.key === 'Enter' || e.key === 'Tab') && focusedTypeIdx >= 0) {
                    if (e.key === 'Tab') e.preventDefault()
                    const t = activityTypeResults[focusedTypeIdx]
                    setActivityTypeCode(t.code); setActivityTypeName(t.name); setActivityTypeResults([]); setFocusedTypeIdx(-1); setCurrentGroup(getTypeGroup?.(t.code))
                    if (e.key === 'Tab') projectInputRef.current?.focus()
                  } else if (e.key === 'Escape') { setActivityTypeResults([]); setFocusedTypeIdx(-1) }
                  else if (e.key === 'Enter') (e.target as HTMLElement).blur()
                }}
                enterKeyHint="search"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                placeholder="Type code or name…"
              />
              {activityTypeResults.length > 0 && (
                <div className="bg-bg border border-border rounded-lg mt-1 max-h-40 overflow-y-auto">
                  {activityTypeResults.map((t, tIdx) => (
                    <button
                      key={t.code}
                      tabIndex={-1}
                      onClick={() => {
                        setActivityTypeCode(t.code)
                        setActivityTypeName(t.name)
                        setActivityTypeResults([])
                        setFocusedTypeIdx(-1)
                        setCurrentGroup(getTypeGroup?.(t.code))
                        projectInputRef.current?.focus()
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${tIdx === focusedTypeIdx ? 'bg-primary/20' : 'hover:bg-border'}`}
                    >
                      {(() => {
                        const c = getTypeColor?.(t.code)
                        return (
                          <span
                            className="font-mono text-xs w-12 shrink-0 rounded px-1 py-0.5 text-center"
                            style={c ? { background: c + '33', color: c } : { color: 'var(--color-primary)' }}
                          >
                            {t.code}
                          </span>
                        )
                      })()}
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
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1.5">
                Project{currentGroup?.forceProj && <span className="text-red-400">*</span>}
                {projectCode && <span className="font-mono text-primary normal-case text-[11px]">{projectCode}</span>}
                {projectCode && (() => {
                  const link = serpLink('PRVc', projectCode, companyCode)
                  return link ? (
                    <a href={link} title="Open project in Standard ERP" tabIndex={-1} className="text-text-muted hover:text-primary transition-colors" onClick={e => e.stopPropagation()}>
                      <SerpIcon />
                    </a>
                  ) : null
                })()}
                {projectSearchMsg && !searchingProjects && <span className="normal-case font-normal text-text-muted ml-auto">{projectSearchMsg}</span>}
              </label>
              <div className="relative">
                <input
                  ref={projectInputRef}
                  value={projectName}
                  onChange={e => { setProjectName(e.target.value); setProjectCode(''); setFocusedProjectIdx(-1); searchProjects(e.target.value) }}
                  onKeyDown={e => {
                    const n = projectResults.length
                    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedProjectIdx(i => Math.min(i + 1, n - 1)) }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedProjectIdx(i => Math.max(i - 1, -1)) }
                    else if ((e.key === 'Enter' || e.key === 'Tab') && focusedProjectIdx >= 0) {
                      if (e.key === 'Tab') e.preventDefault()
                      const r = projectResults[focusedProjectIdx]
                      setProjectCode(r.code); setProjectName(r.name); setProjectResults([]); setProjectSearchMsg(null); setFocusedProjectIdx(-1)
                      if (r.customerCode) { setCustomerCode(r.customerCode); setCustomerName(r.customerName ?? r.customerCode) }
                      if (e.key === 'Tab') customerInputRef.current?.focus()
                    } else if (e.key === 'Escape') { setProjectResults([]); setFocusedProjectIdx(-1) }
                    else if (e.key === 'Enter') (e.target as HTMLElement).blur()
                  }}
                  enterKeyHint="search"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary pr-8"
                  placeholder="Type to search… (min 2 chars)"
                />
                {searchingProjects && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-primary text-sm animate-spin inline-block">⟳</span>
                )}
              </div>
              {projectResults.length > 0 && (
                <div className="bg-bg border border-border rounded-lg mt-1 max-h-32 overflow-y-auto">
                  {projectResults.map((r, rIdx) => (
                    <button
                      key={r.code}
                      tabIndex={-1}
                      onClick={() => {
                        setProjectCode(r.code)
                        setProjectName(r.name)
                        setProjectResults([])
                        setProjectSearchMsg(null)
                        setFocusedProjectIdx(-1)
                        if (r.customerCode) { setCustomerCode(r.customerCode); setCustomerName(r.customerName ?? r.customerCode) }
                        customerInputRef.current?.focus()
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm ${rIdx === focusedProjectIdx ? 'bg-primary/20' : 'hover:bg-border'}`}
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
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1.5">
                Customer{currentGroup?.forceCust && <span className="text-red-400">*</span>}
                {customerCode && <span className="font-mono text-primary normal-case text-[11px]">{customerCode}</span>}
                {customerCode && (() => {
                  const link = serpLink('CUVc', customerCode, companyCode)
                  return link ? (
                    <a href={link} title="Open customer in Standard ERP" tabIndex={-1} className="text-text-muted hover:text-primary transition-colors" onClick={e => e.stopPropagation()}>
                      <SerpIcon />
                    </a>
                  ) : null
                })()}
                {customerSearchMsg && !searchingCustomers && <span className="normal-case font-normal text-text-muted ml-auto">{customerSearchMsg}</span>}
              </label>
              <div className="relative">
                <input
                  ref={customerInputRef}
                  value={customerName}
                  onChange={e => { setCustomerName(e.target.value); setCustomerCode(''); setFocusedCustomerIdx(-1); searchCustomers(e.target.value) }}
                  onKeyDown={e => {
                    const n = customerResults.length
                    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedCustomerIdx(i => Math.min(i + 1, n - 1)) }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedCustomerIdx(i => Math.max(i - 1, -1)) }
                    else if ((e.key === 'Enter' || e.key === 'Tab') && focusedCustomerIdx >= 0) {
                      if (e.key === 'Tab') e.preventDefault()
                      const r = customerResults[focusedCustomerIdx]
                      setCustomerCode(r.code); setCustomerName(r.name); setCustomerResults([]); setCustomerSearchMsg(null); setFocusedCustomerIdx(-1)
                    } else if (e.key === 'Escape') { setCustomerResults([]); setFocusedCustomerIdx(-1) }
                    else if (e.key === 'Enter') (e.target as HTMLElement).blur()
                  }}
                  enterKeyHint="search"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary pr-8"
                  placeholder="Type to search… (min 2 chars)"
                />
                {searchingCustomers && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-primary text-sm animate-spin inline-block">⟳</span>
                )}
              </div>
              {customerResults.length > 0 && (
                <div className="bg-bg border border-border rounded-lg mt-1 max-h-32 overflow-y-auto">
                  {customerResults.map((r, rIdx) => (
                    <button
                      key={r.code}
                      tabIndex={-1}
                      onClick={() => { setCustomerCode(r.code); setCustomerName(r.name); setCustomerResults([]); setCustomerSearchMsg(null); setFocusedCustomerIdx(-1) }}
                      className={`w-full text-left px-3 py-1.5 text-sm ${rIdx === focusedCustomerIdx ? 'bg-primary/20' : 'hover:bg-border'}`}
                    >
                      {r.name} <span className="text-text-muted text-xs">({r.code})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Item code (Herbe only, shown when ForceItem or when value already set) */}
          {source === 'herbe' && (currentGroup?.forceItem || itemCode) && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">
                Item Code{currentGroup?.forceItem && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              <input
                value={itemCode}
                onChange={e => setItemCode(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary font-mono"
                placeholder="Item code"
              />
            </div>
          )}

          {/* Additional text (Herbe only) */}
          {source === 'herbe' && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">
                Additional Text{currentGroup?.forceTextInMatrix && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              <textarea
                value={textInMatrix}
                onChange={e => setTextInMatrix(e.target.value)}
                rows={2}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
                placeholder="Optional additional description…"
              />
            </div>
          )}
        </div>}

        {/* Footer actions */}
        {!savedActivity && <div className="p-4 border-t border-border">
          {/* If editing but canEdit is false, show close only */}
          {isEdit && !(canEdit ?? true) ? (
            <button onClick={onClose} className="w-full border border-border text-text-muted font-bold py-3 rounded-xl">
              Close
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-primary text-white font-bold py-3 rounded-xl disabled:opacity-50"
              >
                {saving ? 'Saving…' : isEdit ? `Save changes` : `Create activity`}
                {!saving && <span className="ml-2 opacity-60 text-xs font-normal">{saveShortcut}</span>}
              </button>
              {isEdit && (canEdit ?? true) && (
                <button
                  onClick={handleDuplicate}
                  title={`Duplicate activity (${isMac ? '⌃⌘Y' : 'Ctrl+Alt+Y'})`}
                  className="px-4 border border-border text-text-muted rounded-xl text-lg leading-none hover:border-primary/50 hover:text-text transition-colors"
                >
                  ⧉
                </button>
              )}
            </div>
          )}
        </div>}
      </div>
    </div>
  )
}
