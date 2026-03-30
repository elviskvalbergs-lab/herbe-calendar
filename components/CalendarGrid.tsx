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

const SWIPE_THRESHOLD = 80
const PULL_THRESHOLD = 90
const SWIPE_SLOW_VELOCITY = 0.15    // px/ms
const LOCK_DISTANCE = 12
// Pull-to-refresh: finger must be nearly stopped for 300ms before indicator appears
const PULL_NEAR_ZERO_VELOCITY = 0.08 // px/ms — finger nearly stopped
const PULL_HOLD_MS = 300             // ms of near-zero velocity required

export default function CalendarGrid({
  state, activities, loading, sessionUserCode = '', getActivityColor, getTypeName,
  scale = 1, onRefresh, onNavigate, onSlotClick, onActivityClick, onActivityUpdate, onNewForDate
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevScaleRef = useRef(scale)

  // Gesture state via refs to avoid stale closures
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
    pullHoldStart: 0,
    pullActivated: false,
    pullActivateY: 0,     // Y position when pull was activated
    swipeActivateX: 0,    // X position when swipe intent started
  })

  // Responsive max visible columns
  const [maxVisibleCols, setMaxVisibleCols] = useState(4)
  useEffect(() => {
    function update() {
      const w = window.innerWidth
      const h = window.innerHeight
      if (w >= 640) {
        // Desktop / tablet landscape
        setMaxVisibleCols(15)
      } else if (w > h) {
        // Mobile landscape
        setMaxVisibleCols(10)
      } else {
        // Mobile portrait
        setMaxVisibleCols(4)
      }
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

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

  // --- Gesture handlers ---
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
      pullHoldStart: 0, pullActivated: false, pullActivateY: 0, swipeActivateX: 0,
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

    // --- Pull-to-refresh: very deliberate ---
    // Only at scroll top, finger must nearly stop for 300ms, then drag down slowly
    if (ref.locked === 'vertical' && ref.atTop && dy > 0) {
      const avgVy = ref.yVelocities.length > 0
        ? ref.yVelocities.reduce((a, b) => a + b, 0) / ref.yVelocities.length
        : 1

      // If pull not yet activated, require near-zero velocity hold
      if (!ref.pullActivated) {
        if (avgVy <= PULL_NEAR_ZERO_VELOCITY) {
          if (ref.pullHoldStart === 0) ref.pullHoldStart = now
          if (now - ref.pullHoldStart >= PULL_HOLD_MS) {
            ref.pullActivated = true
            ref.pullActivateY = t.clientY // measure progress from here
          }
        } else {
          ref.pullHoldStart = 0 // reset if finger speeds up
        }
        return // don't show indicator yet
      }

      // Pull is activated — measure from activation point, not touch start
      const pullDy = t.clientY - ref.pullActivateY
      const progress = Math.min(Math.max(pullDy / PULL_THRESHOLD, 0), 1)
      pullStateRef.current = { pulling: true, progress, triggered: progress >= 1 }
      rerenderGesture()
      return
    }

    // --- Horizontal swipe navigation ---
    if (ref.locked === 'horizontal') {
      const swipingLeft = dx < 0
      const swipingRight = dx > 0
      // Re-check edges live (scroll position may have changed during this touch)
      const el = scrollRef.current
      const nowAtLeft = el ? el.scrollLeft <= 1 : false
      const nowAtRight = el ? el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 : false
      const atEdge = (swipingLeft && nowAtRight) || (swipingRight && nowAtLeft)

      if (!atEdge) {
        if (ref.intentActive) {
          ref.intentActive = false
          swipeIntentRef.current = null
          rerenderGesture()
        }
        return
      }

      const avgVx = ref.xVelocities.length > 0
        ? ref.xVelocities.reduce((a, b) => a + b, 0) / ref.xVelocities.length
        : 1

      if (avgVx < SWIPE_SLOW_VELOCITY || ref.intentActive) {
        if (!ref.intentActive) {
          ref.intentActive = true
          ref.swipeActivateX = t.clientX // measure progress from here
        }
        const swipeDx = Math.abs(t.clientX - ref.swipeActivateX)
        const progress = Math.min(Math.max(swipeDx / SWIPE_THRESHOLD, 0), 1)
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
    ref.pullActivated = false
    rerenderGesture()
  }, [onRefresh, onNavigate, rerenderGesture])

  // Read gesture state for rendering
  const swipeIntent = swipeIntentRef.current
  const pullUI = pullStateRef.current

  // --- Column sizing ---
  // Total "columns" = persons × days
  const personCount = state.selectedPersons.length
  const totalColumns = personCount * dates.length

  // Calculate per-column vw: fit maxVisibleCols on screen, rest scrollable
  // ~90vw available (100vw minus time column ~48px ≈ 10vw on mobile)
  const availableVw = 90
  let colMinVw: number
  if (totalColumns <= maxVisibleCols) {
    // Everything fits — divide equally
    colMinVw = availableVw / totalColumns
  } else {
    // Show maxVisibleCols + 30% peek of next column
    colMinVw = availableVw / (maxVisibleCols + 0.3)
  }
  // Clamp to reasonable range
  colMinVw = Math.max(colMinVw, 12)
  colMinVw = Math.min(colMinVw, 80)

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

      {/* Loading overlay — fixed to cover entire viewport */}
      {loading && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center pointer-events-auto">
          <div className="bg-surface border border-border rounded-xl px-5 py-3 text-sm font-bold text-text-muted animate-pulse">
            Loading…
          </div>
        </div>
      )}

      <div className="flex">
        <TimeColumn is3Day={state.view === '3day' || state.view === '5day'} scale={scale} />

        {dates.map((date, dateIdx) => {
          const isMultiDay = state.view === '3day' || state.view === '5day'
          const dateGroupMinW = personCount * colMinVw
          return (
            <div
              key={date}
              className={`flex-1 shrink-0 sm:shrink flex flex-col${dateIdx > 0 ? ' border-l-2 border-border' : ''}`}
              style={{ minWidth: `${dateGroupMinW}vw` }}
            >
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
