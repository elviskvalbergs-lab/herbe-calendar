'use client'
import { useState, useEffect, useRef } from 'react'
import { Activity, ActivityType, ActivityClassGroup, SearchResult, Person } from '@/types'
import type { UserGoogleAccount } from '@/types'
import ErrorBanner from './ErrorBanner'
import ConfirmDialog from './ConfirmDialog'
import { useConfirm } from '@/lib/useConfirm'
import { readableAccentColor } from '@/lib/activityColors'
import { format } from 'date-fns'
import { serpLink } from '@/lib/serpLink'
import { getRecentTypes, saveRecentType, getRecentPersons, saveRecentPersons, getRecentCCPersons, saveRecentCCPersons } from '@/lib/recentItems'

interface Attendee { email?: string; name?: string }

/** Resolve Outlook/Google attendees to internal person codes by email, name, and domain matching */
function resolveAttendeesToPersonCodes(
  attendees: Attendee[],
  people: Person[],
  personCode?: string,
): { codes: string[]; external: string[] } {
  const internalEmails = new Map(people.filter(p => p.email).map(p => [p.email.toLowerCase(), p.code] as const))
  const internalNameGroups = new Map<string, Person[]>()
  for (const p of people) {
    if (!p.name) continue
    const key = p.name.toLowerCase()
    const group = internalNameGroups.get(key) ?? []
    group.push(p)
    internalNameGroups.set(key, group)
  }

  const codes = new Set<string>()
  if (personCode) codes.add(personCode)
  const external: string[] = []

  for (const att of attendees) {
    const byEmail = att.email ? internalEmails.get(att.email.toLowerCase()) : undefined
    if (byEmail) { codes.add(byEmail); continue }
    if (att.name) {
      const group = internalNameGroups.get(att.name.toLowerCase())
      if (group?.length === 1) { codes.add(group[0].code); continue }
      if (group && att.email) {
        const attDomain = att.email.split('@')[1]?.toLowerCase()
        const domainMatch = group.find(p => p.email?.split('@')[1]?.toLowerCase() === attDomain)
        if (domainMatch || group[0]) { codes.add((domainMatch ?? group[0]).code); continue }
      }
    }
    if (att.email) external.push(att.email)
  }

  return { codes: [...codes], external }
}

interface Props {
  initial?: Partial<Activity>
  editId?: string
  people: Person[]
  defaultPersonCode: string
  defaultPersonCodes?: string[]
  allActivities: Activity[]
  onClose: () => void
  onSaved: () => void
  onDuplicate: (initial: Partial<Activity>) => void
  onRsvp?: (status: Activity['rsvpStatus']) => void
  canEdit?: boolean  // if true, show edit/delete controls; undefined treated as true for create mode
  getTypeColor?: (typeCode: string) => string
  getTypeGroup?: (typeCode: string) => ActivityClassGroup | undefined
  companyCode?: string
  allCustomers?: { Code: string; Name: string }[]
  allProjects?: { Code: string; Name: string; CUCode: string | null; CUName: string | null }[]
  erpConnections?: { id: string; name: string; companyCode?: string; serpUuid?: string }[]
  availableSources?: { herbe: boolean; azure: boolean; google?: boolean }
  userGoogleAccounts?: UserGoogleAccount[]
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
  initial, editId, people, defaultPersonCode, defaultPersonCodes, allActivities, onClose, onSaved, onDuplicate, onRsvp, canEdit = true, getTypeColor, getTypeGroup, companyCode = '1', allCustomers, allProjects, erpConnections = [], availableSources, userGoogleAccounts
}: Props) {
  const isEdit = !!editId
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Source: 'outlook', 'google', or an ERP connection ID
  const [source, setSource] = useState<string>(() => {
    if (initial?.source === 'outlook') return 'outlook'
    if (initial?.source === 'google') return 'google'
    // For edit mode: use the activity's own connection ID if available
    if (isEdit && initial?.erpConnectionId) return initial.erpConnectionId
    // For ERP activities, prefer last-used connection from localStorage
    if (erpConnections.length > 0) {
      const savedErp = (() => { try { return localStorage.getItem('lastErpConnection') } catch { return null } })()
      if (savedErp && erpConnections.some(c => c.id === savedErp)) return savedErp
      return erpConnections[0].id
    }
    return 'herbe'
  })
  const isOutlookSource = source === 'outlook'
  const isGoogleSource = source === 'google'
  const isExternalCalSource = isOutlookSource || isGoogleSource
  const isErpSource = !isExternalCalSource
  const activeErpConnection = erpConnections.find(c => c.id === source)
  const [selectedPersonCodes, setSelectedPersonCodes] = useState<string[]>(() => {
    if (isEdit && initial?.mainPersons?.length) return initial.mainPersons
    if (isEdit && (initial?.source === 'outlook' || initial?.source === 'google') && initial?.attendees?.length) {
      const { codes } = resolveAttendeesToPersonCodes(initial.attendees, people, initial.personCode)
      if (codes.length > 0) return codes
    }
    if (initial?.personCode) return [initial.personCode]
    return defaultPersonCodes?.length ? defaultPersonCodes : [defaultPersonCode]
  })
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
  const isDarkTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') !== 'light' : true
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
  const [selectedGoogleCalendar, setSelectedGoogleCalendar] = useState<string>(() => {
    try { return localStorage.getItem('lastGoogleCalendar') ?? '' } catch { return '' }
  })
  // Outlook-specific: external attendees, location, Teams toggle
  const [externalAttendees, setExternalAttendees] = useState<string[]>(() => {
    if (!initial?.attendees) return []
    // Match attendees as internal by email OR by name (case-insensitive)
    const internalEmails = new Set(people.map(p => (p.email || '').toLowerCase()).filter(Boolean))
    const internalNames = new Set(people.map(p => (p.name || '').toLowerCase()).filter(Boolean))
    return initial.attendees
      .filter(a => a.email
        && !internalEmails.has(a.email.toLowerCase())
        && !internalNames.has((a.name || '').toLowerCase())
      )
      .map(a => a.email)
  })
  const [externalAttendeeInput, setExternalAttendeeInput] = useState('')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [isOnlineMeeting, setIsOnlineMeeting] = useState(initial?.isOnlineMeeting ?? !isEdit)
  const handleSaveRef = useRef<() => void>(() => {})
  const handleDuplicateRef = useRef<() => void>(() => {})
  const handleCloseRef = useRef<() => void>(() => {})
  const descInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const customerInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)
  const isDragging = useRef(false)
  const { confirmState, confirm: showConfirm, handleConfirm, handleCancel } = useConfirm()
  // Snapshot of values at form open / reset — used for dirty detection
  // Must match the actual initial selectedPersonCodes to avoid false dirty
  const initialValuesRef = useRef({
    description: initial?.description ?? '',
    timeTo: initial?.timeTo ?? '',
    activityTypeCode: initial?.activityTypeCode ?? '',
    projectCode: initial?.projectCode ?? '',
    customerCode: initial?.customerCode ?? '',
    planned: initial?.planned ?? false,
    itemCode: initial?.itemCode ?? '',
    textInMatrix: initial?.textInMatrix ?? '',
    selectedPersonCodes: selectedPersonCodes as string[],
    selectedCCPersonCodes: [...(initial?.ccPersons ?? [])] as string[],
  })
  const projectSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const customerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const saveShortcut = isMac ? '⌃⌘S' : 'Ctrl+S'

  // Recalculate Outlook attendee matching when people emails become available
  // (initial render may have stubs with empty emails from localStorage)
  const peopleEmailsKey = people.filter(p => p.email).map(p => p.email.toLowerCase()).sort().join(',')
  const attendeeRecalcDone = useRef(false)
  useEffect(() => {
    if (attendeeRecalcDone.current) return
    if (!isEdit || (initial?.source !== 'outlook' && initial?.source !== 'google') || !initial?.attendees?.length) return
    if (!peopleEmailsKey) return // still stubs
    attendeeRecalcDone.current = true

    const { codes, external } = resolveAttendeesToPersonCodes(initial.attendees, people, initial.personCode)
    if (codes.length > 0) {
      setSelectedPersonCodes(codes)
      initialValuesRef.current.selectedPersonCodes = codes
    }
    setExternalAttendees(external)
  }, [peopleEmailsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist last-used ERP connection to localStorage
  useEffect(() => {
    if (activeErpConnection) {
      try { localStorage.setItem('lastErpConnection', activeErpConnection.id) } catch {}
    }
  }, [activeErpConnection?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load recent persons from localStorage (types loaded per-connection below)
  useEffect(() => {
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
        if (isEdit) handleDuplicateRef.current()
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

  // Per-connection data: projects and customers
  const [connProjects, setConnProjects] = useState<{ Code: string; Name: string; CUCode: string | null; CUName: string | null }[]>(allProjects ?? [])
  const [connCustomers, setConnCustomers] = useState<{ Code: string; Name: string }[]>(allCustomers ?? [])

  // Load activity types when source/connection changes
  const connParam = activeErpConnection ? `?connectionId=${activeErpConnection.id}` : ''
  useEffect(() => {
    if (!isErpSource) return
    fetch(`/api/activity-types${connParam}`)
      .then(r => r.json())
      .then((types: ActivityType[]) => {
        setActivityTypes(types)
        if (initial?.activityTypeCode) {
          const found = types.find(t => t.code === initial.activityTypeCode)
          if (found) {
            setActivityTypeName(found.name)
            setCurrentGroup(getTypeGroup?.(initial.activityTypeCode))
          }
        }
      })
      .catch(console.error)

    // Load per-connection projects and customers
    fetch(`/api/projects?all=1${connParam ? '&' + connParam.slice(1) : ''}`)
      .then(r => r.ok ? r.json() : []).then(setConnProjects).catch(() => {})
    fetch(`/api/customers?all=1${connParam ? '&' + connParam.slice(1) : ''}`)
      .then(r => r.ok ? r.json() : []).then(setConnCustomers).catch(() => {})

    // Load recent types for this connection
    const connKey = activeErpConnection?.id ?? 'default'
    setRecentTypes(getRecentTypes(connKey))
  }, [source]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const todayForPerson = allActivities
      .filter(a => a.date === date && !a.planned && a.source !== 'outlook' && (a.mainPersons?.includes(defaultPersonCode) || a.personCode === defaultPersonCode))
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
      const doClose = () => {
        if (modalRef.current) {
          modalRef.current.style.transition = 'transform 0.2s ease-out'
          modalRef.current.style.transform = `translateY(100%)`
        }
        setTimeout(() => onCloseRef.current(), 200)
      }
      if (computeIsDirty()) {
        springBack()
        showConfirm('Discard unsaved changes?', doClose, { confirmLabel: 'Discard', destructive: true })
      } else {
        doClose()
      }
    } else {
      springBack()
    }
    isDragging.current = false
  }

  async function searchProjects(q: string) {
    if (q.length < 2) { setProjectResults([]); setProjectSearchMsg(null); return }
    // Use client-side data if available
    if (connProjects?.length) {
      const lower = q.toLowerCase()
      const results = connProjects
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
    if (connCustomers?.length) {
      const lower = q.toLowerCase()
      const results = connCustomers
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

  function addExternalAttendee() {
    const email = externalAttendeeInput.trim().toLowerCase()
    if (!email || !email.includes('@')) return
    // If email matches an internal person, add them as a person chip instead
    const internalMatch = people.find(p => p.email && p.email.toLowerCase() === email)
    if (internalMatch) {
      if (!selectedPersonCodes.includes(internalMatch.code)) {
        setSelectedPersonCodes(prev => [...prev, internalMatch.code])
      }
      setExternalAttendeeInput('')
      return
    }
    if (externalAttendees.includes(email)) return
    setExternalAttendees(prev => [...prev, email])
    setExternalAttendeeInput('')
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
    const internalAttendees = selectedPersonCodes
      .map(code => people.find(p => p.code === code))
      .filter((p): p is Person => !!p && !!p.email)
      .map(p => ({ emailAddress: { address: p.email, name: p.name }, type: 'required' as const }))
    const external = externalAttendees.map(email => ({
      emailAddress: { address: email },
      type: 'required' as const,
    }))
    const payload: Record<string, unknown> = {
      subject: description,
      start: { dateTime: `${date}T${timeFrom}:00`, timeZone: 'Europe/Riga' },
      end: { dateTime: `${date}T${timeTo}:00`, timeZone: 'Europe/Riga' },
      attendees: [...internalAttendees, ...external],
    }
    if (location.trim()) {
      payload.location = { displayName: location.trim() }
    }
    if (textInMatrix.trim()) {
      payload.body = { contentType: 'Text', content: textInMatrix.trim() }
    }
    payload.isOnlineMeeting = isOnlineMeeting
    if (isOnlineMeeting && !isGoogleSource) payload.onlineMeetingProvider = 'teamsForBusiness'
    return payload
  }

  async function handleSave() {
    const errs: string[] = []
    if (!description.trim()) errs.push('Description is required')
    if (!timeFrom) errs.push('Start time is required')
    if (!timeTo) errs.push('End time is required')
    if (timeFrom && timeTo && timeFrom >= timeTo) errs.push('End time must be after start time')
    if (isErpSource && currentGroup?.forceProj && !projectCode) errs.push('Project is required for this activity type')
    if (isErpSource && currentGroup?.forceCust && !customerCode) errs.push('Customer is required for this activity type')
    if (isErpSource && currentGroup?.forceItem && !itemCode.trim()) errs.push('Item code is required for this activity type')
    if (isErpSource && currentGroup?.forceTextInMatrix && !textInMatrix.trim()) errs.push('Additional text is required for this activity type')
    if (errs.length) { setErrors(errs); return }

    setSaving(true)
    setErrors([])

    try {
      const connParam = isErpSource && activeErpConnection ? `?connectionId=${activeErpConnection.id}` : ''
      const googleEditParams = isGoogleSource && isEdit && initial?.googleTokenId
        ? `?googleTokenId=${initial.googleTokenId}&googleCalendarId=${initial.googleCalendarId ?? 'primary'}`
        : ''
      const url = isErpSource
        ? (isEdit ? `/api/activities/${editId}${connParam}` : `/api/activities${connParam}`)
        : isGoogleSource
          ? (isEdit ? `/api/google/${editId}${googleEditParams}` : '/api/google')
          : (isEdit ? `/api/outlook/${editId}` : '/api/outlook')
      const method = isEdit ? 'PUT' : 'POST'
      const body: Record<string, unknown> = isErpSource ? buildHerbePayload() : buildOutlookPayload()

      // For new per-user Google events, include token + calendar IDs
      if (isGoogleSource && !isEdit && selectedGoogleCalendar) {
        const [tokenId, calendarId] = selectedGoogleCalendar.split(':')
        body.googleTokenId = tokenId
        body.googleCalendarId = calendarId
      }

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
      if (activityTypeCode) saveRecentType(activityTypeCode, activeErpConnection?.id)
      saveRecentPersons(selectedPersonCodes)
      saveRecentCCPersons(selectedCCPersonCodes)
      setRecentTypes(getRecentTypes(activeErpConnection?.id ?? 'default'))
      setRecentPersonCodes(getRecentPersons())
      setRecentCCPersonCodes(getRecentCCPersons())
      setSavedActivity({
        id: createdId,
        source: isOutlookSource ? 'outlook' : isGoogleSource ? 'google' : 'herbe', personCode: selectedPersonCodes[0], description, date, timeFrom, timeTo,
        activityTypeCode, projectCode, projectName, customerCode, customerName,
      })
      setSaving(false)
    } catch (e) {
      setErrors([String(e)])
      setSaving(false)
    }
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    const msg = isExternalCalSource
      ? `Remove this activity from ${isGoogleSource ? 'Google Calendar' : 'Outlook'}?`
      : 'Remove this activity?'
    showConfirm(msg, async () => {
      setSaving(true)
      setErrors([])
      try {
        const delConnParam = isErpSource && activeErpConnection ? `?connectionId=${activeErpConnection.id}` : ''
        const googleDelParams = isGoogleSource && initial?.googleTokenId
          ? `?googleTokenId=${initial.googleTokenId}&googleCalendarId=${initial.googleCalendarId ?? 'primary'}`
          : ''
        const url = isErpSource
          ? `/api/activities/${editId}${delConnParam}`
          : isGoogleSource
            ? `/api/google/${editId}${googleDelParams}`
            : `/api/outlook/${editId}`
        const res = await fetch(url, { method: 'DELETE' })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          const errMsg = body?.error || body?.errors?.[0]?.message || res.statusText || 'Deletion failed'
          setErrors([`Failed to delete: ${errMsg}`])
          setSaving(false)
          return
        }
        onSaved()
        onClose()
      } catch (err) {
        setErrors([String(err)])
        setSaving(false)
      }
    }, { confirmLabel: 'Remove', destructive: true })
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
    if (computeIsDirty()) {
      showConfirm('Discard unsaved changes?', () => onCloseRef.current(), { confirmLabel: 'Discard', destructive: true })
      return
    }
    onCloseRef.current()
  }
  handleCloseRef.current = handleClose

  function handleDuplicate() {
    onClose()
    onDuplicate({
      source: isOutlookSource ? 'outlook' : 'herbe',
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
            {/* Source badge */}
            {isEdit && isErpSource && activeErpConnection && activeErpConnection.name !== 'Default (env)' && (
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-lg border border-border bg-border/20 text-text-muted">
                {activeErpConnection.name}
              </span>
            )}
            {isEdit && isGoogleSource && (
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-500">
                Google Calendar
              </span>
            )}
            {isEdit && isOutlookSource && (
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-500">
                Outlook
              </span>
            )}
            {/* Open-in-source button: Herbe → hansa:// deep link, Outlook → calendar web URL */}
            {isEdit && editId && (() => {
              const connUuid = activeErpConnection?.serpUuid
              const connCompany = activeErpConnection?.companyCode || companyCode
              const herbeLink = isErpSource && connUuid ? `hansa://${connUuid}/v1/${connCompany}/ActVc/${editId}` : null
              // Outlook: open in Outlook web calendar in a new tab
              const externalCalLink = isExternalCalSource
                ? (initial?.webLink || (isOutlookSource ? `https://outlook.office.com/calendar/item/${encodeURIComponent(editId)}` : null))
                : null
              const openLink = herbeLink ?? externalCalLink
              const copyText = isExternalCalSource
                ? (initial?.joinUrl ?? externalCalLink ?? '')
                : (herbeLink ?? '')
              const cls = 'font-mono text-[11px] font-normal px-2 py-0.5 rounded-lg border border-primary/50 bg-primary/10 text-primary flex items-center gap-1 transition-colors hover:border-primary hover:bg-primary/20'
              return openLink ? (
                <span className="flex items-stretch gap-1">
                  <a
                    href={openLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={isExternalCalSource ? `Open in ${isGoogleSource ? 'Google' : 'Outlook'} Calendar` : 'Open in Standard ERP (⌃⌘O)'}
                    tabIndex={-1}
                    className={cls}
                  >
                    {isExternalCalSource ? (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17 12v-2h-2v2h2zm-4 0v-2H7v2h6zm4 3v-2h-2v2h2zm-4 0v-2H7v2h6zM3 5v14h18V5H3zm16 12H5V7h14v10z"/></svg>
                        <span>{isGoogleSource ? 'Google' : 'Outlook'}</span>
                      </>
                    ) : (
                      <>#{editId} <SerpIcon /></>
                    )}
                  </a>
                  {copyText && (
                    <button
                      type="button"
                      tabIndex={-1}
                      title={erpLinkCopied ? 'Copied!' : (isExternalCalSource ? 'Copy meeting link' : 'Copy ERP link')}
                      onClick={async (e) => {
                        e.stopPropagation()
                        await navigator.clipboard.writeText(copyText)
                        setErpLinkCopied(true)
                        setTimeout(() => setErpLinkCopied(false), 1500)
                      }}
                      className={`inline-flex items-center justify-center font-mono text-[11px] font-normal px-2 rounded-lg border transition-colors ${erpLinkCopied ? 'border-green-500/50 bg-green-500/10 text-green-500' : 'border-primary/50 bg-primary/10 text-primary hover:border-primary hover:bg-primary/20'}`}
                    >
                      {erpLinkCopied ? '✓' : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                        </svg>
                      )}
                    </button>
                  )}
                  {canEdit !== false && isExternalCalSource && (
                    <button
                      type="button"
                      tabIndex={-1}
                      title="Delete from Outlook"
                      onClick={handleDelete}
                      disabled={saving}
                      className="inline-flex items-center justify-center px-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:border-red-500/50 transition-colors disabled:opacity-50"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  )}
                </span>
              ) : isErpSource ? (
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

        {/* ICS calendar source label */}
        {initial?.icsCalendarName && (
          <div className="px-4 py-1.5 border-b border-border bg-primary/5">
            <p className="text-[11px] text-text-muted">📂 {initial.icsCalendarName}</p>
          </div>
        )}

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
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-bold text-sm"
                style={{ background: savedActivity.videoProvider === 'meet' ? '#1a73e8' : savedActivity.videoProvider === 'teams' ? '#464EB8' : savedActivity.videoProvider === 'zoom' ? '#2D8CFF' : '#2563eb' }}
              >
                {savedActivity.videoProvider === 'meet' ? 'Join Google Meet' : savedActivity.videoProvider === 'teams' ? 'Join Teams call' : savedActivity.videoProvider === 'zoom' ? 'Join Zoom' : 'Join meeting'}
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
          {/* Join meeting button (Outlook Teams / Google Meet) */}
          {initial?.joinUrl && (
            <a
              href={initial.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-white font-bold text-sm"
              style={{ background: initial?.videoProvider === 'meet' ? '#1a73e8' : initial?.videoProvider === 'teams' ? '#464EB8' : initial?.videoProvider === 'zoom' ? '#2D8CFF' : '#2563eb' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 12v-2h-2v2h2zm-4 0v-2H7v2h6zm4 3v-2h-2v2h2zm-4 0v-2H7v2h6zM3 5v14h18V5H3zm16 12H5V7h14v10z"/></svg>
              {initial?.videoProvider === 'meet' ? 'Join Google Meet' : initial?.videoProvider === 'teams' ? 'Join Teams call' : initial?.videoProvider === 'zoom' ? 'Join Zoom' : 'Join meeting'}
            </a>
          )}

          {/* RSVP buttons — only for your own event (not colleagues') */}
          {isExternalCalSource && !initial?.isExternal && rsvpStatus !== 'organizer' && initial?.personCode === defaultPersonCode && (
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
                        const rsvpUrl = isGoogleSource
                          ? `/api/google/${editId}/rsvp`
                          : `/api/outlook/${editId}/rsvp`
                        const res = await fetch(rsvpUrl, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action }),
                        })
                        if (res.ok) {
                          const newStatus = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'tentativelyAccepted'
                          setRsvpStatus(newStatus)
                          onRsvp?.(newStatus)
                        }
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
            <div className="flex rounded overflow-hidden border border-border divide-x divide-border text-sm font-bold">
              {erpConnections.map(conn => (
                <button
                  key={conn.id}
                  onClick={() => setSource(conn.id)}
                  className={`flex-1 py-2 truncate px-1 ${source === conn.id ? 'bg-primary text-white' : 'text-text-muted'}`}
                >
                  {conn.name === 'Default (env)' ? 'ERP' : conn.name}
                </button>
              ))}
              {availableSources?.azure && (
                <button
                  key="outlook"
                  onClick={() => setSource('outlook')}
                  className={`flex-1 py-2 ${source === 'outlook' ? 'bg-primary text-white' : 'text-text-muted'}`}
                >
                  Outlook
                </button>
              )}
              {availableSources?.google && (
                <button
                  key="google"
                  onClick={() => setSource('google')}
                  className={`flex-1 py-2 ${source === 'google' ? 'bg-primary text-white' : 'text-text-muted'}`}
                >
                  Google
                </button>
              )}
            </div>
          )}

          {/* Google calendar sub-picker (create only, when per-user accounts are available) */}
          {!isEdit && isGoogleSource && userGoogleAccounts && userGoogleAccounts.length > 0 && (
            <div className="mt-2">
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Calendar</label>
              <select
                value={selectedGoogleCalendar}
                onChange={e => {
                  setSelectedGoogleCalendar(e.target.value)
                  try { localStorage.setItem('lastGoogleCalendar', e.target.value) } catch {}
                }}
                className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Primary (domain)</option>
                {userGoogleAccounts.map(account => (
                  <optgroup key={account.id} label={account.googleEmail}>
                    {account.calendars.filter(c => c.enabled).map(cal => (
                      <option key={cal.id} value={`${account.id}:${cal.calendarId}`}>
                        {cal.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
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
            const visibleUnselected = canEdit ? (personsExpanded ? unselected : unselected.slice(0, 3)) : []
            const hiddenCount = canEdit ? (personsExpanded ? 0 : Math.max(0, unselected.length - 3)) : 0
            return (
              <div>
                <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Person(s)</label>
                <div className="flex flex-wrap gap-1">
                  {people.filter(p => selectedPersonCodes.includes(p.code)).map(p => (
                    <button
                      key={p.code}
                      tabIndex={-1}
                      onClick={() => { if (!canEdit) return; setSelectedPersonCodes(prev => prev.filter(c => c !== p.code)) }}
                      className={`px-2 py-0.5 rounded-full text-xs font-bold border bg-primary/20 border-primary text-primary ${canEdit ? 'hover:bg-primary/30 cursor-pointer' : 'cursor-default'} transition-colors`}
                      title={`${p.name}${p.email ? ` <${p.email}>` : ''}`}
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
                      title={`${p.name}${p.email ? ` <${p.email}>` : ''}`}
                    >
                      {p.code}
                    </button>
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setPersonsExpanded(true)}
                      className="px-2 py-0.5 rounded-full text-xs font-bold border border-dashed border-primary/50 text-primary bg-primary/5 hover:bg-primary/15 transition-colors"
                    >
                      +{hiddenCount} more
                    </button>
                  )}
                  {personsExpanded && unselected.length > 3 && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setPersonsExpanded(false)}
                      className="px-2 py-0.5 rounded-full text-xs font-bold border border-dashed border-primary/50 text-primary bg-primary/5 hover:bg-primary/15 transition-colors"
                    >
                      Collapse
                    </button>
                  )}
                </div>
              </div>
            )
          })()}

          {/* CC Person(s) — Herbe only */}
          {isErpSource && (() => {
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
            const visibleUnselected = canEdit ? (ccPersonsExpanded ? unselected : unselected.slice(0, 3)) : []
            const hiddenCount = canEdit ? (ccPersonsExpanded ? 0 : Math.max(0, unselected.length - 3)) : 0
            return (
              <div>
                <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">CC Person(s)</label>
                <div className="flex flex-wrap gap-1">
                  {people.filter(p => selectedCCPersonCodes.includes(p.code)).map(p => (
                    <button key={p.code} tabIndex={-1}
                      onClick={() => { if (!canEdit) return; setSelectedCCPersonCodes(prev => prev.filter(c => c !== p.code)) }}
                      className={`px-2 py-0.5 rounded-full text-xs font-bold border transition-colors ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                      style={{ borderStyle: 'dashed', borderColor: 'var(--color-primary)', background: 'rgba(var(--color-primary-rgb, 205 76 56) / 0.1)', color: 'var(--color-primary)', opacity: 0.8 }}
                      title={`${p.name}${p.email ? ` <${p.email}>` : ''}`}
                    >
                      {p.code}
                    </button>
                  ))}
                  {visibleUnselected.map(p => (
                    <button key={p.code} tabIndex={-1}
                      onClick={() => setSelectedCCPersonCodes(prev => [...prev, p.code])}
                      className="px-2 py-0.5 rounded-full text-xs font-bold border border-border text-text-muted hover:border-primary/50 hover:text-text transition-colors"
                      title={`${p.name}${p.email ? ` <${p.email}>` : ''}`}
                    >
                      {p.code}
                    </button>
                  ))}
                  {hiddenCount > 0 && (
                    <button type="button" tabIndex={-1}
                      onClick={() => setCCPersonsExpanded(true)}
                      className="px-2 py-0.5 rounded-full text-xs font-bold border border-dashed border-primary/50 text-primary bg-primary/5 hover:bg-primary/15 transition-colors"
                    >
                      +{hiddenCount} more
                    </button>
                  )}
                  {ccPersonsExpanded && unselected.length > 3 && (
                    <button type="button" tabIndex={-1}
                      onClick={() => setCCPersonsExpanded(false)}
                      className="px-2 py-0.5 rounded-full text-xs font-bold border border-dashed border-primary/50 text-primary bg-primary/5 hover:bg-primary/15 transition-colors"
                    >
                      Collapse
                    </button>
                  )}
                </div>
              </div>
            )
          })()}

          {/* External attendees (Outlook only) */}
          {isExternalCalSource && externalAttendees.length > 0 && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">External Attendees</label>
              <div className="flex flex-wrap gap-1">
                {externalAttendees.map(email => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border border-border bg-border/30 text-text-muted"
                  >
                    {email}
                    {canEdit && (
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setExternalAttendees(prev => prev.filter(e => e !== email))}
                        className="text-text-muted/60 hover:text-text leading-none"
                      >×</button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {isExternalCalSource && canEdit && (
            <div>
              {externalAttendees.length === 0 && (
                <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">External Attendees</label>
              )}
              <div className="flex gap-1.5">
                <input
                  value={externalAttendeeInput}
                  onChange={e => setExternalAttendeeInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addExternalAttendee()
                    }
                  }}
                  className="flex-1 bg-bg border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                  placeholder="Add external email..."
                />
                <button
                  type="button"
                  onClick={addExternalAttendee}
                  className="px-4 py-1.5 rounded-lg border border-border text-sm font-bold text-text-muted hover:border-primary/50 hover:text-text active:bg-border transition-colors shrink-0"
                >+</button>
              </div>
            </div>
          )}

          {/* Description — and all editable fields below; disabled visually when canEdit is false */}
          <div
            className={`space-y-3${canEdit === false ? ' pointer-events-none select-none opacity-50' : ''}`}
            aria-disabled={canEdit === false}
          >
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wide mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                Description
                {!isEdit && (
                  <TemplateQuickPick
                    activityTypes={activityTypes}
                    onApply={(t) => {
                      // ERP fields
                      if (t.fields.ActType) {
                        setActivityTypeCode(t.fields.ActType)
                        const found = activityTypes.find(at => at.code === t.fields.ActType)
                        setActivityTypeName(found?.name ?? '')
                        setCurrentGroup(getTypeGroup?.(t.fields.ActType))
                      }
                      if (t.fields.PRCode) {
                        setProjectCode(t.fields.PRCode)
                        const proj = connProjects.find(p => p.Code === t.fields.PRCode)
                        setProjectName(proj?.Name ?? t.fields.PRCode)
                        if (!t.fields.CUCode && proj?.CUCode) {
                          setCustomerCode(proj.CUCode)
                          setCustomerName(proj.CUName ?? proj.CUCode)
                        }
                      }
                      if (t.fields.CUCode) {
                        setCustomerCode(t.fields.CUCode)
                        const cust = connCustomers.find(c => c.Code === t.fields.CUCode)
                        setCustomerName(cust?.Name ?? t.fields.CUCode)
                      }
                      // Duration
                      if (t.duration) {
                        const [h, m] = timeFrom.split(':').map(Number)
                        const endMins = h * 60 + m + t.duration
                        setTimeTo(`${String(Math.floor(endMins / 60) % 24).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`)
                      }
                      if (t.description) setDescription(t.description)
                      // Outlook/Google fields
                      if (t.location) setLocation(t.location)
                      if (t.onlineMeeting !== undefined) setIsOnlineMeeting(t.onlineMeeting)
                    }}
                  />
                )}
              </span>
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
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1">
                To
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    const now = new Date()
                    setTimeTo(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
                  }}
                  title="Set to current time"
                  className="text-text-muted/60 hover:text-primary transition-colors text-[11px] leading-none"
                >
                  ⏱
                </button>
              </label>
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
              <div className="flex items-center gap-1.5 flex-wrap">
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
                {isErpSource && (
                  <>
                    {initial?.okFlag && (
                      <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-lg border bg-green-500/15 border-green-500/40 text-green-500">
                        ✓ OK'd
                      </span>
                    )}
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setPlanned(p => !p)}
                      disabled={canEdit === false}
                      className={`${initial?.okFlag ? '' : 'ml-auto '}text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                        planned
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                          : 'border-border text-text-muted hover:border-primary/50 hover:text-text'
                      } ${canEdit === false ? 'opacity-50 cursor-default' : ''}`}
                    >
                      {planned ? '○ Planned' : '● Actual'}
                    </button>
                  </>
                )}
              </div>
            )
          })()}

          {/* Online meeting toggle (Outlook/Google — create and edit) */}
          {isExternalCalSource && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isOnlineMeeting}
                onChange={e => setIsOnlineMeeting(e.target.checked)}
                className="accent-primary w-4 h-4"
              />
              <span className="text-xs font-bold text-text-muted">
                {isGoogleSource ? 'Google Meet' : 'Teams meeting'}
              </span>
            </label>
          )}

          {/* Location (Outlook/Google) */}
          {isExternalCalSource && (location || canEdit) && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">Location</label>
              {canEdit ? (
                <input
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  placeholder="Add a location..."
                />
              ) : (
                <p className="text-sm text-text-muted">{location}</p>
              )}
            </div>
          )}

          {/* Activity type (Herbe only) */}
          {isErpSource && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1.5">
                Activity Type
                {activityTypeCode && <span className="font-mono text-primary normal-case text-[11px]">{activityTypeCode}</span>}
              </label>
              {recentTypes.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
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
                          isSelected ? 'border-current' : 'border-border text-text-muted hover:border-primary/50'
                        }`}
                        style={c ? (() => {
                          const rc = readableAccentColor(c, isDarkTheme)
                          return {
                            borderColor: isSelected ? rc : rc + '44',
                            color: rc,
                            background: isSelected ? c + '22' : c + '11',
                          }
                        })() : undefined}
                      >
                        {code}
                      </button>
                    )
                  })}
                </div>
              )}
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
                      style={tIdx === focusedTypeIdx ? (() => { const c = getTypeColor?.(t.code); return c ? { background: c + '18' } : undefined })() : undefined}
                    >
                      {(() => {
                        const c = getTypeColor?.(t.code)
                        return (
                          <span
                            className="font-mono text-xs w-12 shrink-0 rounded px-1 py-0.5 text-center border"
                            style={c ? { background: c + '22', color: readableAccentColor(c, isDarkTheme), borderColor: readableAccentColor(c, isDarkTheme) + '33' } : { color: 'var(--color-primary)', borderColor: 'transparent' }}
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
          {isErpSource && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1.5">
                Project{currentGroup?.forceProj && <span className="text-red-400">*</span>}
                {projectCode && <span className="font-mono text-primary normal-case text-[11px]">{projectCode}</span>}
                {projectCode && (() => {
                  const link = activeErpConnection?.serpUuid ? `hansa://${activeErpConnection.serpUuid}/v1/${activeErpConnection.companyCode || companyCode}/PRVc/${projectCode}` : serpLink('PRVc', projectCode, companyCode)
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
          {isErpSource && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1.5">
                Customer{currentGroup?.forceCust && <span className="text-red-400">*</span>}
                {customerCode && <span className="font-mono text-primary normal-case text-[11px]">{customerCode}</span>}
                {customerCode && (() => {
                  const link = activeErpConnection?.serpUuid ? `hansa://${activeErpConnection.serpUuid}/v1/${activeErpConnection.companyCode || companyCode}/CUVc/${customerCode}` : serpLink('CUVc', customerCode, companyCode)
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
          {isErpSource && (currentGroup?.forceItem || itemCode) && (
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

          {/* Additional text / Notes */}
          {(isErpSource || isExternalCalSource) && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">
                {isExternalCalSource ? 'Notes' : 'Additional Text'}{isErpSource && currentGroup?.forceTextInMatrix && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              <textarea
                value={textInMatrix}
                onChange={e => setTextInMatrix(e.target.value)}
                rows={2}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
                placeholder={isExternalCalSource ? 'Meeting notes...' : 'Optional additional description…'}
              />
            </div>
          )}
          </div>
        </div>}

        {/* Footer actions */}
        {!savedActivity && <div className="p-4 border-t border-border">
          {/* If editing but canEdit is false, show close only */}
          {isEdit && !(canEdit ?? true) ? (
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 border border-border text-text-muted font-bold py-3 rounded-xl hover:bg-border transition-colors">
                Close
              </button>
              <button
                onClick={handleDuplicate}
                title={`Duplicate activity (${isMac ? '⌃⌘Y' : 'Ctrl+Alt+Y'})`}
                className="px-4 border border-border text-text-muted rounded-xl text-lg leading-none hover:border-primary/50 hover:text-text transition-colors"
              >
                ⧉
              </button>
            </div>
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
              {isEdit && (
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
      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          destructive={confirmState.destructive}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}

/** Compact icon + dropdown for pre-filling activity from a template */
function TemplateQuickPick({ onApply, activityTypes }: {
  onApply: (t: { fields: Record<string, string>; duration?: number; description?: string; location?: string; onlineMeeting?: boolean }) => void
  activityTypes: ActivityType[]
}) {
  const [templates, setTemplates] = useState<{ id: string; name: string; duration_minutes: number; targets: { erp?: { fields: Record<string, string> }[]; outlook?: { enabled?: boolean; onlineMeeting?: boolean; location?: string }; google?: { enabled?: boolean; onlineMeeting?: boolean; location?: string } } }[]>([])
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      if (dropdownRef.current?.contains(e.target as Node)) return
      if (buttonRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open])

  function toggle() {
    if (!loaded) {
      fetch('/api/settings/templates').then(r => r.json()).then(data => {
        setTemplates(Array.isArray(data) ? data : [])
        setLoaded(true)
        setOpen(true)
      }).catch(() => setLoaded(true))
    } else {
      setOpen(o => !o)
    }
  }

  return (
    <span className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        tabIndex={-1}
        onClick={toggle}
        className="text-text-muted hover:text-primary transition-colors leading-none px-0.5"
        title="Fill from template"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block" style={{ verticalAlign: 'middle' }}>
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M9 21V9"/>
        </svg>
      </button>
      {open && (
        <div ref={dropdownRef} className="absolute left-0 top-5 z-[70] bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[180px]">
          {loaded && templates.length === 0 ? (
            <p className="px-3 py-2 text-xs text-text-muted">No templates. Create one in Settings &gt; Templates.</p>
          ) : !loaded ? (
            <p className="px-3 py-2 text-xs text-text-muted animate-pulse">Loading...</p>
          ) : templates.map(t => {
            const erpFields = t.targets?.erp?.[0]?.fields ?? {}
            const typeName = erpFields.ActType ? activityTypes.find(at => at.code === erpFields.ActType)?.name : undefined
            return (
              <button
                key={t.id}
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setOpen(false)
                  const outlookTarget = t.targets?.outlook
                  const googleTarget = t.targets?.google
                  const loc = outlookTarget?.location || googleTarget?.location || undefined
                  const online = outlookTarget?.onlineMeeting ?? googleTarget?.onlineMeeting ?? undefined
                  onApply({ fields: erpFields, duration: t.duration_minutes, description: t.name, location: loc, onlineMeeting: online })
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-border/30 transition-colors"
              >
                <span className="font-bold">{t.name}</span>
                <span className="text-text-muted ml-1">({t.duration_minutes}min)</span>
                {typeName && <span className="block text-[10px] text-text-muted mt-0.5">{erpFields.ActType} · {typeName}</span>}
              </button>
            )
          })}
        </div>
      )}
    </span>
  )
}
