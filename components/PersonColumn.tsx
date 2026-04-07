'use client'
import { Activity, ShareVisibility } from '@/types'
import { GRID_START_HOUR, GRID_END_HOUR, PX_PER_HOUR, minutesToTime, timeToMinutes, snapToQuarter, pxToMinutes, timeToTopPx, durationToPx } from '@/lib/time'
import { buildLanedActivities } from '@/lib/layout'
import ActivityBlock from './ActivityBlock'
import { useRef, useState, useCallback, useLayoutEffect } from 'react'

function OutlookIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0 opacity-60" style={{ verticalAlign: 'middle' }}>
      <rect x="2" y="3" width="13" height="18" rx="1.5"/>
      <circle cx="8.5" cy="12" r="3.5"/>
      <path d="M15 7h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-6"/>
      <path d="M15 10h5M15 14h5"/>
    </svg>
  )
}

interface Props {
  personCode: string
  date: string
  activities: Activity[]
  sessionUserCode: string
  getActivityColor: (activity: Activity) => string
  getTypeName?: (typeCode: string) => string
  onSlotClick: (personCode: string, time: string, date: string) => void
  onActivityClick: (activity: Activity) => void
  onActivityUpdate: () => void
  scale?: number
  isLightMode?: boolean
  colMinVw?: number
  mobileSelectedId?: string | null
  onMobileSelect?: (id: string | null) => void
  visibility?: ShareVisibility
  startHour?: number
  endHour?: number
}

interface DragState {
  activity: Activity
  type: 'move' | 'resize'
  startY: number
  originalFrom: string
  originalTo: string
  currentFrom: string
  currentTo: string
  saving?: boolean
}

// Module-level flags for touch handling (shared with ActivityBlock pattern)
let allDayCloseCooldown = false
let allDayTouchActive = false
let allDayIsTouchDevice = false
if (typeof window !== 'undefined') {
  window.addEventListener('touchstart', () => { allDayIsTouchDevice = true }, { once: true })
}

function AllDayBanner({ activity, color, onClick, isMobileSelected, onMobileTap, onMobileClose, getTypeName, visibility }: {
  activity: Activity
  color: string
  onClick: (a: Activity) => void
  isMobileSelected: boolean
  onMobileTap: (id: string) => void
  onMobileClose: () => void
  getTypeName?: (typeCode: string) => string
  visibility?: ShareVisibility
}) {
  const [hovered, setHovered] = useState(false)
  const touchIsTapRef = useRef(true)
  const wasTouchRef = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const [alignRight, setAlignRight] = useState(false)
  const isOutlook = activity.source === 'outlook'

  useLayoutEffect(() => {
    if (!cardRef.current) { setAlignRight(false); return }
    const parentRect = cardRef.current.parentElement?.getBoundingClientRect()
    if (!parentRect) return
    setAlignRight(parentRect.left + parentRect.width / 2 > window.innerWidth / 2)
  }, [hovered, isMobileSelected])

  return (
    <div
      className="relative w-full"
      style={{ zIndex: (hovered || isMobileSelected) ? 40 : undefined }}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse' && !allDayCloseCooldown && !allDayIsTouchDevice) setHovered(true) }}
      onPointerLeave={() => setHovered(false)}
      onTouchStart={() => {
        allDayTouchActive = true
        wasTouchRef.current = true
        touchIsTapRef.current = !allDayCloseCooldown
        setHovered(false)
      }}
      onTouchMove={() => { touchIsTapRef.current = false }}
      onTouchEnd={(e) => {
        allDayTouchActive = false
        if (!touchIsTapRef.current) return
        if (cardRef.current?.contains(e.target as Node)) return
        e.preventDefault()
        onMobileTap(activity.id)
      }}
    >
      <button
        className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-bold truncate cursor-pointer hover:brightness-125"
        style={{ background: color + '33', color, borderLeft: `3px solid ${color}` }}
        onClick={() => {
          if (wasTouchRef.current || allDayTouchActive) { wasTouchRef.current = false; return }
          if (visibility) return
          onClick(activity)
        }}
      >
        {activity.description || '(all day)'}
      </button>
      {((!allDayIsTouchDevice && hovered) || isMobileSelected) && (
        <div
          ref={cardRef}
          className={`absolute z-50 rounded-xl shadow-2xl p-3 min-w-[180px] max-w-[240px] pointer-events-auto ${alignRight ? 'right-0' : 'left-0'}`}
          style={{ top: 0, border: `1px solid ${color}88`, background: 'var(--color-surface)', color: 'var(--color-text)', isolation: 'isolate' }}
          onClick={(e) => { e.stopPropagation(); if (visibility) return; onMobileClose(); onClick(activity) }}
        >
          {isMobileSelected && (
            <button
              className="absolute top-1 right-1 w-8 h-8 flex items-center justify-center rounded-full text-text-muted active:bg-border text-base font-bold"
              onTouchEnd={(e) => { e.stopPropagation() }}
              onClick={(e) => {
                e.stopPropagation()
                allDayCloseCooldown = true
                setTimeout(() => { allDayCloseCooldown = false }, 300)
                onMobileClose()
              }}
            >
              ✕
            </button>
          )}
          {visibility === 'busy' ? (
            <>
              <p className="text-xs font-bold leading-snug mb-1.5 pr-8" style={{ color }}>Busy</p>
              <p className="text-xs text-text-muted">All day</p>
            </>
          ) : visibility === 'titles' ? (
            <>
              <p className="text-xs font-bold leading-snug mb-1.5 pr-8" style={{ color }}>
                {activity.icsCalendarName ? '📅 ' : isOutlook ? <><OutlookIcon /> </> : null}{activity.description || '(all day)'}
              </p>
              <p className="text-xs text-text-muted">All day</p>
              {activity.icsCalendarName && (
                <p className="text-[10px] mt-1 text-text-muted truncate">📅 {activity.icsCalendarName}</p>
              )}
              {isOutlook && !activity.icsCalendarName && (
                <p className="text-[10px] mt-1 text-text-muted truncate">📅 Outlook Calendar</p>
              )}
              {!isOutlook && activity.source === 'herbe' && (
                <p className="text-[10px] mt-1 text-text-muted truncate">
                  {activity.erpConnectionName ? `ERP: ${activity.erpConnectionName}` : 'ERP'}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs font-bold leading-snug mb-1.5 pr-8" style={{ color }}>
                {activity.icsCalendarName ? '📅 ' : isOutlook ? <><OutlookIcon /> </> : null}{activity.description || '(all day)'}
              </p>
              <p className="text-xs text-text-muted">All day</p>
              {activity.activityTypeCode && (
                <p className="text-[10px] mt-1" style={{ color }}>
                  <span className="font-mono">{activity.activityTypeCode}</span>
                  {(getTypeName?.(activity.activityTypeCode) || activity.activityTypeName) && (
                    <span className="ml-1 not-italic">
                      {getTypeName?.(activity.activityTypeCode) || activity.activityTypeName}
                    </span>
                  )}
                </p>
              )}
              {activity.projectName && (
                <p className="text-xs text-text-muted mt-1 truncate">{activity.projectName}</p>
              )}
              {activity.customerName && (
                <p className="text-xs text-text-muted truncate">{activity.customerName}</p>
              )}
              {activity.icsCalendarName && (
                <p className="text-[10px] mt-1 text-text-muted truncate">📅 {activity.icsCalendarName}</p>
              )}
              {isOutlook && !activity.icsCalendarName && (
                <p className="text-[10px] mt-1 text-text-muted truncate">📅 Outlook Calendar</p>
              )}
              {!isOutlook && activity.source === 'herbe' && (
                <p className="text-[10px] mt-1 text-text-muted truncate">
                  {activity.erpConnectionName ? `ERP: ${activity.erpConnectionName}` : 'ERP'}
                </p>
              )}
              {activity.joinUrl && (
                <a
                  href={activity.joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="flex items-center justify-center gap-1.5 mt-2 w-full px-2 py-1.5 rounded text-[11px] font-bold text-white"
                  style={{ background: activity.icsCalendarName ? '#2563eb' : '#464EB8' }}
                >
                  🔗 Join meeting
                </a>
              )}
              {!visibility && (
                <button
                  className="mt-2 w-full px-2 py-1.5 rounded text-[11px] font-bold text-white"
                  style={{ background: color }}
                  onClick={(e) => { e.stopPropagation(); onMobileClose(); onClick(activity) }}
                >
                  View details
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function PersonColumn({
  personCode, date, activities, sessionUserCode, getActivityColor, getTypeName,
  onSlotClick, onActivityClick, onActivityUpdate, scale = 1, isLightMode = false, colMinVw = 44,
  mobileSelectedId = null, onMobileSelect, visibility,
  startHour, endHour
}: Props) {
  const columnRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dragError, setDragError] = useState<string | null>(null)
  const suppressClickRef = useRef(false)
  const setMobileSelectedId = onMobileSelect ?? (() => {})

  const effectiveStart = startHour ?? GRID_START_HOUR
  const effectiveEnd = endHour ?? GRID_END_HOUR
  const hours = Array.from({ length: effectiveEnd - effectiveStart }, (_, i) => effectiveStart + i)

  function canEdit(activity: Activity): boolean {
    if (activity.source === 'outlook') return !!activity.isOrganizer
    const inMainPersons = activity.mainPersons?.includes(sessionUserCode) ?? false
    const inAccessGroup = activity.accessGroup?.split(',').map(s => s.trim()).includes(sessionUserCode) ?? false
    const inCCPersons = activity.ccPersons?.includes(sessionUserCode) ?? false
    return activity.personCode === sessionUserCode || inMainPersons || inAccessGroup || inCCPersons
  }

  const rowHeight = PX_PER_HOUR * scale

  function handleSlotClick(hour: number, e: React.MouseEvent) {
    if (drag) return
    if (mobileSelectedId) { setMobileSelectedId(null); return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const offsetY = e.clientY - rect.top
    const fraction = offsetY / rect.height
    const minute = snapToQuarter(hour * 60 + Math.round(fraction * 60))
    onSlotClick(personCode, minutesToTime(minute), date)
  }

  function handleDragStart(e: React.PointerEvent<HTMLDivElement>, activity: Activity, type: 'move' | 'resize') {
    // Disable drag on touch devices — too finicky, conflicts with scrolling
    if (e.pointerType === 'touch') return
    e.preventDefault()
    const dragState: DragState = {
      activity, type, startY: e.clientY,
      originalFrom: activity.timeFrom, originalTo: activity.timeTo,
      currentFrom: activity.timeFrom, currentTo: activity.timeTo,
    }
    setDrag(dragState)

    function onMove(me: PointerEvent) {
      const deltaY = me.clientY - dragState.startY
      const rawDeltaMins = Math.round(pxToMinutes(deltaY, scale) / 15) * 15
      if (type === 'move') {
        const fromMins = timeToMinutes(dragState.originalFrom) + rawDeltaMins
        const toMins = timeToMinutes(dragState.originalTo) + rawDeltaMins
        dragState.currentFrom = minutesToTime(Math.max(effectiveStart * 60, fromMins))
        dragState.currentTo = minutesToTime(Math.min(effectiveEnd * 60, toMins))
      } else {
        const toMins = timeToMinutes(dragState.originalTo) + rawDeltaMins
        dragState.currentTo = minutesToTime(
          Math.max(timeToMinutes(dragState.originalFrom) + 15, Math.min(effectiveEnd * 60, toMins))
        )
      }
      setDrag({ ...dragState })
    }

    async function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)

      if (dragState.currentFrom === dragState.originalFrom && dragState.currentTo === dragState.originalTo) {
        setDrag(null)
        onActivityClick(activity)
        return
      }

      const action = type === 'move' ? 'move' : 'resize'
      const msg = `Are you sure you want to ${action} this activity to ${dragState.currentFrom}-${dragState.currentTo}?`
      if (!window.confirm(msg)) {
        setDrag(null)
        suppressClickRef.current = true
        setTimeout(() => { suppressClickRef.current = false }, 300)
        return
      }

      suppressClickRef.current = true
      setTimeout(() => { suppressClickRef.current = false }, 300)

      setDrag({ ...dragState, saving: true })
      const source = activity.source
      const url = source === 'herbe'
        ? `/api/activities/${activity.id}`
        : `/api/outlook/${activity.id}`
      const body = source === 'herbe'
        ? { StartTime: dragState.currentFrom, EndTime: dragState.currentTo }
        : {
            start: { dateTime: `${date}T${dragState.currentFrom}:00`, timeZone: 'Europe/Riga' },
            end: { dateTime: `${date}T${dragState.currentTo}:00`, timeZone: 'Europe/Riga' },
          }

      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }))
        setDragError(data.error ?? res.statusText ?? 'Could not save time change')
        setTimeout(() => setDragError(null), 4000)
      }
      setDrag(null)
      onActivityUpdate()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Separate all-day events from timed events
  const allDayActivities = activities.filter(a => a.isAllDay)
  // Only show timed activities that overlap with the visible grid range
  const timedActivities = activities.filter(a => {
    if (a.isAllDay) return false
    const fromMins = timeToMinutes(a.timeFrom)
    const toMins = timeToMinutes(a.timeTo)
    return toMins > effectiveStart * 60 && fromMins < effectiveEnd * 60
  })


  const herbeActivities = timedActivities.filter(a => a.source !== 'outlook')
  const outlookActivities = timedActivities.filter(a => a.source === 'outlook')
  const hasBoth = herbeActivities.length > 0 && outlookActivities.length > 0
  // When only outlook/ICS activities exist, show them in the main column
  const mainActivities = hasBoth ? herbeActivities : herbeActivities.length > 0 ? herbeActivities : outlookActivities

  const herbeLaned = buildLanedActivities(mainActivities)
  const outlookLaned = buildLanedActivities(hasBoth ? outlookActivities : [])

  return (
    <div ref={columnRef} className="flex-1 border-r border-border relative last:border-r-0" style={{ minWidth: `${colMinVw}vw` }}>
      {dragError && (
        <div className="absolute top-2 left-0 right-0 z-30 mx-2">
          <div className="bg-red-900/80 border border-red-500/50 rounded-lg px-3 py-2 text-xs text-red-300">
            {dragError}
          </div>
        </div>
      )}

      <div className="relative flex">
        {/* Herbe sub-column (or full column when no Outlook) — hosts the hour grid */}
        <div
          className="relative"
          style={{ width: hasBoth ? '60%' : '100%' }}
        >
          {hours.map(h => (
            <div
              key={h}
              className="border-b border-border/30 hover:bg-white/5 cursor-pointer relative"
              style={{ height: rowHeight }}
              onClick={(e) => handleSlotClick(h, e)}
            >
              <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-border/20" />
            </div>
          ))}

          {/* All-day events rendered as overlay blocks at the top of the grid */}
          {allDayActivities.map((act, i) => {
            const actColor = getActivityColor(act)
            const bannerHeight = rowHeight / 2
            return (
              <div
                key={act.id}
                className="absolute left-0 right-0 z-15 pointer-events-auto"
                style={{ top: i * bannerHeight, height: bannerHeight }}
              >
                <AllDayBanner
                  activity={act}
                  color={actColor}
                  onClick={onActivityClick}
                  isMobileSelected={mobileSelectedId === act.id}
                  onMobileTap={(id) => setMobileSelectedId(mobileSelectedId === id ? null : id)}
                  onMobileClose={() => setMobileSelectedId(null)}
                  getTypeName={getTypeName}
                  visibility={visibility}
                />
              </div>
            )
          })}

          {herbeLaned.map(({ activity: act, laneIndex, laneCount }) => {
            const isDragging = drag?.activity.id === act.id
            const isSaving = isDragging && drag!.saving
            const displayActivity = isDragging
              ? { ...act, timeFrom: drag!.currentFrom, timeTo: drag!.currentTo }
              : act
            const actHeight = Math.max(durationToPx(displayActivity.timeFrom, displayActivity.timeTo, scale), 20)
            const actColor = getActivityColor(act)
            return (
              <div
                key={act.id}
                className="absolute pointer-events-none"
                style={{
                  left: `${(laneIndex / laneCount) * 100}%`,
                  right: `${((laneCount - laneIndex - 1) / laneCount) * 100}%`,
                  top: 0,
                  bottom: 0,
                }}
              >
                <ActivityBlock
                  activity={displayActivity}
                  color={actColor}
                  height={actHeight}
                  onClick={(a) => { if (!suppressClickRef.current) onActivityClick(a) }}
                  onDragStart={handleDragStart}
                  canEdit={canEdit(act)}
                  isCC={
                    (act.ccPersons?.includes(personCode) ?? false) &&
                    !(act.mainPersons?.includes(personCode) ?? false)
                  }
                  isLightMode={isLightMode}
                  getTypeName={getTypeName}
                  scale={scale}
                  mobileSelected={mobileSelectedId === act.id}
                  onMobileTap={(id) => setMobileSelectedId(mobileSelectedId === id ? null : id)}
                  onMobileClose={() => setMobileSelectedId(null)}
                  style={isDragging
                    ? { opacity: isSaving ? 0.5 : 0.7, outline: `2px dashed ${actColor}` }
                    : undefined}
                  visibility={visibility}
                  startHour={effectiveStart}
                />
                {isDragging && (
                  <div
                    className="absolute left-1 text-[9px] font-bold pointer-events-none z-20"
                    style={{ top: timeToTopPx(drag!.currentFrom, scale, effectiveStart) - 14, color: actColor }}
                  >
                    {isSaving ? '⏳' : ''}{drag!.currentFrom}–{drag!.currentTo}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {hasBoth && (
          <div
            className="relative border-l border-border/40"
            style={{ width: '40%' }}
          >
            {hours.map(h => (
              <div key={h} className="border-b border-border/30" style={{ height: rowHeight }} />
            ))}

            {outlookLaned.map(({ activity: act, laneIndex, laneCount }) => {
              const isDragging = drag?.activity.id === act.id
              const isSaving = isDragging && drag!.saving
              const displayActivity = isDragging
                ? { ...act, timeFrom: drag!.currentFrom, timeTo: drag!.currentTo }
                : act
              const actHeight = Math.max(durationToPx(displayActivity.timeFrom, displayActivity.timeTo, scale), 20)
              const actColor = getActivityColor(act)
              return (
                <div
                  key={act.id}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${(laneIndex / laneCount) * 100}%`,
                    right: `${((laneCount - laneIndex - 1) / laneCount) * 100}%`,
                    top: 0,
                    bottom: 0,
                  }}
                >
                  <ActivityBlock
                    activity={displayActivity}
                    color={actColor}
                    height={actHeight}
                    onClick={(a) => { if (!suppressClickRef.current) onActivityClick(a) }}
                    onDragStart={handleDragStart}
                    canEdit={canEdit(act)}
                    isLightMode={isLightMode}
                    scale={scale}
                    mobileSelected={mobileSelectedId === act.id}
                    onMobileTap={(id) => setMobileSelectedId(mobileSelectedId === id ? null : id)}
                    onMobileClose={() => setMobileSelectedId(null)}
                    style={isDragging
                      ? { opacity: isSaving ? 0.5 : 0.7, outline: `2px dashed ${actColor}` }
                      : undefined}
                    visibility={visibility}
                    startHour={effectiveStart}
                  />
                  {isDragging && (
                    <div
                      className="absolute left-1 text-[9px] font-bold pointer-events-none z-20"
                      style={{ top: timeToTopPx(drag!.currentFrom, scale, effectiveStart) - 14, color: actColor }}
                    >
                      {isSaving ? '⏳' : ''}{drag!.currentFrom}–{drag!.currentTo}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
