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

const SWIPE_THRESHOLD = 80          // px to fully reveal indicator
const PULL_THRESHOLD = 80           // px to trigger refresh
const PULL_SLOW_VELOCITY = 0.3      // px/ms — finger must be slow for pull
const SWIPE_SLOW_VELOCITY = 0.15    // px/ms — finger must be slow for swipe
const LOCK_DISTANCE = 12            // px before locking axis
const HOLD_TIME_MS = 150            // ms finger must be near-still before pull activates

export default function CalendarGrid({
  state, activities, loading, sessionUserCode = '', getActivityColor, getTypeName,
  scale = 1, onRefresh, onNavigate, onSlotClick, onActivityClick, onActivityUpdate, onNewForDate
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevScaleRef = useRef(scale)

  // Use refs for gesture state to avoid stale closures
  const swipeIntentRef = useRef<SwipeIntent>(null)
  const pullStateRef = useRef<PullState>({ pulling: false, progress: 0, triggered: false })
  const [, forceRender] = useState(0)
  const rerenderGesture = useCallback(() => forceRender(n => n + 1), [])

  const touchRef = useRef({
    startX: 0, startY: 0, startTime: 0,
    lastX: 0, lastY: 0, lastTime: 0,
    atTop: false, atLeft: false, atRight: false,
    locked: null as 'horizontal' | 'vertical' | null,
    yVelocities: [] as number[],
    xVelocities: [] as number[],
    intentActive: false,
    pullHoldStart: 0,   // timestamp when finger first slowed at top
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

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = scrollRef.current
    const t = e.touches[0]
    touchRef.current = {
      startX: t.clientX, startY: t.clientY, startTime: Date.now(),
      lastX: t.clientX, lastY: t.clientY, lastTime: Date.now(),
      atTop: (el?.scrollTop ?? 1) <= 1,
      atLeft: (el?.scrollLeft ?? 1) <= 1,
      atRight: el ? el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 : false,
      locked: null, yVelocities: [], xVelocities: [], intentActive: false,
      pullHoldStart: 0,
    }
    swipeIntentRef.current = null
    pullStateRef.current = { pulling: false, progress: 0, triggered: false }
    rerenderGesture()
  }, [rerenderGesture])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    const ref = touchRef.current
    const now = Date.now()
    const dx = t.clientX - ref.startX
    const dy = t.clientY - ref.startY
    const adx = Math.abs(dx)
    const ady = Math.abs(dy)

    // Compute instant velocities
    const dt = now - ref.lastTime
    if (dt > 0) {
      const vx = Math.abs(t.clientX - ref.lastX) / dt
      const vy = Math.abs(t.clientY - ref.lastY) / dt
      ref.xVelocities.push(vx)
      ref.yVelocities.push(vy)
      if (ref.xVelocities.length > 5) ref.xVelocities.shift()
      if (ref.yVelocities.length > 5) ref.yVelocities.shift()
    }
    ref.lastX = t.clientX
    ref.lastY = t.clientY
    ref.lastTime = now

    // Lock axis after small movement
    if (!ref.locked && (adx > LOCK_DISTANCE || ady > LOCK_DISTANCE)) {
      ref.locked = adx > ady ? 'horizontal' : 'vertical'
    }

    // --- Pull-to-refresh (vertical, at scroll top, deliberate) ---
    if (ref.locked === 'vertical' && ref.atTop && dy > 0) {
      const avgVy = ref.yVelocities.length > 0
        ? ref.yVelocities.reduce((a, b) => a + b, 0) / ref.yVelocities.length
        : 1

      // Only start pull if finger is moving slowly (deliberate drag, not fast scroll)
      if (avgVy > PULL_SLOW_VELOCITY && !pullStateRef.current.pulling) {
        // Too fast — don't activate pull
        return
      }

      // Track how long finger has been slow at top
      if (avgVy <= PULL_SLOW_VELOCITY) {
        if (ref.pullHoldStart === 0) ref.pullHoldStart = now
      } else {
        ref.pullHoldStart = 0
      }

      // Only activate after finger has been slow for HOLD_TIME_MS
      if (ref.pullHoldStart > 0 && (now - ref.pullHoldStart >= HOLD_TIME_MS || pullStateRef.current.pulling)) {
        const progress = Math.min(dy / PULL_THRESHOLD, 1)
        pullStateRef.current = { pulling: true, progress, triggered: progress >= 1 }
        rerenderGesture()
      }
      return
    }

    // --- Horizontal swipe navigation ---
    if (ref.locked === 'horizontal') {
      const swipingLeft = dx < 0
      const swipingRight = dx > 0
      const atEdge = (swipingLeft && ref.atRight) || (swipingRight && ref.atLeft)

      if (!atEdge) {
        if (ref.intentActive) {
          ref.intentActive = false
          swipeIntentRef.current = null
          rerenderGesture()
        }
        return
      }

      // At edge — check if finger has slowed down
      const avgVx = ref.xVelocities.length > 0
        ? ref.xVelocities.reduce((a, b) => a + b, 0) / ref.xVelocities.length
        : 1

      if (avgVx < SWIPE_SLOW_VELOCITY || ref.intentActive) {
        ref.intentActive = true
        const progress = Math.min(Math.max(adx / SWIPE_THRESHOLD, 0), 1)
        const dir = swipingLeft ? 'next' as const : 'prev' as const
        swipeIntentRef.current = { dir, progress }
        rerenderGesture()
      }
    }
  }, [rerenderGesture])

  const handleTouchEnd = useCallback(() => {
    const ref = touchRef.current

    // Pull-to-refresh
    if (pullStateRef.current.triggered) {
      pullStateRef.current = { pulling: false, progress: 0, triggered: false }
      rerenderGesture()
      onRefresh()
      return
    }
    pullStateRef.current = { pulling: false, progress: 0, triggered: false }

    // Swipe navigation
    const intent = swipeIntentRef.current
    if (intent && intent.progress > 0.6) {
      onNavigate(intent.dir)
    }
    swipeIntentRef.current = null
    ref.intentActive = false
    rerenderGesture()
  }, [onRefresh, onNavigate, rerenderGesture])

  const swipeIntent = swipeIntentRef.current
  const pullUI = pullStateRef.current

  // Calculate column widths: on mobile portrait, show 1 full date group + peek
  const personCount = state.selectedPersons.length
  const totalColumns = dates.length * personCount
  // Each person column: aim for ~1 full day group + 15% peek of next visible on mobile
  // On desktop (sm:), let flex handle it
  const colMinVw = state.view === '5day'
    ? Math.max(Math.floor(85 / (personCount * Math.min(dates.length, 2))), 15)
    : state.view === '3day'
      ? Math.max(Math.floor(85 / (personCount * Math.min(dates.length, 1.15))), 20)
      : Math.max(Math.floor(85 / personCount), 30)

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {pullUI.pulling && (
        <div
          className="sticky top-0 left-0 right-0 z-40 flex items-center justify-center pointer-events-none"
          style={{ height: pullUI.progress * PULL_THRESHOLD, opacity: pullUI.progress }}
        >
          <div className={`text-xs font-bold px-3 py-1 rounded-full ${pullUI.triggered ? 'bg-primary text-white' : 'bg-surface border border-border text-text-muted'}`}>
            <span
              className="inline-block transition-transform"
              style={{ transform: `rotate(${pullUI.progress * 360}deg)` }}
            >↻</span>
            {pullUI.triggered ? ' Release to refresh' : ' Pull to refresh'}
          </div>
        </div>
      )}

      {/* Swipe navigation indicators */}
      {swipeIntent && (
        <div
          className={`fixed ${swipeIntent.dir === 'next' ? 'right-0' : 'left-0'} top-0 bottom-0 z-40 flex items-center pointer-events-none`}
          style={{ opacity: swipeIntent.progress, width: Math.max(swipeIntent.progress * 60, 0) }}
        >
          <div
            className={`w-full h-24 flex items-center justify-center ${swipeIntent.dir === 'next' ? 'rounded-l-xl' : 'rounded-r-xl'} bg-primary/90 text-white text-xs font-bold shadow-lg`}
          >
            <span className="flex flex-col items-center gap-0.5">
              <span className="text-base">{swipeIntent.dir === 'next' ? '›' : '‹'}</span>
              <span className="text-[9px]">{swipeIntent.dir === 'next' ? `+${viewDays}d` : `−${viewDays}d`}</span>
            </span>
          </div>
        </div>
      )}

      {/* Loading overlay — fixed so it covers entire viewport regardless of scroll */}
      {loading && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center pointer-events-auto">
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
          // Date group min-width: all person columns must fit
          const dateGroupMinW = personCount * colMinVw
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
