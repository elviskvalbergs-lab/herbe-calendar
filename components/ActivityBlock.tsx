'use client'
import { useState } from 'react'
import { Activity } from '@/types'
import { timeToTopPx, durationToPx } from '@/lib/time'

interface Props {
  activity: Activity
  color: string
  onClick: (a: Activity) => void
  onDragStart?: (e: React.PointerEvent<HTMLDivElement>, a: Activity, type: 'move' | 'resize') => void
  canEdit: boolean
  style?: React.CSSProperties
}

export default function ActivityBlock({ activity, color, onClick, onDragStart, canEdit, style }: Props) {
  const top = timeToTopPx(activity.timeFrom)
  const height = Math.max(durationToPx(activity.timeFrom, activity.timeTo), 20)
  const isOutlook = activity.source === 'outlook'
  const isPlanned = activity.planned === true
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="absolute left-1 right-1 rounded cursor-pointer select-none pointer-events-auto transition-shadow duration-150"
      style={{
        top,
        height,
        background: isPlanned ? color + '1a' : color + '33',
        borderLeft: isOutlook ? `2px dashed ${color}` : `3px solid ${color}`,
        borderRight: isPlanned ? `3px solid ${color}` : undefined,
        opacity: isOutlook ? 0.85 : 1,
        zIndex: hovered ? 40 : undefined,
        boxShadow: hovered ? `0 2px 14px ${color}55` : undefined,
        ...style,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClick(activity)}
      onPointerDown={canEdit ? (e) => onDragStart?.(e, activity, 'move') : undefined}
    >
      <div className="px-1.5 py-0.5 overflow-hidden" style={{ height }}>
        <div className="flex items-start justify-between gap-1">
          <p className="text-[10px] font-bold truncate flex-1" style={{ color }}>
            {isOutlook && '📅 '}{isPlanned && '○ '}{activity.description || '(no title)'}
          </p>
          {activity.joinUrl && (
            <a
              href={activity.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
              className="shrink-0 text-[8px] font-bold px-1 py-0.5 rounded"
              style={{ background: '#464EB8', color: '#fff', lineHeight: 1.2 }}
            >
              Join
            </a>
          )}
        </div>
        <p className="text-[9px] text-text-muted truncate">
          {activity.timeFrom}–{activity.timeTo}
          {activity.customerName ? ` · ${activity.customerName}` : ''}
        </p>
      </div>
      {/* Resize handle */}
      {canEdit && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize"
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
            {isOutlook && '📅 '}{isPlanned && '○ '}{activity.description || '(no title)'}
          </p>
          <p className="text-xs text-text-muted">{activity.timeFrom} – {activity.timeTo}</p>
          {activity.activityTypeCode && (
            <p className="text-[10px] font-mono mt-1" style={{ color: color + 'cc' }}>{activity.activityTypeCode}</p>
          )}
          {activity.projectName && (
            <p className="text-xs text-text-muted mt-1 truncate">{activity.projectName}</p>
          )}
          {activity.customerName && (
            <p className="text-xs text-text-muted truncate">{activity.customerName}</p>
          )}
          <p className="text-[10px] text-text-muted mt-2 opacity-60">Click to {canEdit ? 'edit' : 'view'}</p>
        </div>
      )}
    </div>
  )
}
