'use client'
import { useState, useRef, useLayoutEffect } from 'react'
import { Activity, ShareVisibility } from '@/types'
import { timeToTopPx } from '@/lib/time'
import { readableAccentColor, textOnAccent } from '@/lib/activityColors'
import { useEvStyle } from '@/lib/useEvStyle'

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

function TeamsIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="inline-block shrink-0 opacity-70" style={{ verticalAlign: 'middle' }}>
      <path d="M20.5 6.5h-3V5a2 2 0 1 0-4 0v1.5h-3A1.5 1.5 0 0 0 9 8v7a4 4 0 0 0 4 4h1a4 4 0 0 0 4-4V8a1.5 1.5 0 0 0-1.5-1.5zm-5-2a1 1 0 1 1 2 0v1.5h-2V4.5zM16 15a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V9h5v6z"/>
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
  const cardRef = useRef<HTMLDivElement>(null)
  const [alignRight, setAlignRight] = useState(false)
  const evStyle = useEvStyle()

  useLayoutEffect(() => {
    if (!cardRef.current) { setAlignRight(false); return }
    const parentRect = cardRef.current.parentElement?.getBoundingClientRect()
    if (!parentRect) return
    // If activity is in the right half of the screen, align card to the right
    setAlignRight(parentRect.left + parentRect.width / 2 > window.innerWidth / 2)
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
      // Lighter fill — 16% colour over the surface, with a 3px rail.
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
        color: textColor,
      }
    }
    // outlined
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
      color: textColor,
    }
  })()

  return (
    <div
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
          <p className="text-[9px] font-bold truncate flex-1" style={{ color: textColor }}>
            {activity.icsCalendarName ? '📅 ' : isOutlook ? <OutlookIcon /> : null}{activity.isExternal && !activity.icsCalendarName && '🌐 '}{isPlanned && !isCC && '○ '}{activity.description || '(no title)'}
          </p>
          <span className="text-[8px] text-text-muted shrink-0 whitespace-nowrap">{activity.timeFrom}</span>
        </div>
      ) : (
        <div className="px-1 py-0.5 overflow-hidden" style={{ height, opacity: isCC ? 0.75 : 1 }}>
          <p className="text-[10px] font-bold truncate" style={{ color: textColor }}>
            {activity.icsCalendarName ? '📅 ' : isOutlook ? <OutlookIcon /> : null}{activity.isExternal && !activity.icsCalendarName && '🌐 '}{isPlanned && !isCC && '○ '}{activity.description || '(no title)'}
          </p>
          <p className="text-[9px] text-text-muted truncate">
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
                return (
                  <>
                    {mainPips.map(code => (
                      <span key={code} className="text-[9px] rounded px-0.5 leading-4"
                        style={{ background: color + '33', color: '#fff' }}>{code}</span>
                    ))}
                    {ccPips.map(code => (
                      <span key={code} className="text-[9px] rounded px-0.5 leading-[14px]"
                        style={{ border: `1px dashed ${color}99`, color: color + 'cc', fontStyle: 'italic' }}>{code}</span>
                    ))}
                    {totalAll > totalShown && (
                      <span className="text-[9px]" style={{ color: color + '99' }}>+{totalAll - totalShown}</span>
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
      {/* Preview card — hover on desktop, tap on mobile. Uses the design's .ev-preview. */}
      {((!isTouchDevice && hovered) || mobileSelected) && (() => {
        const sourceShort = activity.source === 'herbe' ? 'ERP'
          : activity.source === 'outlook' ? 'OUT'
          : activity.source === 'google' ? 'GOO'
          : activity.icsCalendarName ? 'ICS'
          : 'EXT'
        const calendarLabel = activity.icsCalendarName
          ?? activity.googleCalendarName
          ?? (activity.source === 'google' ? 'Google Calendar' : null)
          ?? (isOutlook ? 'Outlook Calendar' : null)
          ?? (activity.source === 'herbe' ? (activity.erpConnectionName ? `ERP · ${activity.erpConnectionName}` : 'ERP') : null)
        const typeText = activity.activityTypeCode
          ? `${activity.activityTypeCode}${(getTypeName?.(activity.activityTypeCode) || activity.activityTypeName) ? ` · ${getTypeName?.(activity.activityTypeCode) || activity.activityTypeName}` : ''}`
          : null
        const rsvpMap: Record<string, string> = { accepted: 'accepted', tentative: 'tentative', declined: 'declined', pending: 'pending' }
        const variantClass = isPlanned ? 'planned' : isCC ? 'cc-only' : ''
        const isBusy = visibility === 'busy'
        const isTitlesOnly = visibility === 'titles'
        return (
          <div
            ref={cardRef}
            className={`ev-preview ${variantClass} ${alignRight ? 'right-0' : 'left-0'}`}
            style={{
              position: 'absolute',
              top: 0,
              width: 320,
              maxWidth: 'calc(100vw - 24px)',
              ['--ev-bg' as string]: color,
            }}
            onClick={(e) => { e.stopPropagation(); if (visibility) return; onMobileClose?.(); onClick(activity) }}
          >
            <div className="evp-accent" />
            {mobileSelected && (
              <button
                className="absolute w-8 h-8 flex items-center justify-center rounded-full text-base font-bold active:brightness-110"
                style={{ top: 6, right: 6, background: 'rgba(0,0,0,0.25)', color: 'var(--app-fg)' }}
                onTouchEnd={(e) => { e.stopPropagation() }}
                onClick={(e) => {
                  e.stopPropagation()
                  globalCloseCooldown = true
                  setTimeout(() => { globalCloseCooldown = false }, 300)
                  onMobileClose?.()
                }}
                aria-label="Close"
              >✕</button>
            )}
            <div className="evp-head">
              {!isBusy && (
                <div className="evp-chips">
                  <span className="evp-chip brand">{sourceShort}</span>
                  {isPlanned && <span className="evp-chip planned">Planned</span>}
                  {isCC && <span className="evp-chip cc-only">CC only</span>}
                  {activity.isExternal && <span className="evp-chip">External</span>}
                  {activity.attendees && activity.attendees.length > 0 && (
                    <span className="evp-chip">{activity.attendees.length} attendee{activity.attendees.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
              )}
              <div className="evp-title">
                {isBusy ? 'Busy' : (activity.description || '(no title)')}
              </div>
              <div className="evp-when">
                {activity.timeFrom} – {activity.timeTo}
              </div>
            </div>
            {!isBusy && (
              <div className="evp-body">
                {!isTitlesOnly && typeText && (
                  <div className="evp-row">
                    <span className="k">Type</span>
                    <span className="v">{typeText}</span>
                  </div>
                )}
                {!isTitlesOnly && activity.customerName && (
                  <div className="evp-row">
                    <span className="k">Customer</span>
                    <span className="v">{activity.customerName}</span>
                  </div>
                )}
                {!isTitlesOnly && activity.projectName && (
                  <div className="evp-row">
                    <span className="k">Project</span>
                    <span className="v">{activity.projectName}</span>
                  </div>
                )}
                {!isTitlesOnly && activity.location && (
                  <div className="evp-row">
                    <span className="k">Location</span>
                    <span className="v">{activity.location}</span>
                  </div>
                )}
                {calendarLabel && (
                  <div className="evp-row">
                    <span className="k">Calendar</span>
                    <span className="v">{calendarLabel}</span>
                  </div>
                )}
                {!isTitlesOnly && activity.attendees && activity.attendees.length > 0 && (
                  <div className="evp-attendees">
                    {activity.attendees.slice(0, 5).map((att, i) => {
                      const initials = (att.name ?? att.email).split(/[\s@.]/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
                      const rsvp = att.responseStatus && rsvpMap[att.responseStatus as string]
                      return (
                        <div key={`${att.email}-${i}`} className="evp-att">
                          <span className="evp-avatar" style={{ background: color }}>{initials || '?'}</span>
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name ?? att.email}</span>
                          {rsvp && <span className={`evp-rsvp ${rsvp}`}>{rsvp}</span>}
                        </div>
                      )
                    })}
                    {activity.attendees.length > 5 && (
                      <div style={{ fontSize: 10.5, color: 'var(--app-fg-subtle)', paddingLeft: 24 }}>
                        +{activity.attendees.length - 5} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {!isBusy && (activity.joinUrl || !visibility) && (
              <div className="evp-foot">
                {activity.joinUrl && (
                  <a
                    href={activity.joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="btn btn-sm"
                    style={{
                      background: activity.videoProvider === 'meet' ? '#1a73e8' : activity.videoProvider === 'teams' ? '#464EB8' : activity.videoProvider === 'zoom' ? '#2D8CFF' : '#2563eb',
                      color: '#fff',
                      fontWeight: 600,
                    }}
                  >
                    {activity.videoProvider === 'meet' ? 'Join Meet'
                      : activity.videoProvider === 'teams' ? <><TeamsIcon size={11} /> Join Teams</>
                      : activity.videoProvider === 'zoom' ? 'Join Zoom'
                      : 'Join meeting'}
                  </a>
                )}
                <div className="spacer" />
                {!visibility && (
                  <button
                    className="btn btn-sm"
                    style={{ background: color, color: textOnAccent(color), fontWeight: 600 }}
                    onClick={(e) => { e.stopPropagation(); onMobileClose?.(); onClick(activity) }}
                  >
                    {canEdit ? 'Edit' : 'View details'}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })()}
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
