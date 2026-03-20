'use client'
import { Activity } from '@/types'
import { GRID_START_HOUR, GRID_END_HOUR, minutesToTime, timeToMinutes, snapToQuarter, pxToMinutes, timeToTopPx } from '@/lib/time'
import ActivityBlock from './ActivityBlock'
import { useRef, useState } from 'react'

interface Props {
  personCode: string
  date: string
  activities: Activity[]
  sessionUserCode: string
  getActivityColor: (activity: Activity) => string
  onSlotClick: (personCode: string, time: string) => void
  onActivityClick: (activity: Activity) => void
  onActivityUpdate: () => void
  colMinW?: string
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

export default function PersonColumn({
  personCode, date, activities, sessionUserCode, getActivityColor,
  onSlotClick, onActivityClick, onActivityUpdate, colMinW = 'min-w-[44vw] sm:min-w-0'
}: Props) {
  const columnRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dragError, setDragError] = useState<string | null>(null)
  const suppressClickRef = useRef(false)

  const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i)

  function canEdit(activity: Activity): boolean {
    if (activity.source === 'outlook') return !!activity.isOrganizer
    const inMainPersons = activity.mainPersons?.includes(sessionUserCode) ?? false
    const inAccessGroup = activity.accessGroup?.split(',').map(s => s.trim()).includes(sessionUserCode) ?? false
    return activity.personCode === sessionUserCode || inMainPersons || inAccessGroup
  }

  function handleSlotClick(hour: number, e: React.MouseEvent) {
    if (drag) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const offsetY = e.clientY - rect.top
    const fraction = offsetY / rect.height
    const minute = snapToQuarter(hour * 60 + Math.round(fraction * 60))
    onSlotClick(personCode, minutesToTime(minute))
  }

  function handleDragStart(e: React.PointerEvent<HTMLDivElement>, activity: Activity, type: 'move' | 'resize') {
    e.preventDefault()
    const dragState: DragState = {
      activity, type, startY: e.clientY,
      originalFrom: activity.timeFrom, originalTo: activity.timeTo,
      currentFrom: activity.timeFrom, currentTo: activity.timeTo,
    }
    setDrag(dragState)

    function onMove(me: PointerEvent) {
      const deltaY = me.clientY - dragState.startY
      const rawDeltaMins = Math.round(pxToMinutes(deltaY) / 15) * 15
      if (type === 'move') {
        const fromMins = timeToMinutes(dragState.originalFrom) + rawDeltaMins
        const toMins = timeToMinutes(dragState.originalTo) + rawDeltaMins
        dragState.currentFrom = minutesToTime(Math.max(GRID_START_HOUR * 60, fromMins))
        dragState.currentTo = minutesToTime(Math.min(GRID_END_HOUR * 60, toMins))
      } else {
        const toMins = timeToMinutes(dragState.originalTo) + rawDeltaMins
        dragState.currentTo = minutesToTime(
          Math.max(timeToMinutes(dragState.originalFrom) + 15, Math.min(GRID_END_HOUR * 60, toMins))
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

      // Real drag: suppress the click event that browsers fire after pointerup
      suppressClickRef.current = true
      setTimeout(() => { suppressClickRef.current = false }, 300)

      // Keep activity at dragged position while saving (don't snap back)
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
        setTimeout(() => setDragError(null), 4000)  // auto-dismiss after 4s
      }
      setDrag(null)
      onActivityUpdate()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Group overlapping activities into sub-columns
  const sorted = [...activities].sort((a, b) => a.timeFrom.localeCompare(b.timeFrom))
  const groups: Activity[][] = []
  for (const act of sorted) {
    // Find a sub-column where all activities end at or before act.timeFrom
    const col = groups.find(g => {
      const maxEndMins = Math.max(...g.map(a => timeToMinutes(a.timeTo)))
      return maxEndMins <= timeToMinutes(act.timeFrom)
    })
    if (col) col.push(act)
    else groups.push([act])
  }

  return (
    <div ref={columnRef} className={`flex-1 ${colMinW} border-r border-border relative last:border-r-0`}>
      {dragError && (
        <div className="absolute top-2 left-0 right-0 z-30 mx-2">
          <div className="bg-red-900/80 border border-red-500/50 rounded-lg px-3 py-2 text-xs text-red-300">
            {dragError}
          </div>
        </div>
      )}

      {/* Hour rows */}
      <div className="relative">
        {hours.map(h => (
          <div
            key={h}
            className="h-14 border-b border-border/30 hover:bg-white/5 cursor-pointer relative"
            onClick={(e) => handleSlotClick(h, e)}
          >
            <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-border/20" />
          </div>
        ))}

        {/* Activity blocks */}
        {groups.map((col, colIdx) =>
          col.map(act => {
            const isDragging = drag?.activity.id === act.id
            const isSaving = isDragging && drag!.saving
            const displayActivity = isDragging
              ? { ...act, timeFrom: drag!.currentFrom, timeTo: drag!.currentTo }
              : act
            const actColor = getActivityColor(act)
            return (
              <div
                key={act.id}
                className="absolute pointer-events-none"
                style={{
                  left: `${(colIdx / groups.length) * 100}%`,
                  right: `${((groups.length - colIdx - 1) / groups.length) * 100}%`,
                  top: 0,
                  bottom: 0,
                }}
              >
                <ActivityBlock
                  activity={displayActivity}
                  color={actColor}
                  onClick={(act) => { if (!suppressClickRef.current) onActivityClick(act) }}
                  onDragStart={handleDragStart}
                  canEdit={canEdit(act)}
                  style={isDragging
                    ? { opacity: isSaving ? 0.5 : 0.7, outline: `2px dashed ${actColor}` }
                    : undefined}
                />
                {isDragging && (
                  <div
                    className="absolute left-1 text-[9px] font-bold pointer-events-none z-20"
                    style={{ top: timeToTopPx(drag!.currentFrom) - 14, color: actColor }}
                  >
                    {isSaving ? '⏳' : ''}{drag!.currentFrom}–{drag!.currentTo}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
