'use client'
import { useState } from 'react'
import { Activity } from '@/types'
import { timeToTopPx } from '@/lib/time'

function MsOfficeIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="inline-block shrink-0" style={{ verticalAlign: 'middle' }}>
      <path d="M22 4.5L14 2v20l8-2.5V4.5z" fill="#D94F00"/>
      <path d="M14 2L2 4.5v15L14 22V2z" fill="#E7620A"/>
      <path d="M14 6.5V2L2 4.5v15L14 22v-4.5" fill="none" stroke="#fff" strokeWidth="0.3"/>
      <path d="M10.5 8.5L8 17h-2l2.5-8.5h2z" fill="#fff"/>
    </svg>
  )
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
}

export default function ActivityBlock({ activity, color, height, onClick, onDragStart, canEdit, isCC = false, isLightMode = false, scale = 1, style, getTypeName }: Props) {
  const top = timeToTopPx(activity.timeFrom, scale)
  const isCompact = height < 28
  const isOutlook = activity.source === 'outlook'
  const isPlanned = activity.planned === true
  const [hovered, setHovered] = useState(false)

  const isLight = isLightMode
  const fillNormal = isLight ? '55' : '33'
  const fillPlanned = isLight ? '33' : '1a'
  const fillCC = isLight ? '1a' : '0a'

  return (
    <div
      className="absolute left-1 right-1 rounded cursor-pointer select-none pointer-events-auto transition-shadow duration-150"
      style={{
        top,
        height,
        background: isCC
          ? `repeating-linear-gradient(135deg, ${color}${fillCC}, ${color}${fillCC} 4px, transparent 4px, transparent 8px)`
          : isPlanned ? color + fillPlanned : color + fillNormal,
        borderLeft: isOutlook
          ? `2px dashed ${color}`
          : isCC
            ? `2px solid ${color}8c`
            : `3px solid ${color}`,
        borderRight: isPlanned && !isCC ? `3px solid ${color}` : undefined,
        opacity: (isOutlook || isCC) ? (isCC ? 1 : 0.85) : 1,
        zIndex: hovered ? 40 : undefined,
        boxShadow: hovered ? `0 2px 14px ${color}55` : undefined,
        ...style,
      }}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHovered(true) }}
      onPointerLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(false)}
      onClick={() => onClick(activity)}
      onPointerDown={canEdit ? (e) => onDragStart?.(e, activity, 'move') : undefined}
    >
      {isCompact ? (
        <div className="px-1.5 flex items-center gap-1 h-full overflow-hidden" style={{ opacity: isCC ? 0.75 : 1 }}>
          <p className="text-[9px] font-bold truncate flex-1" style={{ color }}>
            {activity.icsCalendarName ? '📅 ' : isOutlook ? <MsOfficeIcon /> : null}{activity.isExternal && !activity.icsCalendarName && '🌐 '}{isPlanned && !isCC && '○ '}{activity.description || '(no title)'}
          </p>
          <span className="text-[8px] text-text-muted shrink-0 whitespace-nowrap">{activity.timeFrom}</span>
        </div>
      ) : (
        <div className="px-1.5 py-0.5 overflow-hidden" style={{ height, opacity: isCC ? 0.75 : 1 }}>
          <div className="flex items-start justify-between gap-1">
            <p className="text-[10px] font-bold truncate flex-1" style={{ color }}>
              {activity.icsCalendarName ? '📅 ' : isOutlook ? <MsOfficeIcon /> : null}{activity.isExternal && !activity.icsCalendarName && '🌐 '}{isPlanned && !isCC && '○ '}{activity.description || '(no title)'}
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
      {/* Hover detail card */}
      {hovered && (
        <div
          className="absolute left-0 z-50 mt-1 bg-surface border rounded-xl shadow-2xl p-3 min-w-[180px] max-w-[240px] pointer-events-none"
          style={{ top: '100%', borderColor: color + '88' }}
        >
          <p className="text-xs font-bold leading-snug mb-1.5" style={{ color }}>
            {activity.icsCalendarName ? '📅 ' : isOutlook ? <><MsOfficeIcon /> </> : null}{activity.description || '(no title)'}
          </p>
          <p className="text-xs text-text-muted">
            {activity.timeFrom} – {activity.timeTo}
            {isPlanned && <span className="ml-1 text-amber-400 text-[10px]">(planned)</span>}
          </p>
          {activity.activityTypeCode && (
            <p className="text-[10px] mt-1" style={{ color: color + 'cc' }}>
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
          {/* Source calendar */}
          {activity.icsCalendarName && (
            <p className="text-[10px] mt-1 text-text-muted truncate">📅 {activity.icsCalendarName}</p>
          )}
          {isOutlook && !activity.icsCalendarName && (
            <p className="text-[10px] mt-1 text-text-muted truncate"><MsOfficeIcon /> Outlook Calendar</p>
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
              className="inline-flex items-center gap-1.5 mt-2 px-2 py-1 rounded text-[10px] font-bold text-white"
              style={{ background: activity.icsCalendarName ? '#2563eb' : '#464EB8' }}
            >
              {activity.icsCalendarName
                ? <>🔗 Join meeting</>
                : <><MsOfficeIcon size={12} /> Join in Teams</>
              }
            </a>
          )}
          <p className="text-[10px] text-text-muted mt-2 opacity-60">Click to {canEdit ? 'edit' : 'view'}</p>
        </div>
      )}
    </div>
  )
}
