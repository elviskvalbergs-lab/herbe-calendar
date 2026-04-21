'use client'
import { useState, useRef, useLayoutEffect } from 'react'
import { Activity, ShareVisibility } from '@/types'
import { timeToTopPx } from '@/lib/time'
import { readableAccentColor, textOnAccent } from '@/lib/activityColors'
import { useEvStyle } from '@/lib/useEvStyle'
import { EventPreviewCard } from './EventPreviewCard'

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

// Module-level flags shared across all ActivityBlock instances
let globalCloseCooldown = false
let globalTouchActive = false
let isTouchDevice = false
if (typeof window !== 'undefined') {
  window.addEventListener('touchstart', () => { isTouchDevice = true }, { once: true })
}

interface Props {
  activity: Activity
  color: string
  height: number
  onClick: (a: Activity) => void
  onDragStart?: (e: React.PointerEvent<HTMLDivElement>, a: Activity, type: 'move' | 'resize') => void
  canEdit: boolean
  isCC?: boolean
  isLightMode?: boolean
  scale?: number
  style?: React.CSSProperties
  getTypeName?: (typeCode: string) => string
  mobileSelected?: boolean
  onMobileTap?: (id: string) => void
  onMobileClose?: () => void
  visibility?: ShareVisibility
  startHour?: number
}

function ActivityBlockInner({ activity, color, height, onClick, onDragStart, canEdit, isCC = false, isLightMode = false, scale = 1, style, getTypeName, mobileSelected = false, onMobileTap, onMobileClose, visibility, startHour }: Props) {
  const top = timeToTopPx(activity.timeFrom, scale, startHour)
  const isCompact = height < 28
  const isOutlook = activity.source === 'outlook'
  const isPlanned = activity.planned === true
  const [hovered, setHovered] = useState(false)
  const touchIsTapRef = useRef(true)
  const wasTouchRef = useRef(false)
  const blockRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null)
  const evStyle = useEvStyle()

  useLayoutEffect(() => {
    if (!hovered && !mobileSelected) { setCardPos(null); return }
    const blockEl = blockRef.current
    if (!blockEl) return
    const rect = blockEl.getBoundingClientRect()
    // Card size — match the default (320 / min 280 on mobile) + a generous
    // height reserve that's larger than typical content so clamping works.
    const isNarrow = window.innerWidth < 480
    const cardW = isNarrow ? Math.min(280, window.innerWidth - 24) : 320
    const cardH = 320
    const MARGIN = 8
    // Respect the app's top chrome (topbar) — never let the card hide
    // beneath it. Falls back to MARGIN if no topbar element exists.
    const topbar = document.querySelector('.topbar') as HTMLElement | null
    const topMin = topbar ? topbar.getBoundingClientRect().bottom + 6 : MARGIN
    const bottomMax = window.innerHeight - cardH - MARGIN
    // Prefer placing to the right of the block; fall back to left if it
    // would overflow horizontally.
    let left = rect.right + 6
    if (left + cardW > window.innerWidth - MARGIN) {
      left = rect.left - cardW - 6
    }
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - cardW - MARGIN))
    // Vertically: align with the block top when possible. For events near
    // the top of the grid (under the topbar), clamp to topMin. For events
    // near the bottom, clamp to bottomMax so the card stays fully visible.
    let top = rect.top
    top = Math.max(topMin, Math.min(top, bottomMax))
    setCardPos({ left, top })
  }, [hovered, mobileSelected])

  const isLight = isLightMode
  const textColor = readableAccentColor(color, !isLight)
  const fillNormal = isLight ? '55' : (isOutlook ? '28' : '33')
  const fillPlanned = isLight ? '22' : '18'
  const fillCC = isLight ? '1a' : '0a'

  // Resolve visual based on chosen event style.
  // - solid: existing behaviour (coloured fill + left rail)
  // - tinted: softer fill + 3px coloured rail, text tends to event colour
  // - outlined: near-transparent bg, 1px coloured border + 3px rail
  const variantStyles = (() => {
    // Base states (planned / cc-only) take precedence over variant fill.
    if (evStyle === 'solid') {
      return {
        background: isCC
          ? `repeating-linear-gradient(45deg, ${color}${fillCC}, ${color}${fillCC} 4px, transparent 4px, transparent 8px)`
          : isPlanned
            ? `repeating-linear-gradient(135deg, ${color}${fillPlanned}, ${color}${fillPlanned} 3px, transparent 3px, transparent 6px)`
            : color + fillNormal,
        border: undefined,
        borderLeft: isOutlook
          ? `3px dashed ${color}cc`
          : isCC
            ? `3px dotted ${color}8c`
            : isPlanned
              ? `3px dashed ${color}99`
              : `3px solid ${color}`,
        color: textColor,
      }
    }
    if (evStyle === 'tinted') {
      // Lighter fill — low alpha over the surface, with a 3px rail.
      // Text uses the theme's foreground so it reads against both the
      // theme surface and the tint (using the event colour as text here
      // fights with the tint of the same colour in the background).
      const fill = isLight ? `${color}1f` : `${color}26`
      const plannedFill = `${color}14`
      return {
        background: isCC
          ? `repeating-linear-gradient(45deg, ${color}${fillCC}, ${color}${fillCC} 4px, transparent 4px, transparent 8px)`
          : isPlanned
            ? `repeating-linear-gradient(135deg, ${color}2a, ${color}2a 3px, transparent 3px, transparent 6px), ${plannedFill}`
            : fill,
        border: undefined,
        borderLeft: isCC
          ? `3px dotted ${color}`
          : isPlanned
            ? `3px dashed ${color}`
            : `3px solid ${color}`,
        color: 'var(--app-fg)',
      }
    }
    // outlined — transparent bg, theme foreground text (contrasts against
    // theme bg regardless of event colour).
    return {
      background: isPlanned
        ? `repeating-linear-gradient(135deg, ${color}1a, ${color}1a 3px, transparent 3px, transparent 6px)`
        : 'transparent',
      border: isCC
        ? `1px dotted ${color}aa`
        : isPlanned
          ? `1px dashed ${color}aa`
          : `1px solid ${color}aa`,
      borderLeft: isCC
        ? `3px dotted ${color}`
        : isPlanned
          ? `3px dashed ${color}`
          : `3px solid ${color}`,
      color: 'var(--app-fg)',
    }
  })()

  return (
    <div
      ref={blockRef}
      role="button"
      tabIndex={0}
      aria-label={activity.description || '(no title)'}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(activity) }
      }}
      className="absolute left-px right-px cursor-pointer select-none pointer-events-auto transition-shadow duration-150"
      style={{
        top,
        height,
        borderRadius: 2,
        ...variantStyles,
        // Never use CSS opacity — it makes child elements (preview card) translucent too
        zIndex: (hovered || mobileSelected) ? 40 : undefined,
        boxShadow: hovered ? `0 2px 14px ${color}55` : undefined,
        ...style,
      }}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse' && !globalCloseCooldown && !isTouchDevice) setHovered(true) }}
      onPointerLeave={() => setHovered(false)}
      onTouchStart={() => {
        globalTouchActive = true
        wasTouchRef.current = true
        touchIsTapRef.current = !globalCloseCooldown
        setHovered(false)
      }}
      onTouchMove={() => { touchIsTapRef.current = false }}
      onTouchEnd={(e) => {
        globalTouchActive = false
        if (!touchIsTapRef.current) return
        // Don't intercept touches inside the preview card
        if (cardRef.current?.contains(e.target as Node)) return
        e.preventDefault()
        onMobileTap?.(activity.id)
      }}
      onClick={() => {
        // Touch taps are handled in onTouchEnd — only real mouse clicks go here
        if (wasTouchRef.current || globalTouchActive) { wasTouchRef.current = false; return }
        if (visibility) return
        onClick(activity)
      }}
      onPointerDown={canEdit ? (e) => onDragStart?.(e, activity, 'move') : undefined}
    >
      {isCompact ? (
        <div className="px-1 flex items-center gap-0.5 h-full overflow-hidden" style={{ opacity: isCC ? 0.75 : 1 }}>
          <p className="text-[9px] font-bold truncate flex-1">
            {activity.icsCalendarName ? '📅 ' : isOutlook ? <OutlookIcon /> : null}{activity.isExternal && !activity.icsCalendarName && '🌐 '}{isPlanned && !isCC && '○ '}{activity.description || '(no title)'}
          </p>
          <span className="text-[8px] shrink-0 whitespace-nowrap" style={{ opacity: 0.72 }}>{activity.timeFrom}</span>
        </div>
      ) : (
        <div className="px-1 py-0.5 overflow-hidden" style={{ height, opacity: isCC ? 0.75 : 1 }}>
          <p className="text-[10px] font-bold truncate">
            {activity.icsCalendarName ? '📅 ' : isOutlook ? <OutlookIcon /> : null}{activity.isExternal && !activity.icsCalendarName && '🌐 '}{isPlanned && !isCC && '○ '}{activity.description || '(no title)'}
          </p>
          <p className="text-[9px] truncate" style={{ opacity: 0.72 }}>
            {activity.timeFrom}–{activity.timeTo}
            {activity.customerName ? ` · ${activity.customerName}` : ''}
          </p>
          {/* Persons pips */}
          {(activity.mainPersons?.length || activity.ccPersons?.length) && (
            <div className="flex gap-0.5 flex-wrap mt-0.5">
              {(() => {
                const mainPips = (activity.mainPersons ?? []).slice(0, 3)
                const ccPips = (activity.ccPersons ?? []).slice(0, Math.max(0, 3 - mainPips.length))
                const totalShown = mainPips.length + ccPips.length
                const totalAll = (activity.mainPersons?.length ?? 0) + (activity.ccPersons?.length ?? 0)
                // Main pip: solid coloured chip, text chosen via textOnAccent.
                // CC pip: outlined using currentColor so it inherits the
                // variant-appropriate text colour (event colour in solid,
                // theme-fg in tinted/outlined).
                return (
                  <>
                    {mainPips.map(code => (
                      <span key={code} className="text-[9px] rounded px-0.5 leading-4"
                        style={{ background: color, color: textOnAccent(color) }}>{code}</span>
                    ))}
                    {ccPips.map(code => (
                      <span key={code} className="text-[9px] rounded px-0.5 leading-[14px]"
                        style={{ border: `1px dashed currentColor`, color: 'currentColor', fontStyle: 'italic', opacity: 0.82 }}>{code}</span>
                    ))}
                    {totalAll > totalShown && (
                      <span className="text-[9px]" style={{ opacity: 0.7 }}>+{totalAll - totalShown}</span>
                    )}
                  </>
                )
              })()}
            </div>
          )}
        </div>
      )}
      {/* Resize handle */}
      {canEdit && (
        <div
          className={`absolute bottom-0 left-0 right-0 cursor-s-resize ${isCompact ? 'h-1' : 'h-2'}`}
          onPointerDown={(e) => { e.stopPropagation(); onDragStart?.(e, activity, 'resize') }}
        />
      )}
      {/* Preview card — hover on desktop, tap on mobile. */}
      {((!isTouchDevice && hovered) || mobileSelected) && (
        <EventPreviewCard
          ref={cardRef}
          activity={activity}
          color={color}
          position={cardPos}
          isSticky={mobileSelected}
          isCC={isCC}
          isLightMode={isLightMode}
          visibility={visibility}
          canEdit={canEdit}
          getTypeName={getTypeName}
          onClose={mobileSelected ? () => {
            globalCloseCooldown = true
            setTimeout(() => { globalCloseCooldown = false }, 300)
            onMobileClose?.()
          } : undefined}
          onEdit={() => { onMobileClose?.(); onClick(activity) }}
          onCardClick={(e) => { e.stopPropagation(); if (visibility) return; onMobileClose?.(); onClick(activity) }}
        />
      )}
    </div>
  )
}

import { memo } from 'react'
const ActivityBlock = memo(ActivityBlockInner, (prev, next) =>
  prev.activity.id === next.activity.id &&
  prev.color === next.color &&
  prev.height === next.height &&
  prev.canEdit === next.canEdit &&
  prev.isCC === next.isCC &&
  prev.mobileSelected === next.mobileSelected &&
  prev.scale === next.scale &&
  prev.startHour === next.startHour &&
  prev.activity.timeFrom === next.activity.timeFrom &&
  prev.activity.timeTo === next.activity.timeTo &&
  prev.activity.description === next.activity.description
)
export default ActivityBlock
