'use client'
import { useRef, useEffect, useState, useCallback } from 'react'
import { Activity, CalendarState } from '@/types'
import TimeColumn from './TimeColumn'
import PersonColumn from './PersonColumn'
import CurrentTimeIndicator from './CurrentTimeIndicator'
import { addDays, format, parseISO, isToday } from 'date-fns'
import { minutesToPx, GRID_START_HOUR, PX_PER_HOUR } from '@/lib/time'
import { personColor } from '@/lib/colors'

interface Props {
  state: CalendarState
  activities: Activity[]
  loading: boolean
  sessionUserCode?: string
  getActivityColor: (activity: Activity) => string
  getTypeName?: (typeCode: string) => string
  scale?: number
  onRefresh: () => void
  onNavigate: (dir: 'prev' | 'next') => void
  onSlotClick: (personCode: string, time: string, date: string) => void
  onActivityClick: (activity: Activity) => void
  onActivityUpdate: () => void
  onNewForDate?: (date: string) => void
}

type SwipeIntent = { dir: 'prev' | 'next'; progress: number } | null
type PullState = { pulling: boolean; progress: number; triggered: boolean }

export default function CalendarGrid({
  state, activities, loading, sessionUserCode = '', getActivityColor, getTypeName,
  scale = 1, onRefresh, onNavigate, onSlotClick, onActivityClick, onActivityUpdate, onNewForDate
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevScaleRef = useRef(scale)

  // Swipe navigation state
  const [swipeIntent, setSwipeIntent] = useState<SwipeIntent>(null)
  const [pullState, setPullState] = useState<PullState>({ pulling: false, progress: 0, triggered: false })

  const touchRef = useRef({
    startX: 0, startY: 0, startTime: 0,
    lastX: 0, lastY: 0, lastTime: 0,
    atTop: false, atLeft: false, atRight: false,
    locked: null as 'horizontal' | 'vertical' | null,
    velocities: [] as number[],  // recent horizontal velocities
    intentActive: false,
  })

  // Auto-scroll to 08:00 on mount
  useEffect(() => {
    if (!scrollRef.current) return
    const TARGET_HOUR = 8
    scrollRef.current.scrollTop = minutesToPx((TARGET_HOUR - GRID_START_HOUR) * 60, scale)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Preserve scroll position proportionally when zoom changes
  useEffect(() => {
    if (!scrollRef.current) return
    const prev = prevScaleRef.current
    if (prev !== scale) {
      const ratio = scale / prev
      scrollRef.current.scrollTop = scrollRef.current.scrollTop * ratio
      prevScaleRef.current = scale
    }
  }, [scale])

  // Build date list for current view
  const viewDays = state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
  const dates = viewDays === 1
    ? [state.date]
    : Array.from({ length: viewDays }, (_, i) =>
        format(addDays(parseISO(state.date), i), 'yyyy-MM-dd')
      )

  // --- Gesture handling ---
  const SWIPE_THRESHOLD = 80          // px to fully reveal indicator
  const PULL_THRESHOLD = 70           // px to trigger refresh
  const VELOCITY_SLOW = 0.15          // px/ms — finger considered "paused"
  const LOCK_DISTANCE = 12            // px before locking axis

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = scrollRef.current
    const t = e.touches[0]
    touchRef.current = {
      startX: t.clientX, startY: t.clientY, startTime: Date.now(),
      lastX: t.clientX, lastY: t.clientY, lastTime: Date.now(),
      atTop: (el?.scrollTop ?? 1) <= 1,
      atLeft: (el?.scrollLeft ?? 1) <= 1,
      atRight: el ? el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 : false,
      locked: null, velocities: [], intentActive: false,
    }
    setSwipeIntent(null)
    setPullState({ pulling: false, progress: 0, triggered: false })
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    const ref = touchRef.current
    const now = Date.now()
    const dx = t.clientX - ref.startX
    const dy = t.clientY - ref.startY
    const adx = Math.abs(dx)
    const ady = Math.abs(dy)

    // Compute instant velocity
    const dt = now - ref.lastTime
    if (dt > 0) {
      const vx = Math.abs(t.clientX - ref.lastX) / dt
      ref.velocities.push(vx)
      if (ref.velocities.length > 5) ref.velocities.shift()
    }
    ref.lastX = t.clientX
    ref.lastY = t.clientY
    ref.lastTime = now

    // Lock axis after small movement
    if (!ref.locked && (adx > LOCK_DISTANCE || ady > LOCK_DISTANCE)) {
      ref.locked = adx > ady ? 'horizontal' : 'vertical'
    }

    // --- Pull-to-refresh (vertical, at scroll top) ---
    if (ref.locked === 'vertical' && ref.atTop && dy > 0) {
      const progress = Math.min(dy / PULL_THRESHOLD, 1)
      setPullState({ pulling: true, progress, triggered: progress >= 1 })
      return
    }

    // --- Horizontal swipe navigation ---
    if (ref.locked === 'horizontal') {
      // Only activate intent when at a scroll edge in the swipe direction
      const swipingLeft = dx < 0  // swiping left = next
      const swipingRight = dx > 0  // swiping right = prev
      const atEdge = (swipingLeft && ref.atRight) || (swipingRight && ref.atLeft)

      if (!atEdge) {
        // Not at edge — let normal scroll happen, clear any intent
        if (ref.intentActive) {
          ref.intentActive = false
          setSwipeIntent(null)
        }
        return
      }

      // At edge — check if finger has slowed down (deliberate gesture)
      const avgVelocity = ref.velocities.length > 0
        ? ref.velocities.reduce((a, b) => a + b, 0) / ref.velocities.length
        : 1

      if (avgVelocity < VELOCITY_SLOW || ref.intentActive) {
        ref.intentActive = true
        const edgeDx = swipingLeft
          ? Math.abs(dx) - (scrollRef.current ? scrollRef.current.scrollWidth - scrollRef.current.clientWidth - ref.startX + scrollRef.current.scrollLeft : 0)
          : Math.abs(dx)
        const progress = Math.min(Math.max(adx / SWIPE_THRESHOLD, 0), 1)
        const dir = swipingLeft ? 'next' : 'prev'
        setSwipeIntent({ dir, progress })
      }
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    const ref = touchRef.current

    // Pull-to-refresh
    if (pullState.triggered) {
      setPullState({ pulling: false, progress: 0, triggered: false })
      onRefresh()
      return
    }
    setPullState({ pulling: false, progress: 0, triggered: false })

    // Swipe navigation — only fire if intent was active and progress > 0.6
    if (swipeIntent && swipeIntent.progress > 0.6) {
      onNavigate(swipeIntent.dir)
    }
    setSwipeIntent(null)
    ref.intentActive = false
  }, [swipeIntent, pullState.triggered, onRefresh, onNavigate])

  const viewStep = viewDays

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {pullState.pulling && (
        <div
          className="absolute left-0 right-0 z-40 flex items-center justify-center pointer-events-none transition-opacity"
          style={{ top: 0, height: pullState.progress * PULL_THRESHOLD, opacity: pullState.progress }}
        >
          <div className={`text-xs font-bold px-3 py-1 rounded-full ${pullState.triggered ? 'bg-primary text-white' : 'bg-surface border border-border text-text-muted'}`}>
            <span
              className="inline-block transition-transform"
              style={{ transform: `rotate(${pullState.progress * 360}deg)` }}
            >↻</span>
            {pullState.triggered ? ' Release to refresh' : ' Pull to refresh'}
          </div>
        </div>
      )}

      {/* Swipe navigation indicators */}
      {swipeIntent && (
        <>
          <div
            className={`fixed ${swipeIntent.dir === 'next' ? 'right-0' : 'left-0'} top-0 bottom-0 z-40 flex items-center pointer-events-none transition-opacity`}
            style={{ opacity: swipeIntent.progress, width: Math.max(swipeIntent.progress * 60, 0) }}
          >
            <div
              className={`w-full h-24 flex items-center justify-center rounded-${swipeIntent.dir === 'next' ? 'l' : 'r'}-xl bg-primary/90 text-white text-xs font-bold shadow-lg`}
            >
              <span className="flex flex-col items-center gap-0.5">
                <span className="text-base">{swipeIntent.dir === 'next' ? '›' : '‹'}</span>
                <span className="text-[9px]">{swipeIntent.dir === 'next' ? `+${viewStep}d` : `−${viewStep}d`}</span>
              </span>
            </div>
          </div>
        </>
      )}
      {loading && (
        <div className="absolute inset-0 z-30 bg-black/40 flex items-center justify-center pointer-events-auto">
          <div className="bg-surface border border-border rounded-xl px-5 py-3 text-sm font-bold text-text-muted animate-pulse">
            Loading…
          </div>
        </div>
      )}

      <div className="flex">
        <TimeColumn is3Day={state.view === '3day' || state.view === '5day'} scale={scale} />

        {/* For each date, a grouped column with shared header */}
        {dates.map((date, dateIdx) => {
          const isMultiDay = state.view === '3day' || state.view === '5day'
          // Per-person min column width (vw) — narrower in multi-day views
          const colMinVw = state.view === '5day' ? 22 : state.view === '3day' ? 30 : 44
          // Date group min-width: all person columns must fit
          const dateGroupMinW = state.selectedPersons.length * colMinVw
          return (
            <div
              key={date}
              className={`flex-1 shrink-0 sm:shrink flex flex-col${dateIdx > 0 ? ' border-l-2 border-border' : ''}`}
              style={{ minWidth: `${dateGroupMinW}vw` }}
            >
              {/* Sticky two-row header for this day */}
              <div className="sticky top-0 z-20 bg-surface">
                {isMultiDay && (
                  <div className="h-6 flex items-center justify-center border-b border-border/40 text-[11px] font-semibold text-text-muted tracking-wide relative">
                    {format(parseISO(date), 'EEE dd/MM')}
                    <button
                      onClick={() => onNewForDate?.(date)}
                      className="absolute right-1 text-primary font-bold text-sm leading-none hover:opacity-70"
                      title={`New activity on ${format(parseISO(date), 'dd/MM')}`}
                    >+</button>
                  </div>
                )}
                <div className="flex border-b border-border h-10">
                  {state.selectedPersons.map((person, personIdx) => (
                    <div
                      key={person.code}
                      className="flex-1 flex items-center justify-center text-xs font-bold border-r border-border last:border-r-0"
                      style={{ color: personColor(personIdx), minWidth: `${colMinVw}vw` }}
                      title={`${person.name}${person.email ? ` <${person.email}>` : ''}`}
                    >
                      {person.code}
                    </div>
                  ))}
                </div>
              </div>

              {/* Person columns (body only, no header) */}
              <div className="flex flex-1 relative">
                {isToday(parseISO(date)) && <CurrentTimeIndicator scale={scale} />}
                {state.selectedPersons.map((person, personIdx) => {
                  const personActivities = activities.filter(
                    a => a.personCode === person.code && a.date === date
                  )
                  return (
                    <PersonColumn
                      key={person.code}
                      personCode={person.code}
                      date={date}
                      activities={personActivities}
                      sessionUserCode={sessionUserCode}
                      getActivityColor={getActivityColor}
                      getTypeName={getTypeName}
                      scale={scale}
                      onSlotClick={onSlotClick}
                      onActivityClick={onActivityClick}
                      onActivityUpdate={onActivityUpdate}
                      colMinVw={colMinVw}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
