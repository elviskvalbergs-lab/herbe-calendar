'use client'
import React, { forwardRef, useId } from 'react'
import { format, parseISO } from 'date-fns'
import type { Activity, ShareVisibility } from '@/types'
import { textOnAccent, readableAccentColor } from '@/lib/activityColors'

function TeamsIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="inline-block shrink-0 opacity-70" style={{ verticalAlign: 'middle' }}>
      <path d="M20.5 6.5h-3V5a2 2 0 1 0-4 0v1.5h-3A1.5 1.5 0 0 0 9 8v7a4 4 0 0 0 4 4h1a4 4 0 0 0 4-4V8a1.5 1.5 0 0 0-1.5-1.5zm-5-2a1 1 0 1 1 2 0v1.5h-2V4.5zM16 15a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V9h5v6z"/>
    </svg>
  )
}

export interface EventPreviewCardProps {
  activity: Activity
  color: string
  position: { left: number; top: number } | null
  /** pinned (clicked) vs hover tooltip — drives close-X visibility and ARIA role */
  isSticky?: boolean
  width?: number
  positionMode?: 'fixed' | 'absolute'
  /** show the date alongside the time range (useful when the card can surface any day) */
  showDate?: boolean
  isCC?: boolean
  isLightMode?: boolean
  visibility?: ShareVisibility
  canEdit?: boolean
  getTypeName?: (code: string) => string
  /** if provided and isSticky, renders the ✕ close button */
  onClose?: () => void
  /** if provided, renders the primary action button (Edit / View details) */
  onEdit?: () => void
  onCardClick?: React.MouseEventHandler<HTMLDivElement>
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>
  style?: React.CSSProperties
}

export const EventPreviewCard = forwardRef<HTMLDivElement, EventPreviewCardProps>(
  function EventPreviewCard(props, ref) {
    const {
      activity, color, position, isSticky = false, width = 320, positionMode = 'fixed',
      showDate = false, isCC = false, isLightMode = false, visibility, canEdit = true, getTypeName,
      onClose, onEdit, onCardClick, onMouseEnter, onMouseLeave, style,
    } = props

    const titleId = useId()
    const isPlanned = activity.planned === true
    const isBusy = visibility === 'busy'
    const isTitlesOnly = visibility === 'titles'
    const variantClass = isPlanned ? 'planned' : isCC ? 'cc-only' : ''

    const sourceShort = activity.source === 'herbe' ? 'ERP'
      : activity.source === 'outlook' ? 'OUT'
      : activity.source === 'google' ? 'GOO'
      : activity.icsCalendarName ? 'ICS'
      : 'EXT'

    const calendarLabel = activity.icsCalendarName
      ?? activity.googleCalendarName
      ?? (activity.source === 'google' ? 'Google Calendar' : null)
      ?? (activity.source === 'outlook' ? 'Outlook Calendar' : null)
      ?? (activity.source === 'herbe' ? (activity.erpConnectionName ? `ERP · ${activity.erpConnectionName}` : 'ERP') : null)

    const typeText = activity.activityTypeCode
      ? `${activity.activityTypeCode}${(getTypeName?.(activity.activityTypeCode) || activity.activityTypeName) ? ` · ${getTypeName?.(activity.activityTypeCode) || activity.activityTypeName}` : ''}`
      : null

    const rsvpMap: Record<string, string> = {
      accepted: 'accepted', tentative: 'tentative', declined: 'declined', pending: 'pending',
    }
    const textColor = readableAccentColor(color, !isLightMode)

    const whenText = activity.isAllDay
      ? 'All day'
      : `${activity.timeFrom} – ${activity.timeTo}`

    return (
      <div
        ref={ref}
        className={`ev-preview ${variantClass}`.trim()}
        role={isSticky ? 'dialog' : 'tooltip'}
        aria-labelledby={titleId}
        style={{
          position: positionMode,
          left: position?.left ?? 0,
          top: position?.top ?? 0,
          width,
          maxWidth: 'calc(100vw - 24px)',
          visibility: position ? 'visible' : 'hidden',
          ['--ev-bg' as string]: color,
          pointerEvents: 'auto',
          zIndex: 95,
          ...style,
        }}
        onClick={onCardClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className="evp-accent" />
        {isSticky && onClose && (
          <button
            className="absolute w-8 h-8 flex items-center justify-center rounded-full text-base font-bold active:brightness-110"
            style={{ top: 6, right: 6, background: 'rgba(0,0,0,0.25)', color: 'var(--app-fg)' }}
            onTouchEnd={(e) => { e.stopPropagation() }}
            onClick={(e) => { e.stopPropagation(); onClose() }}
            aria-label="Close"
          >✕</button>
        )}
        <div className="evp-head">
          {!isBusy && (
            <div className="evp-chips">
              <span className="evp-chip brand" style={{ color: textOnAccent(color) }}>{sourceShort}</span>
              {isPlanned && <span className="evp-chip planned" style={{ color: textOnAccent(color) }}>Planned</span>}
              {isCC && <span className="evp-chip cc-only" style={{ color: textColor, borderColor: textColor }}>CC only</span>}
              {activity.isExternal && <span className="evp-chip">External</span>}
              {activity.attendees && activity.attendees.length > 0 && (
                <span className="evp-chip">{activity.attendees.length} attendee{activity.attendees.length !== 1 ? 's' : ''}</span>
              )}
            </div>
          )}
          <div id={titleId} className="evp-title">
            {isBusy ? 'Busy' : (activity.description || '(no title)')}
          </div>
          <div className="evp-when">
            {whenText}
            {showDate && activity.date && <> · {format(parseISO(activity.date), 'EEE d MMM')}</>}
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
                      <span className="evp-avatar" style={{ background: color, color: textOnAccent(color) }}>{initials || '?'}</span>
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
        {!isBusy && (activity.joinUrl || onEdit) && (
          <div className="evp-foot">
            {activity.joinUrl && (
              <a
                href={activity.joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="btn btn-sm"
                style={{
                  background: activity.videoProvider === 'meet' ? '#1a73e8'
                    : activity.videoProvider === 'teams' ? '#464EB8'
                    : activity.videoProvider === 'zoom' ? '#2D8CFF'
                    : '#2563eb',
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
            {onEdit && !visibility && (
              <button
                className="btn btn-sm"
                style={{ background: color, color: textOnAccent(color), fontWeight: 600 }}
                onClick={(e) => { e.stopPropagation(); onEdit() }}
              >
                {canEdit ? 'Edit' : 'View details'}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }
)
