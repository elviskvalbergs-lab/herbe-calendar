'use client'
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

  return (
    <div
      className="absolute left-1 right-1 rounded overflow-hidden cursor-pointer select-none"
      style={{
        top,
        height,
        background: color + '33',
        borderLeft: isOutlook ? `2px dashed ${color}` : `3px solid ${color}`,
        opacity: isOutlook ? 0.85 : 1,
        ...style,
      }}
      onClick={() => onClick(activity)}
      onPointerDown={canEdit ? (e) => onDragStart?.(e, activity, 'move') : undefined}
    >
      <div className="px-1.5 py-0.5">
        <p className="text-[10px] font-bold truncate" style={{ color }}>
          {isOutlook && '📅 '}{activity.description || '(no title)'}
        </p>
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
    </div>
  )
}
