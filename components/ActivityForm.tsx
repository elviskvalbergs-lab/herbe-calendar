'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { Activity, ActivityType, ActivityClassGroup, SearchResult, Person } from '@/types'
import type { Destination } from '@/lib/destinations/types'
import { destinationFromInitial } from '@/lib/destinations/fromInitial'
import { DestinationPicker } from './DestinationPicker'
import ErrorBanner from './ErrorBanner'
import ConfirmDialog from './ConfirmDialog'
import { useConfirm } from '@/lib/useConfirm'
import { useFocusTrap } from '@/lib/useFocusTrap'
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
      // Ambiguous name match: only accept when the email domain also matches an internal person.
      // Otherwise treat as external — blindly picking the first person by name misattributes events.
      if (group && att.email) {
        const attDomain = att.email.split('@')[1]?.toLowerCase()
        const domainMatch = group.find(p => p.email?.split('@')[1]?.toLowerCase() === attDomain)
        if (domainMatch) { codes.add(domainMatch.code); continue }
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
  onSaved: (taskInfo?: {
    source: 'herbe' | 'outlook' | 'google'
    patch?: { taskId: string; fields: { title?: string; description?: string; dueDate?: string } }
    /** Set when an event save originated from "move task to calendar" — the
     *  parent should mark this task done and refetch the task list. */
    completeSourceTask?: { id: string; source: 'herbe' | 'outlook' | 'google'; connectionId?: string }
  }) => void
  onDuplicate: (initial: Partial<Activity>) => void
  onRsvp?: (status: Activity['rsvpStatus']) => void
  canEdit?: boolean  // if true, show edit/delete controls; undefined treated as true for create mode
  getTypeColor?: (typeCode: string) => string
  getTypeGroup?: (typeCode: string) => ActivityClassGroup | undefined
  companyCode?: string
  allCustomers?: { Code: string; Name: string }[]
  allProjects?: { Code: string; Name: string; CUCode: string | null; CUName: string | null }[]
  allItems?: { Code: string; Name: string }[]
  erpConnections?: { id: string; name: string; companyCode?: string; serpUuid?: string }[]
  zoomConfigured?: boolean
  mode?: 'event' | 'task'
  /** Set when the form was opened by duplicating or moving an existing record —
   *  the form treats it as already-dirty so closing without saving prompts. */
  seededFromCopy?: boolean
  /** When set, the original task is marked done after the new event saves
   *  (used by "move task to calendar"). */
  sourceTaskInfo?: { id: string; source: 'herbe' | 'outlook' | 'google'; connectionId?: string }
  /** Used by task edit-mode "move to calendar" footer button to open a new
   *  event seeded from the current form state. CalendarShell wires this to
   *  re-open the form with the right flags. */
  onMoveToCalendar?: (initial: Partial<Activity>, sourceTaskInfo: { id: string; source: 'herbe' | 'outlook' | 'google'; connectionId?: string }) => void
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

export function ActivityForm({
  initial, editId, people, defaultPersonCode, defaultPersonCodes, allActivities, onClose, onSaved, onDuplicate, onRsvp, canEdit = true, getTypeColor, getTypeGroup, companyCode = '1', allCustomers, allProjects, allItems, erpConnections = [], zoomConfigured, mode = 'event', seededFromCopy = false, sourceTaskInfo, onMoveToCalendar,
}: Props) {
  const isEdit = !!editId
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Edit mode: seed synchronously from `initial` so downstream source-derived
  // booleans and ERP connection lookups are correct on first render. Create
  // mode: start null; DestinationPicker auto-fires onChange with the localStorage
  // default (or first destination) after its fetch resolves.
  const [destination, setDestination] = useState<Destination | null>(
    () => isEdit ? destinationFromInitial(initial, mode, erpConnections) : null,
  )

  const isOutlookSource    = destination?.source === 'outlook'
  const isGoogleSource     = destination?.source === 'google'
  const isExternalCalSource = isOutlookSource || isGoogleSource
  const isErpSource        = destination?.source === 'herbe'
  const activeErpConnection = (destination?.meta.kind === 'herbe' && destination.meta.connectionId)
    ? erpConnections.find(c => c.id === (destination.meta as Extract<Destination['meta'], { kind: 'herbe' }>).connectionId)
    : undefined
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
  // Task mode leaves the date blank unless one was supplied — Outlook/Google
  // tasks support no-date, and the ERP backend stamps TransDate=today on create
  // when the client doesn't send dueDate.
  const [date, setDate] = useState(
    initial?.date ?? (mode === 'task' ? '' : format(new Date(), 'yyyy-MM-dd'))
  )
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
  const [done, setDone] = useState(initial?.done ?? false)
  const isDarkTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') !== 'light' : true
  const [itemCode, setItemCode] = useState(initial?.itemCode ?? '')
  const [itemName, setItemName] = useState('')
  const [itemResults, setItemResults] = useState<SearchResult[]>([])
  const [focusedItemIdx, setFocusedItemIdx] = useState(-1)
  const [itemSearchMsg, setItemSearchMsg] = useState<string | null>(null)
  const itemSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  // True after resetToCreate(copy) has seeded the form from a previously-saved
  // activity, or when the form was opened with `seededFromCopy` (e.g. from
  // TaskRow's "duplicate as task" / "move to calendar"). Discarding silently
  // loses pre-filled work, so closing prompts in that case.
  const [copyDirty, setCopyDirty] = useState(seededFromCopy)
  // Edit mode baseline: the destination at form open. When the user picks a
  // different list (Outlook or Google task), the save handler compares
  // `destination.meta` against this and sends a list-move directive to the
  // backend (Outlook: delete+recreate; Google: insert+delete).
  const [originalDestinationKey] = useState<string | null>(
    () => isEdit ? destinationFromInitial(initial, mode, erpConnections)?.key ?? null : null,
  )
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
  const [zoomMeeting, setZoomMeeting] = useState(false)
  const handleSaveRef = useRef<() => void>(() => {})
  const handleDuplicateRef = useRef<() => void>(() => {})
  const handleCloseRef = useRef<() => void>(() => {})
  const descInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const customerInputRef = useRef<HTMLInputElement>(null)
  const activityTypeInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useFocusTrap<HTMLDivElement>(true)
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
    done: initial?.done ?? false,
    itemCode: initial?.itemCode ?? '',
    textInMatrix: initial?.textInMatrix ?? '',
    selectedPersonCodes: selectedPersonCodes as string[],
    selectedCCPersonCodes: [...(initial?.ccPersons ?? [])] as string[],
  })
  const projectSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const customerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const saveShortcut = isMac ? '⌃⌘S' : 'Ctrl+S'

  // Focus the description input on new task creation and scroll it above the
  // mobile keyboard. Delayed a frame so the keyboard animation doesn't hide it.
  useEffect(() => {
    if (isEdit || mode !== 'task' || initial?.timeFrom) return
    const timer = setTimeout(() => {
      const el = descInputRef.current
      if (!el) return
      el.focus()
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 120)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Anchor the modal above the on-screen keyboard on mobile. Without this the
  // sheet opens at viewport bottom (which the keyboard now overlaps), and
  // only jumps up when async data loads forces a re-render. We use the
  // visualViewport API to compute the actual bottom-occluded pixels and set
  // it as a CSS variable consumed by the .aed-modal `bottom` rule.
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return
    const update = () => {
      const occluded = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      document.documentElement.style.setProperty('--keyboard-inset', `${occluded}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      document.documentElement.style.removeProperty('--keyboard-inset')
    }
  }, [])

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

  // Seed from `initial?.*` so a duplicate or initial-with-ERP-default survives
  // the first auto-fire restore. On first fire with an ERP destination the
  // restore becomes a no-op (sets state to values state already holds).
  const parkedErpFields = useRef({
    activityTypeCode: initial?.activityTypeCode ?? '',
    projectCode: initial?.projectCode ?? '',
    customerCode: initial?.customerCode ?? '',
    ccPersons: (initial?.ccPersons ?? []) as string[],
  })

  useEffect(() => {
    if (!destination) return
    if (destination.source === 'herbe') {
      setActivityTypeCode(parkedErpFields.current.activityTypeCode)
      setProjectCode(parkedErpFields.current.projectCode)
      setCustomerCode(parkedErpFields.current.customerCode)
      setSelectedCCPersonCodes(parkedErpFields.current.ccPersons)
    } else {
      parkedErpFields.current = {
        activityTypeCode,
        projectCode,
        customerCode,
        ccPersons: selectedCCPersonCodes,
      }
    }
  }, [destination?.key]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Resolve item name from code on mount
  useEffect(() => {
    if (itemCode && !itemName && Array.isArray(allItems) && allItems.length) {
      const match = allItems.find(i => i.Code === itemCode)
      if (match) setItemName(match.Name)
    }
  }, [allItems]) // eslint-disable-line react-hooks/exhaustive-deps

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
      .then(r => r.ok ? r.json() : [])
      .then((list: { Code: string; Name: string; CUCode: string | null; CUName: string | null }[]) => {
        setConnProjects(list)
        if (initial?.projectCode && !initial?.projectName) {
          const found = list.find(p => p.Code === initial.projectCode)
          if (found?.Name) setProjectName(found.Name)
        }
      })
      .catch(() => {})
    fetch(`/api/customers?all=1${connParam ? '&' + connParam.slice(1) : ''}`)
      .then(r => r.ok ? r.json() : [])
      .then((list: { Code: string; Name: string }[]) => {
        setConnCustomers(list)
        // ERP's ActVc response sometimes omits CUName even when CUCode is set,
        // so the form opens with the code visible but the name input empty.
        // Once the customer list has loaded, back-fill the name from the code.
        if (initial?.customerCode && !initial?.customerName) {
          const found = list.find(c => c.Code === initial.customerCode)
          if (found?.Name) setCustomerName(found.Name)
        }
      })
      .catch(() => {})

    // Load recent types for this connection
    const connKey = activeErpConnection?.id ?? 'default'
    setRecentTypes(getRecentTypes(connKey))
  }, [destination?.key]) // eslint-disable-line react-hooks/exhaustive-deps

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
      .filter(a => a.date === date && !a.planned && !a.isAllDay && a.source === 'herbe' && (a.mainPersons?.includes(defaultPersonCode) || a.personCode === defaultPersonCode))
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

  // Auto-fill item code from activity type (if the type has a default item)
  function autoFillItemFromType(typeCode: string) {
    if (!Array.isArray(activityTypes)) return
    const type = activityTypes.find(t => t.code === typeCode)
    if (type?.itemCode) {
      setItemCode(type.itemCode)
      const itemMatch = Array.isArray(allItems) ? allItems.find(i => i.Code === type.itemCode) : undefined
      setItemName(itemMatch?.Name ?? type.itemCode)
    }
  }

  function searchItems(q: string) {
    if (q.length < 2) { setItemResults([]); setItemSearchMsg(null); return }
    const connItems = allItems?.filter(i => {
      const connId = activeErpConnection?.id
      return !connId || true // items are not connection-scoped in the current data model
    }) ?? []
    if (connItems.length) {
      const lower = q.toLowerCase()
      const results = connItems
        .filter(i => i.Name.toLowerCase().includes(lower) || i.Code.toLowerCase().includes(lower))
        .slice(0, 20)
        .map(i => ({ code: i.Code, name: i.Name }))
      setItemResults(results)
      setItemSearchMsg(results.length === 0 ? 'No results' : null)
      return
    }
    // Fallback: server-side search
    fetch(`/api/items?q=${encodeURIComponent(q)}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: Record<string, unknown>[]) => {
        const results = data.map(d => ({ code: String(d['Code'] ?? ''), name: String(d['Name'] ?? '') })).filter(r => r.code)
        setItemResults(results)
        setItemSearchMsg(results.length === 0 ? 'No results' : null)
      })
      .catch(() => setItemSearchMsg('Search failed'))
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

  // Map of field -> friendly label, populated from server fieldErrors. Both
  // the input-level invalid styling and the summary chips in the error
  // banner read from this so they can't drift out of sync.
  const [invalidFieldMap, setInvalidFieldMap] = useState<Map<string, string>>(new Map())
  const invalidFields = invalidFieldMap // alias kept for readability at call sites
  const invalidFieldLabels = Array.from(invalidFieldMap.values())

  function applyFieldErrors(fieldErrors: Array<{ field: string; label: string; code: string }> | undefined) {
    console.log('[ActivityForm] fieldErrors from server:', fieldErrors)
    const next = new Map<string, string>()
    for (const f of fieldErrors ?? []) next.set(f.field, f.label)
    setInvalidFieldMap(next)
    const first = fieldErrors?.[0]
    if (!first) return
    const refByField: Record<string, { current: HTMLInputElement | null } | undefined> = {
      ActType: activityTypeInputRef,
      Comment: descInputRef,
      PRCode: projectInputRef,
      CUCode: customerInputRef,
    }
    const target = refByField[first.field]?.current
    if (target) {
      target.focus()
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  function clearFieldError(field: string) {
    setInvalidFieldMap(prev => {
      if (!prev.has(field)) return prev
      const next = new Map(prev)
      next.delete(field)
      // If this was the last outstanding field error, also dismiss the
      // banner — the user has addressed everything the server flagged.
      if (next.size === 0) setErrors([])
      return next
    })
  }

  // Clear the matching field highlight as soon as the underlying value
  // becomes truthy, regardless of whether the user typed it, picked from
  // the dropdown, or tab-completed. Typing-specific onChange handlers
  // already call clearFieldError, but selection paths (click/Enter on a
  // dropdown item, recent-types pill) don't — so we catch those here.
  useEffect(() => { if (activityTypeCode) clearFieldError('ActType') }, [activityTypeCode]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (projectCode) clearFieldError('PRCode') }, [projectCode]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (customerCode) clearFieldError('CUCode') }, [customerCode]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (description.trim()) clearFieldError('Comment') }, [description]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    const isTaskMode = mode === 'task'
    const errs: string[] = []
    if (!description.trim()) errs.push(isTaskMode ? 'Title is required' : 'Description is required')
    if (!isTaskMode) {
      if (!timeFrom) errs.push('Start time is required')
      if (!timeTo) errs.push('End time is required')
      if (timeFrom && timeTo && timeFrom >= timeTo) errs.push('End time must be after start time')
    }
    if (isErpSource && currentGroup?.forceProj && !projectCode) errs.push('Project is required for this activity type')
    if (isErpSource && currentGroup?.forceCust && !customerCode) errs.push('Customer is required for this activity type')
    if (isErpSource && currentGroup?.forceItem && !itemCode.trim()) errs.push('Item code is required for this activity type')
    if (isErpSource && currentGroup?.forceTextInMatrix && !textInMatrix.trim()) errs.push('Additional text is required for this activity type')
    if (errs.length) { setErrors(errs); return }

    setSaving(true)
    setErrors([])

    if (isTaskMode) {
      try {
        const taskSource = isOutlookSource ? 'outlook' : isGoogleSource ? 'google' : 'herbe'
        const rawId = editId && editId.includes(':') ? editId.split(':', 2)[1] : editId
        const url = isEdit
          ? `/api/tasks/${taskSource}/${encodeURIComponent(rawId ?? '')}`
          : `/api/tasks/${taskSource}`
        const method = isEdit ? 'PATCH' : 'POST'
        const body: Record<string, unknown> = {
          title: description,
          description: textInMatrix || undefined,
          dueDate: date || undefined,
        }
        if (taskSource === 'herbe') {
          body.connectionId = activeErpConnection?.id
          if (activityTypeCode) body.activityTypeCode = activityTypeCode
          if (projectCode) body.projectCode = projectCode
          if (customerCode) body.customerCode = customerCode
          body.mainPersons = selectedPersonCodes
          body.ccPersons = selectedCCPersonCodes
        }
        if (destination?.meta.kind === 'google-task') {
          body.googleTokenId = destination.meta.tokenId
          body.googleListId = destination.meta.listId
          body.googleListTitle = destination.meta.listName
        }
        if (destination?.meta.kind === 'outlook-task') {
          body.listId = destination.meta.listId
          body.listTitle = destination.meta.listName
        }
        // Edit-mode list change: user picked a different list in the
        // destination dropdown. Backend handles the move (Outlook:
        // delete+recreate; Google: insert+delete) — no separate UI needed.
        if (isEdit && originalDestinationKey && destination && destination.key !== originalDestinationKey) {
          if (destination.meta.kind === 'outlook-task') {
            body.targetListId = destination.meta.listId
            body.targetListTitle = destination.meta.listName
          } else if (destination.meta.kind === 'google-task') {
            body.targetGoogleListId = destination.meta.listId
            body.targetGoogleListTitle = destination.meta.listName
          }
        }
        // Include done status for task edits — lets the user toggle completion
        // from the form instead of only the sidebar checkbox, which is useful
        // when the sidebar toggle silently failed and there's no visible error.
        if (isEdit) body.done = done
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setErrors([String(data?.error ?? `Server error (${res.status})`)])
          applyFieldErrors(data?.fieldErrors)
          setSaving(false)
          return
        }
        // Pass the source so CalendarShell can refetch only the edited channel
        // — ERP task fetches take tens of seconds, and there's no reason to
        // wait on them when a Google or Outlook task changed. The optimistic
        // patch lets the sidebar show the new title before the refetch lands.
        const patch = isEdit && editId ? {
          taskId: editId,
          fields: {
            title: description,
            description: textInMatrix || undefined,
            dueDate: date || undefined,
          },
        } : undefined
        try {
          if (destination && !isEdit) {
            localStorage.setItem(`defaultDestination:${mode}`, destination.key)
          }
        } catch {}
        onSaved({ source: taskSource, patch })
        setSaving(false)
        onClose()
      } catch (e) {
        setErrors([String(e)])
        setSaving(false)
      }
      return
    }

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
      if (isGoogleSource && !isEdit && destination?.meta.kind === 'google-event') {
        const tokenId = destination.meta.tokenId
        const calendarId = destination.meta.calendarId
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
        applyFieldErrors(data?.fieldErrors)
        setSaving(false)
        return
      }

      // Extract the created activity ID from the response
      const createdId = !isEdit
        ? String(data?.SerNr ?? data?.id ?? '')
        : ''

      try {
        if (destination && !isEdit) {
          localStorage.setItem(`defaultDestination:${mode}`, destination.key)
        }
      } catch {}
      onSaved(sourceTaskInfo ? { source: sourceTaskInfo.source, completeSourceTask: sourceTaskInfo } : undefined)
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
      setCopyDirty(false)
      setSaving(false)

      if (zoomMeeting) {
        try {
          const [hFrom, mFrom] = timeFrom.split(':').map(Number)
          const [hTo, mTo] = timeTo.split(':').map(Number)
          const durationMins = (hTo * 60 + mTo) - (hFrom * 60 + mFrom)
          const zoomRes = await fetch('/api/zoom/meetings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: description || 'Meeting', startTime: `${date}T${timeFrom}:00`, duration: durationMins || 30 }),
          })
          if (zoomRes.ok) {
            const zoomData = await zoomRes.json()
            setSavedActivity(prev => prev ? { ...prev, joinUrl: zoomData.joinUrl, videoProvider: 'zoom' } : prev)
          }
        } catch (e) {
          console.warn('[ActivityForm] Zoom meeting creation failed:', e)
        }
      }
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
    if (done !== iv.done) return true
    if (itemCode !== iv.itemCode) return true
    if (textInMatrix !== iv.textInMatrix) return true
    if (JSON.stringify([...selectedPersonCodes].sort()) !== JSON.stringify([...iv.selectedPersonCodes].sort())) return true
    const sortedCC = [...selectedCCPersonCodes].sort()
    const sortedInitCC = [...(iv.selectedCCPersonCodes ?? [])].sort()
    if (JSON.stringify(sortedCC) !== JSON.stringify(sortedInitCC)) return true
    return false
  }

  function handleClose() {
    if (computeIsDirty() || copyDirty) {
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

  function handleMoveToCalendar() {
    if (!onMoveToCalendar || !editId) return
    const taskSource = isOutlookSource ? 'outlook' : isGoogleSource ? 'google' : 'herbe'
    const rawId = editId.includes(':') ? editId.split(':', 2)[1] : editId
    onClose()
    onMoveToCalendar(
      {
        // Always reopen as an ERP/Outlook event regardless of task source —
        // CalendarShell decides the actual destination from selectedPersons /
        // calendar config. Carry the task's text + ERP fields so the new event
        // form is meaningfully prefilled.
        description,
        date,
        textInMatrix,
        activityTypeCode,
        projectCode,
        projectName,
        customerCode,
        customerName,
        personCode: selectedPersonCodes[0],
        mainPersons: selectedPersonCodes,
        ccPersons: selectedCCPersonCodes,
      },
      { id: rawId, source: taskSource, connectionId: activeErpConnection?.id },
    )
  }

  function resetToCreate(copy: Partial<Activity> | null, timeHint?: string) {
    setSavedActivity(null)
    setErrors([])
    if (copy) {
      setDescription(copy.description ?? '')
      setDate(copy.date ?? (mode === 'task' ? '' : format(new Date(), 'yyyy-MM-dd')))
      setActivityTypeCode(copy.activityTypeCode ?? '')
      setCurrentGroup(copy.activityTypeCode ? getTypeGroup?.(copy.activityTypeCode) : undefined)
      setProjectCode(copy.projectCode ?? '')
      setProjectName(copy.projectName ?? '')
      setCustomerCode(copy.customerCode ?? '')
      setCustomerName(copy.customerName ?? '')
      setPlanned(copy.planned ?? false)
      setItemCode(copy.itemCode ?? '')
      const itemMatch = allItems?.find(i => i.Code === copy.itemCode)
      setItemName(itemMatch?.Name ?? copy.itemCode ?? '')
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
      setItemName('')
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
      done: copy?.done ?? false,
      itemCode: copy?.itemCode ?? '',
      textInMatrix: copy?.textInMatrix ?? '',
      selectedPersonCodes: [...selectedPersonCodes],
      selectedCCPersonCodes: [...(copy?.ccPersons ?? [])],
    }
    setSelectedCCPersonCodes(copy?.ccPersons ?? [])
    setCCPersonsExpanded(false)
    setCopyDirty(!!copy)
  }

  const initialDestinationKey = useMemo(() => {
    try { return localStorage.getItem(`defaultDestination:${mode}`) } catch { return null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="backdrop" onClick={handleClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-form-title"
        className={`modal aed-modal ${isEdit ? 'aed-modal-edit' : 'aed-modal-new'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle (mobile) — touch here to drag-dismiss */}
        <div
          className="aed-drag-handle"
          onTouchStart={handleDragHandleTouchStart}
          onTouchMove={handleDragHandleTouchMove}
          onTouchEnd={handleDragHandleTouchEnd}
        >
          <div />
        </div>

        {/* Header — drag-to-dismiss lives on .aed-drag-handle above so header taps (close, copy, etc.) stay clean. */}
        <div className="aed-header">
          <h2 id="activity-form-title" className="aed-title flex items-center gap-2 flex-wrap">
            {(() => {
              const noun = mode === 'task' ? 'task' : 'event'
              if (!isEdit) return `New ${noun}`
              return canEdit === false ? `View ${noun}` : `Edit ${noun}`
            })()}
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
              // Task ids come prefixed (herbe:42, outlook:abc, google:xyz); events use raw ids.
              // Strip the prefix before building source-system URLs.
              const rawEditId = editId.includes(':') ? editId.split(':', 2)[1] : editId
              const herbeLink = isErpSource && connUuid ? `hansa://${connUuid}/v1/${connCompany}/ActVc/${rawEditId}` : null
              // For events, open in the calendar web UI. Task-specific deep links
              // don't exist cleanly for Outlook/Google Tasks, so we skip them.
              const googleWebLink = initial?.webLink && initial?.googleAccountEmail
                ? `${initial.webLink}${initial.webLink.includes('?') ? '&' : '?'}authuser=${encodeURIComponent(initial.googleAccountEmail)}`
                : initial?.webLink
              const externalCalLink = mode === 'event' && isExternalCalSource
                ? (googleWebLink || (isOutlookSource ? `https://outlook.office.com/calendar/item/${encodeURIComponent(rawEditId)}` : null))
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
                      <>#{rawEditId} <SerpIcon /></>
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
                <span className="font-mono text-[11px] font-normal px-2 py-0.5 rounded-lg border border-primary/50 bg-primary/10 text-primary">#{rawEditId}</span>
              ) : null
            })()}
            {/* View-only badge in header */}
            {canEdit === false && (
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400">View only</span>
            )}
          </h2>
          <button onClick={handleClose} aria-label="Close" className="icon-btn shrink-0 aed-close">✕</button>
        </div>

        {/* Calendar source label — only for cases the header pill doesn't already
            disambiguate. ICS has no header pill (read-only feed), so it stays.
            Google's calendar *name* (e.g. "Holidays") adds info beyond the
            generic "Google" pill, so it stays when present. The bare
            "Google Calendar" line was redundant with the header pill — gone. */}
        {initial?.icsCalendarName && (
          <div className="px-4 py-1.5 border-b border-border bg-primary/5">
            <p className="text-[11px] text-text-muted">📂 {initial.icsCalendarName}</p>
          </div>
        )}
        {initial?.googleCalendarName && (
          <div className="px-4 py-1.5 border-b border-border bg-primary/5">
            <p className="text-[11px] text-text-muted">📂 {initial.googleCalendarName}{initial.googleAccountEmail ? ` (${initial.googleAccountEmail})` : ''}</p>
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
                    className="btn btn-outline w-full"
                    style={{ justifyContent: 'center', height: 40 }}
                  >
                    Create another (copy)
                  </button>
                  <button
                    onClick={() => resetToCreate(null, savedActivity?.timeTo)}
                    className="btn btn-ghost w-full"
                    style={{ justifyContent: 'center', height: 40 }}
                  >
                    Create blank
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="btn btn-primary w-full"
                style={{ justifyContent: 'center', height: 40 }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Scrollable body */}
        {!savedActivity && <div className="aed-body flex-1 space-y-3">
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

          {/* RSVP buttons — only for your own event (not colleagues'), and not in task mode */}
          {mode === 'event' && isExternalCalSource && !initial?.isExternal && rsvpStatus !== 'organizer' && initial?.personCode === defaultPersonCode && (
            <div>
              <label className="aed-label">RSVP</label>
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

          {!isEdit && (
            <DestinationPicker
              mode={mode}
              value={destination?.key ?? null}
              initialKey={initialDestinationKey}
              onChange={(next) => setDestination(next)}
            />
          )}
          {isEdit && destination && (() => {
            // Task edits for Outlook/Google: let the user change the list.
            // The save handler diffs destination vs originalDestinationKey and
            // moves transparently (Outlook: delete+recreate; Google: insert+delete).
            const isTaskListEditable = mode === 'task' && (destination.meta.kind === 'outlook-task' || destination.meta.kind === 'google-task') && canEdit !== false
            if (isTaskListEditable) {
              const sourceKind = destination.meta.kind
              return (
                <DestinationPicker
                  mode="task"
                  value={destination.key}
                  filter={d => d.meta.kind === sourceKind}
                  onChange={(next) => setDestination(next)}
                />
              )
            }
            return (
              <div className="destination-picker">
                <label className="aed-label">Destination</label>
                <div className="destination-picker-row">
                  <span className="destination-color-dot" style={{ background: destination.color }} aria-hidden="true" />
                  <input
                    type="text"
                    className="input aed-input"
                    value={destination.label && destination.label !== destination.sourceLabel
                      ? `${destination.sourceLabel} · ${destination.label}`
                      : destination.sourceLabel}
                    disabled
                    readOnly
                  />
                </div>
              </div>
            )
          })()}

          <ErrorBanner errors={errors} fieldLabels={invalidFieldLabels} />

          {/* Person(s) — hidden for Outlook/Google task mode; those APIs don't support assignees */}
          {!(mode === 'task' && isExternalCalSource) && (() => {
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
                <div className="aed-label">Person(s){isErpSource && <span className="req"> *</span>}</div>
                <div className="aed-chips">
                  {people.filter(p => selectedPersonCodes.includes(p.code)).map(p => (
                    <button
                      key={p.code}
                      tabIndex={-1}
                      onClick={() => { if (!canEdit) return; setSelectedPersonCodes(prev => prev.filter(c => c !== p.code)) }}
                      className={`aed-pchip on ${canEdit ? '' : 'readonly'}`}
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
                      className="aed-pchip"
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
                      className="aed-pchip more"
                    >
                      +{hiddenCount} more
                    </button>
                  )}
                  {personsExpanded && unselected.length > 3 && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setPersonsExpanded(false)}
                      className="aed-pchip more"
                    >
                      Show less
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
                <div className="aed-label">CC Person(s)</div>
                <div className="aed-chips ghost">
                  {people.filter(p => selectedCCPersonCodes.includes(p.code)).map(p => (
                    <button key={p.code} tabIndex={-1}
                      onClick={() => { if (!canEdit) return; setSelectedCCPersonCodes(prev => prev.filter(c => c !== p.code)) }}
                      className={`aed-pchip on ${canEdit ? '' : 'readonly'}`}
                      title={`${p.name}${p.email ? ` <${p.email}>` : ''}`}
                    >
                      {p.code}
                    </button>
                  ))}
                  {visibleUnselected.map(p => (
                    <button key={p.code} tabIndex={-1}
                      onClick={() => setSelectedCCPersonCodes(prev => [...prev, p.code])}
                      className="aed-pchip"
                      title={`${p.name}${p.email ? ` <${p.email}>` : ''}`}
                    >
                      {p.code}
                    </button>
                  ))}
                  {hiddenCount > 0 && (
                    <button type="button" tabIndex={-1}
                      onClick={() => setCCPersonsExpanded(true)}
                      className="aed-pchip more"
                    >
                      +{hiddenCount} more
                    </button>
                  )}
                  {ccPersonsExpanded && unselected.length > 3 && (
                    <button type="button" tabIndex={-1}
                      onClick={() => setCCPersonsExpanded(false)}
                      className="aed-pchip more"
                    >
                      Show less
                    </button>
                  )}
                </div>
              </div>
            )
          })()}

          {/* External attendees (Outlook only — event mode) */}
          {mode === 'event' && isExternalCalSource && externalAttendees.length > 0 && (
            <div>
              <div className="aed-label">External Attendees</div>
              <div className="aed-ext-chips">
                {externalAttendees.map(email => (
                  <span key={email} className="aed-ext-chip">
                    {email}
                    {canEdit && (
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setExternalAttendees(prev => prev.filter(e => e !== email))}
                        className="text-text-muted/60 hover:text-text leading-none"
                        aria-label={`Remove ${email}`}
                      >×</button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {mode === 'event' && isExternalCalSource && canEdit && (
            <div>
              {externalAttendees.length === 0 && (
                <div className="aed-label">External Attendees</div>
              )}
              <div className="aed-ext-row">
                <input
                  value={externalAttendeeInput}
                  onChange={e => setExternalAttendeeInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addExternalAttendee()
                    }
                  }}
                  className="input aed-input"
                  placeholder="Add external email..."
                />
                <button
                  type="button"
                  onClick={addExternalAttendee}
                  className="aed-add-btn"
                  aria-label="Add external attendee"
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
            <div className="aed-label-row">
              <span className="aed-label-inline flex items-center gap-1.5">
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
                        autoFillItemFromType(t.fields.ActType)
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
              <span className="aed-hint"><span className="aed-hint-ico">↹</span> Tab moves fields · <span className="kbd-mini">{saveShortcut}</span> saves</span>
            </div>
            <div className="aed-input-wrap">
              <input
                ref={descInputRef}
                value={description}
                onChange={e => { setDescription(e.target.value); clearFieldError('Comment') }}
                autoFocus={!isEdit && !initial?.timeFrom}
                className={`input aed-input${invalidFields.has('Comment') ? ' aed-invalid' : ''}`}
                placeholder="What are you working on?"
              />
              {description && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => { setDescription(''); descInputRef.current?.focus() }}
                  className="aed-clear"
                  aria-label="Clear"
                >✕</button>
              )}
            </div>
          </div>

          {/* Date + Time From + Time To (Done sits inline next to Date for tasks) */}
          <div className={`aed-dt-grid${mode === 'task' ? ' aed-dt-grid-task' : ''}`}>
            <div>
              <div className="aed-label">Date</div>
              <div className="aed-input-wrap">
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  tabIndex={-1}
                  className="input aed-input"
                />
              </div>
            </div>
            {mode === 'task' && isEdit && (
              <label className="aed-checkbox aed-dt-done">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={e => setDone(e.target.checked)}
                  disabled={canEdit === false}
                />
                <span className="aed-check-box">{done && '✓'}</span>
                <span className="aed-check-label">Done</span>
              </label>
            )}
            {mode === 'event' && <div>
              <div className="aed-label"><span>From</span>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setTimeFrom(smartDefaultStart())}
                  title="Apply auto-start time"
                  className="aed-stopwatch"
                >⏱</button>
              </div>
              <div className="aed-input-wrap">
                <input
                  type="time"
                  lang="en-GB"
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
                  className="input aed-input"
                />
              </div>
            </div>}
            {mode === 'event' && <div>
              <div className="aed-label"><span>To</span>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    const now = new Date()
                    setTimeTo(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
                  }}
                  title="Set to current time"
                  className="aed-stopwatch"
                >⏱</button>
              </div>
              <div className="aed-input-wrap">
                <input
                  type="time"
                  lang="en-GB"
                  value={timeTo}
                  onChange={e => setTimeTo(e.target.value)}
                  className="input aed-input"
                />
              </div>
            </div>}
          </div>

          {/* Duration quick-select */}
          {mode === 'event' && timeFrom && (() => {
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
              <div className="aed-dur-row">
                <div className="aed-dur-chips">
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
                        className={`aed-dur-chip ${active ? 'on' : ''}`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                {isErpSource && (
                  <>
                    {initial?.okFlag && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg border bg-green-500/15 border-green-500/40 text-green-500">
                        ✓ OK'd
                      </span>
                    )}
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setPlanned(p => !p)}
                      disabled={canEdit === false}
                      className={`aed-actual ${planned ? 'on' : ''} ${canEdit === false ? 'opacity-50 cursor-default' : ''}`}
                      title={planned ? 'Planned — not yet actually performed' : 'Actual tracked time'}
                    >
                      <span className="aed-actual-dot" />
                      {planned ? 'Planned' : 'Actual'}
                    </button>
                  </>
                )}
              </div>
            )
          })()}

          {/* Online meeting toggle (Outlook/Google — create and edit) */}
          {mode === 'event' && isExternalCalSource && (
            <label className="aed-checkbox">
              <input
                type="checkbox"
                checked={isOnlineMeeting}
                onChange={e => setIsOnlineMeeting(e.target.checked)}
              />
              <span className="aed-check-box">{isOnlineMeeting && '✓'}</span>
              <span className="aed-check-label">
                {isGoogleSource ? 'Google Meet' : 'Teams meeting'}
              </span>
            </label>
          )}

          {/* Zoom meeting checkbox (all sources, when Zoom is configured) */}
          {mode === 'event' && zoomConfigured && (
            <label className="aed-checkbox">
              <input
                type="checkbox"
                checked={zoomMeeting}
                onChange={e => setZoomMeeting(e.target.checked)}
              />
              <span className="aed-check-box">{zoomMeeting && '✓'}</span>
              <span className="aed-check-label">Zoom meeting</span>
            </label>
          )}

          {/* Location (Outlook/Google) */}
          {mode === 'event' && isExternalCalSource && (location || canEdit) && (
            <div>
              <div className="aed-label">Location</div>
              {canEdit ? (
                <input
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="input aed-input"
                  placeholder="Add a location..."
                />
              ) : (
                <div className="aed-readonly-val">{location || '—'}</div>
              )}
            </div>
          )}

          {/* Activity type (Herbe only) */}
          {isErpSource && (
            <div>
              <div className="aed-label-row">
                <span className="aed-label-inline">
                  Activity Type{invalidFields.has('ActType') && <span className="req"> *</span>}
                  {activityTypeCode && <span className="font-mono text-primary normal-case text-[11px] ml-1">{activityTypeCode}</span>}
                </span>
              </div>
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
                          autoFillItemFromType(type.code)
                        }}
                        className={`px-1.5 py-0.5 rounded-[5px] font-mono text-[11px] font-bold border transition-colors min-w-[32px] h-[22px] inline-flex items-center justify-center ${
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
              <div className="aed-input-wrap">
                <input
                  ref={activityTypeInputRef}
                  value={activityTypeName}
                  onChange={e => { setActivityTypeName(e.target.value); setActivityTypeCode(''); setFocusedTypeIdx(-1); filterActivityTypes(e.target.value); clearFieldError('ActType') }}
                  onFocus={() => { if (!activityTypeResults.length) filterActivityTypes(activityTypeName) }}
                  onKeyDown={e => {
                    const n = activityTypeResults.length
                    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedTypeIdx(i => Math.min(i + 1, n - 1)); if (!n) filterActivityTypes(activityTypeName) }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedTypeIdx(i => Math.max(i - 1, -1)) }
                    else if ((e.key === 'Enter' || e.key === 'Tab') && focusedTypeIdx >= 0) {
                      if (e.key === 'Tab') e.preventDefault()
                      const t = activityTypeResults[focusedTypeIdx]
                      setActivityTypeCode(t.code); setActivityTypeName(t.name); setActivityTypeResults([]); setFocusedTypeIdx(-1); setCurrentGroup(getTypeGroup?.(t.code)); autoFillItemFromType(t.code)
                      if (e.key === 'Tab') projectInputRef.current?.focus()
                    } else if (e.key === 'Escape') { setActivityTypeResults([]); setFocusedTypeIdx(-1) }
                    else if (e.key === 'Enter') (e.target as HTMLElement).blur()
                  }}
                  enterKeyHint="search"
                  className={`input aed-input${invalidFields.has('ActType') ? ' aed-invalid' : ''}`}
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
                        autoFillItemFromType(t.code)
                        projectInputRef.current?.focus()
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${tIdx === focusedTypeIdx ? 'bg-primary/20' : 'hover:bg-border'}`}
                      style={tIdx === focusedTypeIdx ? (() => { const c = getTypeColor?.(t.code); return c ? { background: c + '18' } : undefined })() : undefined}
                    >
                      {(() => {
                        const c = getTypeColor?.(t.code)
                        return (
                          <span
                            className="font-mono text-[11px] font-bold min-w-[32px] h-[22px] shrink-0 rounded-[5px] px-1.5 inline-flex items-center justify-center border"
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
              <div className="aed-label-row">
                <span className="aed-label-inline">
                  Project{(currentGroup?.forceProj || invalidFields.has('PRCode')) && <span className="req"> *</span>}
                  {projectCode && <span className="font-mono text-primary normal-case text-[11px] ml-1">{projectCode}</span>}
                  {projectCode && (() => {
                    const link = activeErpConnection?.serpUuid ? `hansa://${activeErpConnection.serpUuid}/v1/${activeErpConnection.companyCode || companyCode}/PRVc/${projectCode}` : serpLink('PRVc', projectCode, companyCode)
                    return link ? (
                      <a href={link} title="Open project in Standard ERP" tabIndex={-1} className="text-text-muted hover:text-primary transition-colors ml-1" onClick={e => e.stopPropagation()}>
                        <SerpIcon />
                      </a>
                    ) : null
                  })()}
                </span>
                {projectSearchMsg && !searchingProjects && <span className="aed-hint">{projectSearchMsg}</span>}
              </div>
              <div className="aed-input-wrap">
                <input
                  ref={projectInputRef}
                  value={projectName}
                  onChange={e => {
                    setProjectName(e.target.value); setProjectCode(''); setFocusedProjectIdx(-1)
                    clearFieldError('PRCode')
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
                  className={`input aed-input${invalidFields.has('PRCode') ? ' aed-invalid' : ''}`}
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
              <div className="aed-label-row">
                <span className="aed-label-inline">
                  Customer{(currentGroup?.forceCust || invalidFields.has('CUCode')) && <span className="req"> *</span>}
                  {customerCode && <span className="font-mono text-primary normal-case text-[11px] ml-1">{customerCode}</span>}
                  {customerCode && (() => {
                    const link = activeErpConnection?.serpUuid ? `hansa://${activeErpConnection.serpUuid}/v1/${activeErpConnection.companyCode || companyCode}/CUVc/${customerCode}` : serpLink('CUVc', customerCode, companyCode)
                    return link ? (
                      <a href={link} title="Open customer in Standard ERP" tabIndex={-1} className="text-text-muted hover:text-primary transition-colors ml-1" onClick={e => e.stopPropagation()}>
                        <SerpIcon />
                      </a>
                    ) : null
                  })()}
                </span>
                {customerSearchMsg && !searchingCustomers && <span className="aed-hint">{customerSearchMsg}</span>}
              </div>
              <div className="aed-input-wrap">
                <input
                  ref={customerInputRef}
                  value={customerName}
                  onChange={e => {
                    setCustomerName(e.target.value); setCustomerCode(''); setFocusedCustomerIdx(-1)
                    clearFieldError('CUCode')
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
                  className={`input aed-input${invalidFields.has('CUCode') ? ' aed-invalid' : ''}`}
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
          {isErpSource && (currentGroup?.forceItem || (Array.isArray(activityTypes) && activityTypes.find(t => t.code === activityTypeCode)?.itemCode)) && (
            <div>
              <div className="aed-label-row">
                <span className="aed-label-inline">
                  Item{currentGroup?.forceItem && <span className="req"> *</span>}
                  {itemCode && <span className="font-mono text-primary normal-case text-[11px] ml-1">{itemCode}</span>}
                </span>
                {itemSearchMsg && <span className="aed-hint">{itemSearchMsg}</span>}
              </div>
              <div className="aed-input-wrap">
                <input
                  value={itemName || itemCode}
                  onChange={e => {
                    setItemName(e.target.value); setItemCode(''); setFocusedItemIdx(-1)
                    if (itemSearchTimer.current) clearTimeout(itemSearchTimer.current)
                    itemSearchTimer.current = setTimeout(() => searchItems(e.target.value), 300)
                  }}
                  onKeyDown={e => {
                    const n = itemResults.length
                    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedItemIdx(i => Math.min(i + 1, n - 1)) }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedItemIdx(i => Math.max(i - 1, -1)) }
                    else if ((e.key === 'Enter' || e.key === 'Tab') && focusedItemIdx >= 0) {
                      if (e.key === 'Tab') e.preventDefault()
                      const r = itemResults[focusedItemIdx]
                      setItemCode(r.code); setItemName(r.name); setItemResults([]); setItemSearchMsg(null); setFocusedItemIdx(-1)
                    } else if (e.key === 'Escape') { setItemResults([]); setFocusedItemIdx(-1) }
                    else if (e.key === 'Enter') (e.target as HTMLElement).blur()
                  }}
                  enterKeyHint="search"
                  className="input aed-input"
                  placeholder="Type to search… (min 2 chars)"
                />
                {(itemName || itemCode) && (
                  <button type="button" tabIndex={-1} onClick={() => { setItemCode(''); setItemName(''); setItemResults([]) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted/60 hover:text-text text-base leading-none">x</button>
                )}
              </div>
              {itemResults.length > 0 && (
                <div className="bg-bg border border-border rounded-lg mt-1 max-h-32 overflow-y-auto">
                  {itemResults.map((r, rIdx) => (
                    <button
                      key={r.code}
                      tabIndex={-1}
                      onClick={() => {
                        setItemCode(r.code); setItemName(r.name); setItemResults([]); setItemSearchMsg(null); setFocusedItemIdx(-1)
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm ${rIdx === focusedItemIdx ? 'bg-primary/20' : 'hover:bg-border'}`}
                    >
                      {r.name} <span className="text-text-muted text-xs">({r.code})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Additional text / Notes */}
          {(isErpSource || isExternalCalSource) && (
            <div>
              <div className="aed-label">
                {isExternalCalSource ? 'Notes' : 'Additional Text'}{isErpSource && currentGroup?.forceTextInMatrix && <span className="req"> *</span>}
              </div>
              <textarea
                value={textInMatrix}
                onChange={e => setTextInMatrix(e.target.value)}
                rows={2}
                className="textarea aed-textarea"
                placeholder={isExternalCalSource ? 'Meeting notes...' : 'Optional additional description…'}
              />
            </div>
          )}
          </div>
        </div>}

        {/* Footer actions */}
        {!savedActivity && <div className="aed-footer">
          {isEdit && !(canEdit ?? true) ? (
            <>
              <button onClick={onClose} className="btn btn-outline">
                Close
              </button>
              <div className="aed-spacer" />
              {mode === 'task' && onMoveToCalendar && (
                <button
                  onClick={handleMoveToCalendar}
                  title="Move task to calendar"
                  className="aed-dup-btn"
                  aria-label="Move task to calendar"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="17" rx="2"/>
                    <path d="M16 2v4M8 2v4M3 10h18"/>
                    <path d="M12 14v5M9.5 16.5h5"/>
                  </svg>
                </button>
              )}
              <button
                onClick={handleDuplicate}
                title={`Duplicate (${isMac ? '⌃⌘Y' : 'Ctrl+Alt+Y'})`}
                className="aed-dup-btn"
                aria-label="Duplicate"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            </>
          ) : (
            <>
              {isEdit && (canEdit ?? true) && (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="aed-del-btn"
                  title="Delete activity"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                  Delete
                </button>
              )}
              <div className="aed-spacer" />
              <button onClick={handleClose} className="btn btn-outline">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="aed-primary"
                title={`Save (${saveShortcut})`}
              >
                <span>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create activity'}</span>
                {!saving && <span className="aed-kbd">{saveShortcut}</span>}
              </button>
              {isEdit && mode === 'task' && onMoveToCalendar && (
                <button
                  onClick={handleMoveToCalendar}
                  title="Move task to calendar"
                  className="aed-dup-btn"
                  aria-label="Move task to calendar"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="17" rx="2"/>
                    <path d="M16 2v4M8 2v4M3 10h18"/>
                    <path d="M12 14v5M9.5 16.5h5"/>
                  </svg>
                </button>
              )}
              {isEdit && (
                <button
                  onClick={handleDuplicate}
                  title={`Duplicate (${isMac ? '⌃⌘Y' : 'Ctrl+Alt+Y'})`}
                  className="aed-dup-btn"
                  aria-label="Duplicate"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
              )}
            </>
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
  const [filter, setFilter] = useState('')
  const filterRef = useRef<HTMLInputElement>(null)
  const justClosedRef = useRef(false)
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
    if (justClosedRef.current) { justClosedRef.current = false; return }
    if (!loaded) {
      fetch('/api/settings/templates').then(r => r.json()).then(data => {
        setTemplates(Array.isArray(data) ? data : [])
        setLoaded(true)
        setOpen(true)
        setFilter('')
        setTimeout(() => filterRef.current?.focus(), 50)
      }).catch(() => setLoaded(true))
    } else {
      setOpen(o => {
        const next = !o
        if (next) { setFilter(''); setTimeout(() => filterRef.current?.focus(), 50) }
        return next
      })
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
        <div ref={dropdownRef} className="absolute left-0 top-5 z-[70] bg-surface border border-border rounded-lg shadow-lg min-w-[220px] max-h-[300px] flex flex-col">
          {loaded && templates.length === 0 ? (
            <p className="px-3 py-2 text-xs text-text-muted">No templates. Create one in Settings &gt; Templates.</p>
          ) : !loaded ? (
            <p className="px-3 py-2 text-xs text-text-muted animate-pulse">Loading...</p>
          ) : (<>
            {templates.length > 3 && (
              <div className="px-2 pt-2 pb-1 shrink-0">
                <input
                  ref={filterRef}
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  placeholder="Search templates..."
                  className="w-full bg-bg border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-primary text-text"
                  onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); e.stopPropagation() } }}
                />
              </div>
            )}
            <div className="overflow-y-auto py-1">
            {templates.filter(t => !filter || t.name.toLowerCase().includes(filter.toLowerCase())).map(t => {
            const erpFields = t.targets?.erp?.[0]?.fields ?? {}
            const typeName = erpFields.ActType ? activityTypes.find(at => at.code === erpFields.ActType)?.name : undefined
            return (
              <button
                key={t.id}
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  const outlookTarget = t.targets?.outlook
                  const googleTarget = t.targets?.google
                  const loc = outlookTarget?.location || googleTarget?.location || undefined
                  const online = outlookTarget?.onlineMeeting ?? googleTarget?.onlineMeeting ?? undefined
                  onApply({ fields: erpFields, duration: t.duration_minutes, description: t.name, location: loc, onlineMeeting: online })
                  setOpen(false)
                  justClosedRef.current = true
                  setTimeout(() => { justClosedRef.current = false }, 300)
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-border/30 transition-colors"
              >
                <span className="font-bold text-text">{t.name}</span>
                <span className="text-text-muted ml-1">({t.duration_minutes}min)</span>
                {typeName && <span className="block text-[10px] text-text-muted mt-0.5">{erpFields.ActType} · {typeName}</span>}
              </button>
            )
          })}
            </div>
          </>)}
        </div>
      )}
    </span>
  )
}

export default ActivityForm
