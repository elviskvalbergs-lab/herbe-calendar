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
  isCC?: boolean
  style?: React.CSSProperties
  getTypeName?: (typeCode: string) => string
}

export default function ActivityBlock({ activity, color, onClick, onDragStart, canEdit, isCC = false, style, getTypeName }: Props) {
  const top = timeToTopPx(activity.timeFrom)
  const height = Math.max(durationToPx(activity.timeFrom, activity.timeTo), 20)
  const isOutlook = activity.source === 'outlook'
  const isPlanned = activity.planned === true
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={`absolute left-1 right-1 rounded-lg cursor-pointer select-none pointer-events-auto transition-all duration-300 group ${hovered ? 'scale-[1.02] z-40' : 'z-auto'} glass shadow-sm`}
      style={{
        top,
        height,
        background: isCC
          ? `repeating-linear-gradient(135deg, ${color}1a, ${color}1a 4px, transparent 4px, transparent 8px)`
          : isPlanned ? `linear-gradient(180deg, ${color}1a 0%, ${color}0d 100%)` : `linear-gradient(180deg, ${color}4d 0%, ${color}26 100%)`,
        borderLeft: isOutlook
          ? `2px dashed ${color}`
          : isCC
            ? `2px solid ${color}8c`
            : `4px solid ${color}`,
        borderRight: (isPlanned && !isCC) ? `2px solid ${color}4d` : undefined,
        opacity: isCC ? 0.9 : 1,
        boxShadow: hovered ? `0 12px 24px -4px ${color}55, 0 0 0 1px ${color}33` : undefined,
        ...style,
      }}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHovered(true) }}
      onPointerLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(false)}
      onClick={() => onClick(activity)}
      onPointerDown={canEdit ? (e) => onDragStart?.(e, activity, 'move') : undefined}
    >
      <div className="px-1.5 py-0.5 overflow-hidden" style={{ height, opacity: isCC ? 0.75 : 1 }}>
        <div className="flex items-start justify-between gap-1">
          <p className="text-[10px] font-bold truncate flex-1 leading-tight tracking-tight" style={{ color: isCC ? color : '#fff', textShadow: isCC ? 'none' : '0 1px 2px rgba(0,0,0,0.3)' }}>
            {activity.isExternal && '🌐 '}{isOutlook && '📅 '}{isPlanned && !isCC && '○ '}{activity.description || '(no title)'}
          </p>
          {activity.joinUrl && (
            <a
              href={activity.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
              className="shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-400 transition-colors"
              style={{ lineHeight: 1.2 }}
            >
              TEAMS
            </a>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5 opacity-80">
          <p className="text-[9px] font-medium text-white/70 truncate">
            {activity.timeFrom}–{activity.timeTo}
            {activity.customerName ? ` · ${activity.customerName}` : ''}
          </p>
        </div>
        {/* Persons pips */}
        {(activity.mainPersons?.length || activity.ccPersons?.length) && (
          <div className="flex gap-1 flex-wrap mt-1">
            {(() => {
              const mainPips = (activity.mainPersons ?? []).slice(0, 3)
              const ccPips = (activity.ccPersons ?? []).slice(0, Math.max(0, 3 - mainPips.length))
              const totalShown = mainPips.length + ccPips.length
              const totalAll = (activity.mainPersons?.length ?? 0) + (activity.ccPersons?.length ?? 0)
              return (
                <>
                  {mainPips.map(code => (
                    <span key={code} className="text-[8px] font-bold rounded-md px-1 py-0 bg-white/10 text-white/90 border border-white/5"
                    >{code}</span>
                  ))}
                  {ccPips.map(code => (
                    <span key={code} className="text-[8px] font-bold rounded-md px-1 py-0 bg-transparent text-white/60 border border-white/10 border-dashed"
                    >{code}</span>
                  ))}
                  {totalAll > totalShown && (
                    <span className="text-[8px] text-white/40 font-bold">+{totalAll - totalShown}</span>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>
      {/* Resize handle */}
      {canEdit && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize opacity-0 group-hover:opacity-100 transition-opacity"
          onPointerDown={(e) => { e.stopPropagation(); onDragStart?.(e, activity, 'resize') }}
        >
          <div className="mx-auto w-6 h-1 bg-white/20 rounded-full mt-0.5" />
        </div>
      )}
      {/* Hover detail card */}
      {hovered && (
        <div
          className="absolute left-0 z-50 mt-2 glass shadow-premium rounded-2xl p-4 min-w-[200px] max-w-[280px] pointer-events-none animate-fade-in"
          style={{ top: '100%', borderColor: color + '44' }}
        >
          <div className="space-y-3">
            <div>
              <p className="text-xs font-black leading-tight tracking-tight mb-1" style={{ color }}>
                {activity.isExternal && '🌐 '}{isOutlook && '📅 '}{activity.description || '(no title)'}
              </p>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold text-text">
                  {activity.timeFrom} – {activity.timeTo}
                </p>
                {isPlanned && <span className="text-amber-400 text-[9px] font-black uppercase tracking-widest bg-amber-400/10 px-1 rounded">Planned</span>}
                {activity.isExternal && <span className="text-primary text-[9px] font-black uppercase tracking-widest bg-primary/10 px-1 rounded">External</span>}
              </div>
            </div>

            {activity.activityTypeCode && (
              <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                <p className="text-[10px] uppercase font-black tracking-widest text-white/40 mb-1">Activity Type</p>
                <p className="text-[10px] text-text">
                  <span className="font-mono bg-primary/20 text-primary px-1 rounded mr-2">{activity.activityTypeCode}</span>
                  {(getTypeName?.(activity.activityTypeCode) || activity.activityTypeName) && (
                    <span className="font-bold">
                      {getTypeName?.(activity.activityTypeCode) || activity.activityTypeName}
                    </span>
                  )}
                </p>
              </div>
            )}

            {(activity.projectName || activity.customerName) && (
              <div className="space-y-1">
                {activity.customerName && (
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-3 bg-primary/40 rounded-full" />
                    <p className="text-[10px] font-bold text-text-muted truncate">{activity.customerName}</p>
                  </div>
                )}
                {activity.projectName && (
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-3 bg-white/20 rounded-full" />
                    <p className="text-[10px] text-text-muted truncate">{activity.projectName}</p>
                  </div>
                )}
              </div>
            )}

            {activity.joinUrl && (
              <div className="pt-1">
                <a
                  href={activity.joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white bg-indigo-600 shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M21 5H3v14h18V5zm-2 12H5V7h14v10zm-5-5v-2h-4v2h4zm0 3v-2h-4v2h4z"/></svg>
                  Connect to Teams
                </a>
              </div>
            )}
            
            <p className="text-[10px] text-text-muted pt-2 border-t border-white/5 mt-2 opacity-50 flex justify-between items-center">
              <span>{canEdit ? 'Click to edit' : 'Read-only view'}</span>
              {!canEdit && <span className="text-[8px] border border-white/20 px-1 rounded">Locked</span>}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
