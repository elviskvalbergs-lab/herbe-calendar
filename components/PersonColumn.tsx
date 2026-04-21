'use client'
import { Activity, ShareVisibility } from '@/types'
import { GRID_START_HOUR, GRID_END_HOUR, PX_PER_HOUR, minutesToTime, timeToMinutes, snapToQuarter, pxToMinutes, timeToTopPx, durationToPx } from '@/lib/time'
import { buildLanedActivities } from '@/lib/layout'
import ActivityBlock from './ActivityBlock'
import { EventPreviewCard } from './EventPreviewCard'
import { readableAccentColor } from '@/lib/activityColors'
import { useRef, useState, useCallback, useLayoutEffect } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { useConfirm } from '@/lib/useConfirm'

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
  isHoliday?: boolean
  holidayName?: string
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

function AllDayBanner({ activity, color, onClick, isMobileSelected, onMobileTap, onMobileClose, getTypeName, visibility, isLightMode = false }: {
  activity: Activity
  color: string
  onClick: (a: Activity) => void
  isMobileSelected: boolean
  onMobileTap: (id: string) => void
  onMobileClose: () => void
  getTypeName?: (typeCode: string) => string
  visibility?: ShareVisibility
  isLightMode?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const touchIsTapRef = useRef(true)
  const wasTouchRef = useRef(false)
  const bannerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!hovered && !isMobileSelected) { setCardPos(null); return }
    const el = bannerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const isNarrow = window.innerWidth < 480
    const cardW = isNarrow ? Math.min(280, window.innerWidth - 24) : 320
    const cardH = 320
    const MARGIN = 8
    const topbar = document.querySelector('.topbar') as HTMLElement | null
    const topMin = topbar ? topbar.getBoundingClientRect().bottom + 6 : MARGIN
    const bottomMax = window.innerHeight - cardH - MARGIN
    // Prefer flush below the banner; if it would overflow, place flush above.
    // Zero gap keeps the cursor path continuous so hover survives the move.
    let top = rect.bottom
    if (top > bottomMax) top = rect.top - cardH
    top = Math.max(topMin, Math.min(top, bottomMax))
    // Horizontally align with banner, keep within viewport.
    let left = rect.left
    if (left + cardW > window.innerWidth - MARGIN) left = rect.right - cardW
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - cardW - MARGIN))
    setCardPos({ left, top })
  }, [hovered, isMobileSelected])

  return (
    <div
      ref={bannerRef}
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
        style={{ background: color + '33', color: readableAccentColor(color, !isLightMode), borderLeft: `3px solid ${color}` }}
        onClick={() => {
          if (wasTouchRef.current || allDayTouchActive) { wasTouchRef.current = false; return }
          if (visibility) return
          onClick(activity)
        }}
      >
        {activity.description || '(all day)'}
      </button>
      {((!allDayIsTouchDevice && hovered) || isMobileSelected) && (
        <EventPreviewCard
          ref={cardRef}
          activity={activity}
          color={color}
          position={cardPos}
          isSticky={isMobileSelected}
          isLightMode={isLightMode}
          visibility={visibility}
          getTypeName={getTypeName}
          onClose={isMobileSelected ? () => {
            allDayCloseCooldown = true
            setTimeout(() => { allDayCloseCooldown = false }, 300)
            onMobileClose()
          } : undefined}
          onEdit={() => { onMobileClose(); onClick(activity) }}
          onCardClick={(e) => { e.stopPropagation(); if (visibility) return; onMobileClose(); onClick(activity) }}
        />
      )}
    </div>
  )
}

export default function PersonColumn({
  personCode, date, activities, sessionUserCode, getActivityColor, getTypeName,
  onSlotClick, onActivityClick, onActivityUpdate, scale = 1, isLightMode = false, colMinVw = 44,
  mobileSelectedId = null, onMobileSelect, visibility,
  startHour, endHour, isHoliday = false, holidayName
}: Props) {
  const columnRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dragError, setDragError] = useState<string | null>(null)
  const suppressClickRef = useRef(false)
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm()
  const setMobileSelectedId = onMobileSelect ?? (() => {})
  /** Scope mobile selection to this column so multi-person activities only open one preview */
  const mobileKey = (actId: string) => `${actId}:${personCode}`

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
      const msg = `${action === 'move' ? 'Move' : 'Resize'} this activity to ${dragState.currentFrom}-${dragState.currentTo}?`
      const capturedDragState = { ...dragState }
      confirm(msg, async () => {
        suppressClickRef.current = true
        setTimeout(() => { suppressClickRef.current = false }, 300)

        setDrag({ ...capturedDragState, saving: true })
        const source = activity.source
        const url = source === 'herbe'
          ? `/api/activities/${activity.id}`
          : source === 'google'
            ? `/api/google/${activity.id}`
            : `/api/outlook/${activity.id}`
        const body = source === 'herbe'
          ? { StartTime: capturedDragState.currentFrom, EndTime: capturedDragState.currentTo }
          : {
              subject: activity.description,
              start: { dateTime: `${date}T${capturedDragState.currentFrom}:00`, timeZone: 'Europe/Riga' },
              end: { dateTime: `${date}T${capturedDragState.currentTo}:00`, timeZone: 'Europe/Riga' },
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
      }, { confirmLabel: action === 'move' ? 'Move' : 'Resize' })
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


  // All sources share equal width — overlapping events split the space evenly
  const lanedActivities = buildLanedActivities(timedActivities)

  return (
    <div ref={columnRef} className={`flex-1 border-r border-border relative last:border-r-0${isHoliday ? ' bg-red-500/5' : (() => { const d = new Date(date + 'T00:00:00').getDay(); return d === 0 || d === 6 ? ' bg-border/20' : '' })()}`} style={{ minWidth: `${colMinVw}vw` }}>
      {dragError && (
        <div className="absolute top-2 left-0 right-0 z-30 mx-2">
          <div className="bg-red-900/80 border border-red-500/50 rounded-lg px-3 py-2 text-xs text-red-300">
            {dragError}
          </div>
        </div>
      )}

      <div className="relative flex">
        {/* Herbe sub-column (or full column when no Outlook) — hosts the hour grid */}
        <div className="relative w-full">
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

          {/* Holiday banner */}
          {isHoliday && holidayName && (
            <div
              className="absolute left-0 right-0 z-15 pointer-events-none"
              style={{ top: 0, height: rowHeight / 2 }}
            >
              <div className="h-full mx-0.5 rounded bg-red-500/15 flex items-center justify-center px-1 overflow-hidden">
                <span className="text-[9px] font-bold text-red-400 truncate">{holidayName}</span>
              </div>
            </div>
          )}

          {/* All-day events rendered as overlay blocks at the top of the grid */}
          {allDayActivities.map((act, i) => {
            const holidayOffset = isHoliday && holidayName ? 1 : 0
            const actColor = getActivityColor(act)
            const bannerHeight = Math.min(rowHeight / 2, 20)
            return (
              <div
                key={act.id}
                className="absolute left-0 right-0 z-15 pointer-events-auto"
                style={{ top: (i + holidayOffset) * bannerHeight, height: bannerHeight }}
              >
                <AllDayBanner
                  activity={act}
                  color={actColor}
                  onClick={onActivityClick}
                  isMobileSelected={mobileSelectedId === mobileKey(act.id)}
                  onMobileTap={(id) => { const k = mobileKey(id); setMobileSelectedId(mobileSelectedId === k ? null : k) }}
                  onMobileClose={() => setMobileSelectedId(null)}
                  getTypeName={getTypeName}
                  visibility={visibility}
                  isLightMode={isLightMode}
                />
              </div>
            )
          })}

          {lanedActivities.map(({ activity: act, laneIndex, laneCount }) => {
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
                  mobileSelected={mobileSelectedId === mobileKey(act.id)}
                  onMobileTap={(id) => { const k = mobileKey(id); setMobileSelectedId(mobileSelectedId === k ? null : k) }}
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
      </div>

      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          destructive={confirmState.destructive}
          onConfirm={handleConfirm}
          onCancel={() => {
            setDrag(null)
            suppressClickRef.current = true
            setTimeout(() => { suppressClickRef.current = false }, 300)
            handleCancel()
          }}
        />
      )}
    </div>
  )
}
