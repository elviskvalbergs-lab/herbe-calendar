'use client'
import { useState, useEffect, useRef } from 'react'
import { Activity, ActivityType, ActivityClassGroup, SearchResult, Person } from '@/types'
import ErrorBanner from './ErrorBanner'
import { format } from 'date-fns'
import { serpLink } from '@/lib/serpLink'
import { getRecentTypes, saveRecentType, getRecentPersons, saveRecentPersons, getRecentCCPersons, saveRecentCCPersons } from '@/lib/recentItems'

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
  allCustomers?: { Code: string; Name: string }[]
  allProjects?: { Code: string; Name: string; CUCode: string | null; CUName: string | null }[]
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
  initial, editId, people, defaultPersonCode, defaultPersonCodes, todayActivities, onClose, onSaved, onDuplicate, canEdit = true, getTypeColor, getTypeGroup, companyCode = '1', allCustomers, allProjects
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
  const [erpLinkCopied, setErpLinkCopied] = useState(false)
  const [recentTypes, setRecentTypes] = useState<string[]>([])
  const [recentPersonCodes, setRecentPersonCodes] = useState<string[]>([])
  const [selectedCCPersonCodes, setSelectedCCPersonCodes] = useState<string[]>(
    initial?.ccPersons ?? []
  )
  const [ccPersonsExpanded, setCCPersonsExpanded] = useState(false)
  const [recentCCPersonCodes, setRecentCCPersonCodes] = useState<string[]>([])
  const [rsvpStatus, setRsvpStatus] = useState<Activity['rsvpStatus']>(initial?.rsvpStatus)
  const [rsvpLoading, setRsvpLoading] = useState(false)
  const handleSaveRef = useRef<() => void>(() => {})
  const handleDuplicateRef = useRef<() => void>(() => {})
  const handleCloseRef = useRef<() => void>(() => {})
  const descInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const customerInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)
  const isDragging = useRef(false)
  // Snapshot of values at form open / reset — used for dirty detection
  const initialValuesRef = useRef({
    description: initial?.description ?? '',
    timeTo: initial?.timeTo ?? '',
    activityTypeCode: initial?.activityTypeCode ?? '',
    projectCode: initial?.projectCode ?? '',
    customerCode: initial?.customerCode ?? '',
    planned: initial?.planned ?? false,
    itemCode: initial?.itemCode ?? '',
    textInMatrix: initial?.textInMatrix ?? '',
    selectedPersonCodes: (
      isEdit && initial?.mainPersons?.length ? initial.mainPersons
        : initial?.personCode ? [initial.personCode]
        : (defaultPersonCodes?.length ? defaultPersonCodes : [defaultPersonCode])
    ) as string[],
    selectedCCPersonCodes: [...(initial?.ccPersons ?? [])] as string[],
  })
  const projectSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const customerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const saveShortcut = isMac ? '⌃⌘S' : 'Ctrl+S'

  // Load recent items from localStorage
  useEffect(() => {
    setRecentTypes(getRecentTypes())
    setRecentPersonCodes(getRecentPersons())
    setRecentCCPersonCodes(getRecentCCPersons())
  }, [])

  // Esc to close · ⌃⌘S to save · ⌃⌘Y to duplicate · ⌃⌘O to open in ERP
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { handleCloseRef.current(); return }
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

  function smartDefaultStart(hint?: string): string {
    if (hint) return hint
    const todayForPerson = todayActivities
      .filter(a => !a.planned && (a.mainPersons?.includes(defaultPersonCode) || a.personCode === defaultPersonCode))
      .sort((a, b) => b.timeTo.localeCompare(a.timeTo))
    return todayForPerson[0]?.timeTo ?? '09:00'
  }

  function handleDragHandleTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY
    isDragging.current = false
  }

  function handleDragHandleTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return
    const dy = e.touches[0].clientY - dragStartY.current
    if (dy <= 0) return
    isDragging.current = true
    if (modalRef.current) {
      modalRef.current.style.transform = `translateY(${dy}px)`
      modalRef.current.style.transition = 'none'
    }
  }

  function handleDragHandleTouchEnd(e: React.TouchEvent) {
    if (dragStartY.current === null) return
    const dy = e.changedTouches[0].clientY - dragStartY.current
    dragStartY.current = null
    const springBack = () => {
      if (modalRef.current) {
        modalRef.current.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)'
        modalRef.current.style.transform = ''
      }
    }
    if (dy > 80 && isDragging.current) {
      if (computeIsDirty() && !window.confirm('Discard unsaved changes?')) {
        springBack()
      } else {
        if (modalRef.current) {
          modalRef.current.style.transition = 'transform 0.2s ease-out'
          modalRef.current.style.transform = `translateY(100%)`
        }
        setTimeout(() => onCloseRef.current(), 200)
      }
    } else {
      springBack()
    }
    isDragging.current = false
  }

  async function searchProjects(q: string) {
    if (q.length < 2) { setProjectResults([]); setProjectSearchMsg(null); return }
    // Use client-side data if available
    if (allProjects?.length) {
      const lower = q.toLowerCase()
      const results = allProjects
        .filter(p => p.Name.toLowerCase().includes(lower) || p.Code.toLowerCase().includes(lower))
        .slice(0, 20)
        .map(p => ({ code: p.Code, name: p.Name, customerCode: p.CUCode || undefined, customerName: p.CUName || undefined }))
      setProjectResults(results)
      setProjectSearchMsg(results.length === 0 ? 'No results' : null)
      return
    }
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
    } catch (e) {
      setProjectSearchMsg(String(e))
    } finally {
      setSearchingProjects(false)
    }
  }

  async function searchCustomers(q: string) {
    if (q.length < 2) { setCustomerResults([]); setCustomerSearchMsg(null); return }
    // Use client-side data if available
    if (allCustomers?.length) {
      const lower = q.toLowerCase()
      const results = allCustomers
        .filter(c => c.Name.toLowerCase().includes(lower) || c.Code.toLowerCase().includes(lower))
        .slice(0, 20)
        .map(c => ({ code: c.Code, name: c.Name }))
      setCustomerResults(results)
      setCustomerSearchMsg(results.length === 0 ? 'No results' : null)
      return
    }
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
      CCPersons: selectedCCPersonCodes.join(','),
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
      if (activityTypeCode) saveRecentType(activityTypeCode)
      saveRecentPersons(selectedPersonCodes)
      saveRecentCCPersons(selectedCCPersonCodes)
      setRecentTypes(getRecentTypes())
      setRecentPersonCodes(getRecentPersons())
      setRecentCCPersonCodes(getRecentCCPersons())
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

  function computeIsDirty(): boolean {
    if (savedActivity) return false
    const iv = initialValuesRef.current
    if (description !== iv.description) return true
    if (timeTo !== iv.timeTo) return true
    if (activityTypeCode !== iv.activityTypeCode) return true
    if (projectCode !== iv.projectCode) return true
    if (customerCode !== iv.customerCode) return true
    if (planned !== iv.planned) return true
    if (itemCode !== iv.itemCode) return true
    if (textInMatrix !== iv.textInMatrix) return true
    if (JSON.stringify([...selectedPersonCodes].sort()) !== JSON.stringify([...iv.selectedPersonCodes].sort())) return true
    const sortedCC = [...selectedCCPersonCodes].sort()
    const sortedInitCC = [...(iv.selectedCCPersonCodes ?? [])].sort()
    if (JSON.stringify(sortedCC) !== JSON.stringify(sortedInitCC)) return true
    return false
  }

  function handleClose() {
    if (computeIsDirty() && !window.confirm('Discard unsaved changes?')) return
    onCloseRef.current()
  }
  handleCloseRef.current = handleClose

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

  function resetToCreate(copy: Partial<Activity> | null, timeHint?: string) {
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
      // Same smart default as initial New Activity open, using saved timeTo as hint
      setTimeFrom(smartDefaultStart(timeHint))
      setTimeTo('')
    }
    // Reset dirty baseline so the new blank/copied form isn't considered dirty
    initialValuesRef.current = {
      description: copy?.description ?? '',
      timeTo: copy?.timeTo ?? '',
      activityTypeCode: copy?.activityTypeCode ?? '',
      projectCode: copy?.projectCode ?? '',
      customerCode: copy?.customerCode ?? '',
      planned: copy?.planned ?? false,
      itemCode: copy?.itemCode ?? '',
      textInMatrix: copy?.textInMatrix ?? '',
      selectedPersonCodes: [...selectedPersonCodes],
      selectedCCPersonCodes: [...(copy?.ccPersons ?? [])],
    }
    setSelectedCCPersonCodes(copy?.ccPersons ?? [])
    setCCPersonsExpanded(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div
        ref={modalRef}
        className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
      >
        {/* Drag handle (mobile) — touch here to drag-dismiss */}
        <div
          className="flex justify-center pt-3 pb-1 sm:hidden cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleDragHandleTouchStart}
          onTouchMove={handleDragHandleTouchMove}
          onTouchEnd={handleDragHandleTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header — also responds to swipe-down to dismiss on mobile */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-border sm:touch-auto touch-none"
          onTouchStart={handleDragHandleTouchStart}
          onTouchMove={handleDragHandleTouchMove}
          onTouchEnd={handleDragHandleTouchEnd}
        >
          <h2 className="font-bold flex items-center gap-2 flex-wrap">
            {isEdit ? 'Edit Activity' : 'New Activity'}
            {/* Open-in-source button: Herbe → hansa:// deep link, Outlook → calendar web URL */}
            {isEdit && editId && (() => {
              const herbeLink = source === 'herbe' ? serpLink('ActVc', editId, companyCode) : null
              // Outlook web calendar: open the event in OWA
              const outlookLink = source === 'outlook'
                ? `https://outlook.office.com/calendar/item/${encodeURIComponent(editId)}`
                : null
              const openLink = herbeLink ?? outlookLink
              const cls = 'font-mono text-[11px] font-normal px-2 py-0.5 rounded-lg border border-primary/50 bg-primary/10 text-primary flex items-center gap-1 transition-colors hover:border-primary hover:bg-primary/20'
              return openLink ? (
                <span className="flex items-center gap-1">
                  <a href={openLink} title={source === 'outlook' ? 'Open in Outlook Calendar' : 'Open in Standard ERP (⌃⌘O)'} tabIndex={-1} className={cls}>
                    {source === 'outlook' ? (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17 12v-2h-2v2h2zm-4 0v-2H7v2h6zm4 3v-2h-2v2h2zm-4 0v-2H7v2h6zM3 5v14h18V5H3zm16 12H5V7h14v10z"/></svg>
                        <span>Calendar</span>
                      </>
                    ) : (
                      <>#{editId} <SerpIcon /></>
                    )}
                  </a>
                  <button
                    type="button"
                    tabIndex={-1}
                    title={erpLinkCopied ? 'Copied!' : (source === 'outlook' ? 'Copy Outlook link' : 'Copy ERP link')}
                    onClick={async (e) => {
                      e.stopPropagation()
                      await navigator.clipboard.writeText(openLink)
                      setErpLinkCopied(true)
                      setTimeout(() => setErpLinkCopied(false), 1500)
                    }}
                    className={`inline-flex items-center font-mono text-[11px] font-normal px-2 py-0.5 rounded-lg border transition-colors ${erpLinkCopied ? 'border-green-500/50 bg-green-500/10 text-green-500' : 'border-primary/50 bg-primary/10 text-primary hover:border-primary hover:bg-primary/20'}`}
                  >
                    {erpLinkCopied ? '✓' : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                      </svg>
                    )}
                  </button>
                </span>
              ) : source === 'herbe' ? (
                <span className="font-mono text-[11px] font-normal px-2 py-0.5 rounded-lg border border-primary/50 bg-primary/10 text-primary">#{editId}</span>
              ) : null
            })()}
            {/* View-only badge in header */}
            {canEdit === false && (
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400">View only</span>
            )}
          </h2>
          <button onClick={handleClose} className="text-text-muted text-xl leading-none flex-shrink-0">✕</button>
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
                    onClick={() => resetToCreate(null, savedActivity?.timeTo)}
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
          {/* Teams join button (Outlook meetings only) — original Join Teams call button */}
          {initial?.joinUrl && (
            <a
              href={initial.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#464EB8] text-white font-bold text-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 12v-2h-2v2h2zm-4 0v-2H7v2h6zm4 3v-2h-2v2h2zm-4 0v-2H7v2h6zM3 5v14h18V5H3zm16 12H5V7h14v10z"/></svg>
              Join Teams call
            </a>
          )}

          {/* RSVP buttons (Outlook only, non-organizer) */}
          {source === 'outlook' && rsvpStatus !== 'organizer' && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">RSVP</label>
              <div className="flex gap-2">
                {([
                  {
                    action: 'accept' as const,
                    label: 'Accept',
                    activeStatus: 'accepted' as const,
                    activeClass: 'border-green-600 bg-green-900/20 text-green-400',
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" className="stroke-green-500"/><polyline points="8 12 11 15 16 9" className="stroke-green-400"/></svg>,
                  },
                  {
                    action: 'decline' as const,
                    label: 'Decline',
                    activeStatus: 'declined' as const,
                    activeClass: 'border-red-600 bg-red-900/20 text-red-400',
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" className="stroke-red-500"/><line x1="15" y1="9" x2="9" y2="15" className="stroke-red-400"/><line x1="9" y1="9" x2="15" y2="15" className="stroke-red-400"/></svg>,
                  },
                  {
                    action: 'tentativelyAccept' as const,
                    label: 'Tentative',
                    activeStatus: 'tentativelyAccepted' as const,
                    activeClass: 'border-amber-500 bg-amber-900/20 text-amber-400',
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" className="stroke-amber-500"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" className="stroke-amber-400"/><line x1="12" y1="17" x2="12.01" y2="17" className="stroke-amber-400"/></svg>,
                  },
                ]).map(({ action, label, activeStatus, activeClass, icon }) => (
                  <button
                    key={action}
                    type="button"
                    tabIndex={-1}
                    disabled={rsvpLoading}
                    onClick={async () => {
                      if (!editId || rsvpLoading) return
                      setRsvpLoading(true)
                      try {
                        const res = await fetch(`/api/outlook/${editId}/rsvp`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action }),
                        })
                        if (res.ok) setRsvpStatus(action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'tentativelyAccepted')
                      } finally {
                        setRsvpLoading(false)
                      }
                    }}
                    className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                      rsvpStatus === activeStatus
                        ? activeClass
                        : 'border-border text-text-muted hover:border-primary/50 hover:text-text'
                    }`}
                  >
                    {icon}{label}
                  </button>
                ))}
              </div>
            </div>
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
          {(() => {
            const unselected = people
              .filter(p => !selectedPersonCodes.includes(p.code))
              .sort((a, b) => {
                const ai = recentPersonCodes.indexOf(a.code)
                const bi = recentPersonCodes.indexOf(b.code)
                if (ai !== -1 && bi !== -1) return ai - bi
                if (ai !== -1) return -1
                if (bi !== -1) return 1
                return 0
              })
            const visibleUnselected = personsExpanded ? unselected : unselected.slice(0, 3)
            const hiddenCount = personsExpanded ? 0 : Math.max(0, unselected.length - 3)
            return (
              <div>
                <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Person(s)</label>
                <div className="flex flex-wrap gap-1">
                  {people.filter(p => selectedPersonCodes.includes(p.code)).map(p => (
                    <button
                      key={p.code}
                      tabIndex={-1}
                      onClick={() => setSelectedPersonCodes(prev => prev.filter(c => c !== p.code))}
                      className="px-2 py-0.5 rounded-full text-xs font-bold border bg-primary/20 border-primary text-primary hover:bg-primary/30 transition-colors"
                    >
                      {p.code}
                    </button>
                  ))}
                  {visibleUnselected.map(p => (
                    <button
                      key={p.code}
                      tabIndex={-1}
                      onClick={() => setSelectedPersonCodes(prev => [...prev, p.code])}
                      className="px-2 py-0.5 rounded-full text-xs font-bold border border-border text-text-muted hover:border-primary/50 hover:text-text transition-colors"
                    >
                      {p.code}
                    </button>
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setPersonsExpanded(true)}
                      className="px-2 py-0.5 rounded-full text-xs font-bold border border-border text-text-muted hover:border-primary/50 hover:text-text transition-colors"
                    >
                      +{hiddenCount} more
                    </button>
                  )}
                  {personsExpanded && unselected.length > 3 && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setPersonsExpanded(false)}
                      className="px-2 py-0.5 rounded-full text-xs font-bold border border-border text-text-muted hover:border-primary/50 hover:text-text transition-colors"
                    >
                      Collapse
                    </button>
                  )}
                </div>
              </div>
            )
          })()}

          {/* CC Person(s) — Herbe only */}
          {source === 'herbe' && (() => {
            const unselected = people
              .filter(p => !selectedCCPersonCodes.includes(p.code))
              .sort((a, b) => {
                const ai = recentCCPersonCodes.indexOf(a.code)
                const bi = recentCCPersonCodes.indexOf(b.code)
                if (ai !== -1 && bi !== -1) return ai - bi
                if (ai !== -1) return -1
                if (bi !== -1) return 1
                return 0
              })
            const visibleUnselected = ccPersonsExpanded ? unselected : unselected.slice(0, 3)
            const hiddenCount = ccPersonsExpanded ? 0 : Math.max(0, unselected.length - 3)
            return (
              <div>
                <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">CC Person(s)</label>
                <div className="flex flex-wrap gap-1">
                  {people.filter(p => selectedCCPersonCodes.includes(p.code)).map(p => (
                    <button key={p.code} tabIndex={-1}
                      onClick={() => setSelectedCCPersonCodes(prev => prev.filter(c => c !== p.code))}
                      className="px-2 py-0.5 rounded-full text-xs font-bold border transition-colors"
                      style={{ borderStyle: 'dashed', borderColor: 'var(--color-primary)', background: 'rgba(var(--color-primary-rgb, 205 76 56) / 0.1)', color: 'var(--color-primary)', opacity: 0.8 }}
                    >
                      {p.code}
                    </button>
                  ))}
                  {visibleUnselected.map(p => (
                    <button key={p.code} tabIndex={-1}
                      onClick={() => setSelectedCCPersonCodes(prev => [...prev, p.code])}
                      className="px-2 py-0.5 rounded-full text-xs font-bold border border-border text-text-muted hover:border-primary/50 hover:text-text transition-colors"
                    >
                      {p.code}
                    </button>
                  ))}
                  {hiddenCount > 0 && (
                    <button type="button" tabIndex={-1}
                      onClick={() => setCCPersonsExpanded(true)}
                      className="px-2 py-0.5 rounded-full text-xs font-bold border border-border text-text-muted hover:border-primary/50 hover:text-text transition-colors"
                    >
                      +{hiddenCount} more
                    </button>
                  )}
                  {ccPersonsExpanded && unselected.length > 3 && (
                    <button type="button" tabIndex={-1}
                      onClick={() => setCCPersonsExpanded(false)}
                      className="px-2 py-0.5 rounded-full text-xs font-bold border border-border text-text-muted hover:border-primary/50 hover:text-text transition-colors"
                    >
                      Collapse
                    </button>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Description — and all editable fields below are wrapped in fieldset for read-only enforcement */}
          <fieldset disabled={canEdit === false} className="contents">
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wide mb-1 flex items-center justify-between">
              Description
              <span className="normal-case font-normal text-[9px] tracking-normal">↹ Tab moves fields · {saveShortcut} saves</span>
            </label>
            <div className="relative">
              <input
                ref={descInputRef}
                value={description}
                onChange={e => setDescription(e.target.value)}
                autoFocus={!isEdit && !initial?.timeFrom}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary pr-7"
                placeholder="What are you working on?"
              />
              {description && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => { setDescription(''); descInputRef.current?.focus() }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted/60 hover:text-text text-base leading-none"
                >×</button>
              )}
            </div>
          </div>

          {/* Date + Time From + Time To */}
          <div className="grid grid-cols-[4fr_3fr_3fr] gap-3 items-start">
            <div className="min-w-0">
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                tabIndex={-1}
                className="w-full bg-bg border border-border rounded-lg px-1 sm:px-2 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div className="min-w-0">
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1">
                From
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setTimeFrom(smartDefaultStart())}
                  title="Apply auto-start time"
                  className="text-text-muted/60 hover:text-primary transition-colors text-[11px] leading-none"
                >
                  ⏱
                </button>
              </label>
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
                className="w-full bg-bg border border-border rounded-lg px-1 sm:px-2 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div className="min-w-0">
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">To</label>
              <input
                type="time"
                value={timeTo}
                onChange={e => setTimeTo(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-1 sm:px-2 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:border-primary"
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
                        active ? 'bg-primary/20 border-primary text-primary hover:bg-primary/30' : 'border-border text-text-muted hover:border-primary/50 hover:text-text'
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
                    className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
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
              <div className="relative">
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
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary pr-7"
                  placeholder="Type code or name…"
                />
                {activityTypeName && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => { setActivityTypeCode(''); setActivityTypeName(''); setActivityTypeResults([]); setCurrentGroup(undefined) }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted/60 hover:text-text text-base leading-none"
                  >×</button>
                )}
              </div>
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
              {recentTypes.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {recentTypes.map(code => {
                    const type = activityTypes.find(t => t.code === code)
                    if (!type) return null
                    const isSelected = activityTypeCode === code
                    const c = getTypeColor?.(code)
                    return (
                      <button
                        key={code}
                        type="button"
                        tabIndex={-1}
                        onClick={() => {
                          setActivityTypeCode(type.code)
                          setActivityTypeName(type.name)
                          setActivityTypeResults([])
                          setCurrentGroup(getTypeGroup?.(type.code))
                        }}
                        className={`px-2 py-0.5 rounded-lg text-xs font-bold border transition-colors ${
                          isSelected ? 'border-primary bg-primary/20 text-primary' : 'border-border text-text-muted hover:border-primary/50'
                        }`}
                        style={!isSelected && c ? { borderColor: c + '44', color: c, background: c + '11' } : undefined}
                      >
                        {code}
                      </button>
                    )
                  })}
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
                  onChange={e => {
                    setProjectName(e.target.value); setProjectCode(''); setFocusedProjectIdx(-1)
                    if (projectSearchTimer.current) clearTimeout(projectSearchTimer.current)
                    projectSearchTimer.current = setTimeout(() => searchProjects(e.target.value), 300)
                  }}
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
                {searchingProjects
                  ? <span className="absolute right-2 top-1/2 -translate-y-1/2 text-primary text-sm animate-spin inline-block">⟳</span>
                  : projectName && <button type="button" tabIndex={-1} onClick={() => { setProjectCode(''); setProjectName(''); setProjectResults([]) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted/60 hover:text-text text-base leading-none">×</button>
                }
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
                  onChange={e => {
                    setCustomerName(e.target.value); setCustomerCode(''); setFocusedCustomerIdx(-1)
                    if (customerSearchTimer.current) clearTimeout(customerSearchTimer.current)
                    customerSearchTimer.current = setTimeout(() => searchCustomers(e.target.value), 300)
                  }}
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
                {searchingCustomers
                  ? <span className="absolute right-2 top-1/2 -translate-y-1/2 text-primary text-sm animate-spin inline-block">⟳</span>
                  : customerName && <button type="button" tabIndex={-1} onClick={() => { setCustomerCode(''); setCustomerName(''); setCustomerResults([]) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted/60 hover:text-text text-base leading-none">×</button>
                }
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
          </fieldset>
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
