'use client'
import { useState, useRef, useLayoutEffect } from 'react'
import { Activity } from '@/types'
import { timeToTopPx } from '@/lib/time'

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
}

export default function ActivityBlock({ activity, color, height, onClick, onDragStart, canEdit, isCC = false, isLightMode = false, scale = 1, style, getTypeName, mobileSelected = false, onMobileTap, onMobileClose }: Props) {
  const top = timeToTopPx(activity.timeFrom, scale)
  const isCompact = height < 28
  const isOutlook = activity.source === 'outlook'
  const isPlanned = activity.planned === true
  const [hovered, setHovered] = useState(false)
  const touchIsTapRef = useRef(true)
  const wasTouchRef = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const [alignRight, setAlignRight] = useState(false)

  useLayoutEffect(() => {
    if (!cardRef.current) { setAlignRight(false); return }
    const parentRect = cardRef.current.parentElement?.getBoundingClientRect()
    if (!parentRect) return
    // If activity is in the right half of the screen, align card to the right
    setAlignRight(parentRect.left + parentRect.width / 2 > window.innerWidth / 2)
  }, [hovered, mobileSelected])

  const isLight = isLightMode
  const fillNormal = isLight ? '55' : (isOutlook ? '28' : '33')
  const fillPlanned = isLight ? '22' : '18'
  const fillCC = isLight ? '1a' : '0a'

  return (
    <div
      className="absolute left-1 right-1 rounded cursor-pointer select-none pointer-events-auto transition-shadow duration-150"
      style={{
        top,
        height,
        background: isCC
          ? `repeating-linear-gradient(45deg, ${color}${fillCC}, ${color}${fillCC} 4px, transparent 4px, transparent 8px)`
          : isPlanned
            ? `repeating-linear-gradient(135deg, ${color}${fillPlanned}, ${color}${fillPlanned} 3px, transparent 3px, transparent 6px)`
            : color + fillNormal,
        borderLeft: isOutlook
          ? `2px dashed ${color}cc`
          : isCC
            ? `2px solid ${color}8c`
            : isPlanned
              ? `3px solid ${color}99`
              : `3px solid ${color}`,
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
        onClick(activity)
      }}
      onPointerDown={canEdit ? (e) => onDragStart?.(e, activity, 'move') : undefined}
    >
      {isCompact ? (
        <div className="px-1.5 flex items-center gap-1 h-full overflow-hidden" style={{ opacity: isCC ? 0.75 : 1 }}>
          <p className="text-[9px] font-bold truncate flex-1" style={{ color }}>
            {activity.icsCalendarName ? '📅 ' : isOutlook ? <OutlookIcon /> : null}{activity.isExternal && !activity.icsCalendarName && '🌐 '}{isPlanned && !isCC && '○ '}{activity.description || '(no title)'}
          </p>
          <span className="text-[8px] text-text-muted shrink-0 whitespace-nowrap">{activity.timeFrom}</span>
        </div>
      ) : (
        <div className="px-1.5 py-0.5 overflow-hidden" style={{ height, opacity: isCC ? 0.75 : 1 }}>
          <div className="flex items-start justify-between gap-1">
            <p className="text-[10px] font-bold truncate flex-1" style={{ color }}>
              {activity.icsCalendarName ? '📅 ' : isOutlook ? <OutlookIcon /> : null}{activity.isExternal && !activity.icsCalendarName && '🌐 '}{isPlanned && !isCC && '○ '}{activity.description || '(no title)'}
            </p>
            <span className="text-[8px] text-text-muted shrink-0 whitespace-nowrap">{activity.timeFrom}</span>
          </div>
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
      {/* Detail card — hover on desktop only, tap on mobile */}
      {((!isTouchDevice && hovered) || mobileSelected) && (
        <div
          ref={cardRef}
          className={`absolute z-50 rounded-xl shadow-2xl p-3 min-w-[180px] max-w-[240px] pointer-events-auto ${alignRight ? 'right-0' : 'left-0'}`}
          style={{ top: 0, border: `1px solid ${color}88`, background: 'var(--color-surface)', color: 'var(--color-text)', isolation: 'isolate' }}
          onClick={(e) => { e.stopPropagation(); onMobileClose?.(); onClick(activity) }}
        >
          {mobileSelected && (
            <button
              className="absolute top-1 right-1 w-8 h-8 flex items-center justify-center rounded-full text-text-muted active:bg-border text-base font-bold"
              onTouchEnd={(e) => { e.stopPropagation() }}
              onClick={(e) => {
                e.stopPropagation()
                globalCloseCooldown = true
                setTimeout(() => { globalCloseCooldown = false }, 300)
                onMobileClose?.()
              }}
            >
              ✕
            </button>
          )}
          <p className="text-xs font-bold leading-snug mb-1.5 pr-8" style={{ color }}>
            {activity.icsCalendarName ? '📅 ' : isOutlook ? <><OutlookIcon /> </> : null}{activity.description || '(no title)'}
          </p>
          <p className="text-xs text-text-muted">
            {activity.timeFrom} – {activity.timeTo}
            {isPlanned && <span className="ml-1 text-amber-500 text-[10px]">(planned)</span>}
          </p>
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
            <p className="text-[10px] mt-1 text-text-muted truncate"><OutlookIcon /> Outlook Calendar</p>
          )}
          {!isOutlook && activity.source === 'herbe' && (
            <p className="text-[10px] mt-1 text-text-muted truncate">Herbe ERP</p>
          )}
          {isCC && (
            <p className="text-[10px] mt-1" style={{ color: color + '99', fontStyle: 'italic' }}>CC only</p>
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
              {activity.icsCalendarName
                ? <>🔗 Join meeting</>
                : <><TeamsIcon size={12} /> Join in Teams</>
              }
            </a>
          )}
          <button
            className="mt-2 w-full px-2 py-1.5 rounded text-[11px] font-bold text-white"
            style={{ background: color }}
            onClick={(e) => { e.stopPropagation(); onMobileClose?.(); onClick(activity) }}
          >
            {canEdit ? 'Edit' : 'View details'}
          </button>
        </div>
      )}
    </div>
  )
}
