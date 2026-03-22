'use client'
import { Activity } from '@/types'
import { timeToTopPx } from '@/lib/time'

interface Props {
  activity: Activity
  color: string
  height: number
  onClick: (a: Activity) => void
  onDragStart?: (e: React.PointerEvent<HTMLDivElement>, a: Activity, type: 'move' | 'resize') => void
  canEdit: boolean
  style?: React.CSSProperties
}

export default function ActivityBlock({ activity, color, height, onClick, onDragStart, canEdit, style }: Props) {
  const top = timeToTopPx(activity.timeFrom)
  const isCompact = height < 28
  const isOutlook = activity.source === 'outlook'

  return (
    <div
      className="absolute left-1 right-1 rounded overflow-hidden cursor-pointer select-none pointer-events-auto"
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
      {isCompact ? (
        <div className="px-1.5 flex items-center gap-1 h-full overflow-hidden">
          <p className="text-[9px] font-bold truncate flex-1" style={{ color }}>
            {isOutlook && '📅 '}{activity.description || '(no title)'}
          </p>
          <span className="text-[8px] text-text-muted shrink-0 whitespace-nowrap">{activity.timeFrom}</span>
        </div>
      ) : (
        <div className="px-1.5 py-0.5">
          <div className="flex items-start justify-between gap-1">
            <p className="text-[10px] font-bold truncate flex-1" style={{ color }}>
              {isOutlook && '📅 '}{activity.description || '(no title)'}
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
      )}
      {/* Resize handle */}
      {canEdit && (
        <div
          className={`absolute bottom-0 left-0 right-0 cursor-s-resize ${isCompact ? 'h-1' : 'h-2'}`}
          onPointerDown={(e) => { e.stopPropagation(); onDragStart?.(e, activity, 'resize') }}
        />
      )}
    </div>
  )
}
