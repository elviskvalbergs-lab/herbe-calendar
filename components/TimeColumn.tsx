import { GRID_START_HOUR, GRID_END_HOUR, PX_PER_HOUR } from '@/lib/time'

interface Props {
  is3Day?: boolean
  scale?: number
  startHour?: number
  endHour?: number
  canExpandUp?: boolean
  canExpandDown?: boolean
  canContractUp?: boolean
  canContractDown?: boolean
  onExpandUp?: () => void
  onExpandDown?: () => void
  onContractUp?: () => void
  onContractDown?: () => void
  /** Height in px of the all-day band area, so the gutter stays vertically aligned with per-column strips. */
  bandHeight?: number
  bandCollapsed?: boolean
  bandTotalAllDay?: number
  bandTotalTasks?: number
  onToggleBand?: () => void
}

export default function TimeColumn({
  is3Day = false, scale = 1, startHour, endHour,
  canExpandUp, canExpandDown, canContractUp, canContractDown,
  onExpandUp, onExpandDown, onContractUp, onContractDown,
  bandHeight = 0, bandCollapsed = false, bandTotalAllDay = 0, bandTotalTasks = 0, onToggleBand,
}: Props) {
  const start = startHour ?? GRID_START_HOUR
  const end = endHour ?? GRID_END_HOUR
  const hours = Array.from({ length: end - start }, (_, i) => start + i)
  const rowHeight = PX_PER_HOUR * scale
  const showTop = canExpandUp || canContractUp
  const showBottom = canExpandDown || canContractDown
  const showBand = bandHeight > 0 && (bandTotalAllDay > 0 || bandTotalTasks > 0 || onToggleBand)

  return (
    <div
      className="time-col shrink-0 sticky left-0 z-10"
      style={{ width: 'var(--time-col-w, 56px)' }}
    >
      {/* Header spacer — mirrors day-col-header height */}
      <div className={is3Day ? 'h-12' : 'h-6'} style={{ borderBottom: '1px solid var(--app-line)', background: 'var(--app-bg-alt)' }} />

      {/* All-day band gutter — mirrors band area height across columns */}
      {showBand && (
        <button
          type="button"
          onClick={onToggleBand}
          title={bandCollapsed ? 'Expand all-day band' : 'Collapse all-day band'}
          style={{
            height: bandHeight,
            width: '100%',
            display: 'flex',
            alignItems: bandCollapsed ? 'center' : 'flex-start',
            justifyContent: 'flex-start',
            paddingTop: bandCollapsed ? 0 : 6,
            paddingLeft: 6,
            gap: 4,
            background: 'var(--app-bg-alt)',
            color: 'var(--app-fg-subtle)',
            border: 'none',
            borderBottom: '1px solid var(--app-line)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}
        >
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: bandCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 120ms', flexShrink: 0 }}
          >
            <path d="m6 9 6 6 6-6"/>
          </svg>
          {bandCollapsed && (
            <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
              {bandTotalAllDay > 0 && <span>{bandTotalAllDay}</span>}
              {bandTotalTasks > 0 && <span style={{ opacity: 0.7 }}>·{bandTotalTasks}t</span>}
            </span>
          )}
        </button>
      )}

      {/* Expand / contract top */}
      {showTop && (
        <div className="flex justify-center gap-0.5 py-1" style={{ borderBottom: '1px solid var(--app-line)' }}>
          {canExpandUp && (
            <button
              onClick={onExpandUp}
              className="w-5 h-5 flex items-center justify-center text-[10px] font-bold active:brightness-110"
              style={{ background: 'var(--app-accent)', color: '#fff', borderRadius: 'var(--radius-sm)' }}
              title="Show earlier hours"
            >▲</button>
          )}
          {canContractUp && (
            <button
              onClick={onContractUp}
              className="w-5 h-5 flex items-center justify-center text-[10px] font-bold active:brightness-110"
              style={{ background: 'var(--app-accent)', color: '#fff', borderRadius: 'var(--radius-sm)' }}
              title="Hide earlier hours"
            >▼</button>
          )}
        </div>
      )}

      {hours.map(h => (
        <div
          key={h}
          className="time-cell relative"
          style={{ height: rowHeight }}
        >
          <span
            className="absolute top-0.5 right-2 leading-none"
            style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.02em', color: 'var(--app-fg-subtle)' }}
          >
            {String(h).padStart(2, '0')}:00
          </span>
          {/* Half-hour dashed divider */}
          <div
            className="absolute top-1/2 left-0 right-0"
            style={{ borderTop: '1px dashed var(--app-grid-line)' }}
          />
        </div>
      ))}

      {/* Expand / contract bottom */}
      {showBottom && (
        <div className="flex justify-center gap-0.5 py-1" style={{ borderTop: '1px solid var(--app-line)' }}>
          {canContractDown && (
            <button
              onClick={onContractDown}
              className="w-5 h-5 flex items-center justify-center text-[10px] font-bold active:brightness-110"
              style={{ background: 'var(--app-accent)', color: '#fff', borderRadius: 'var(--radius-sm)' }}
              title="Hide later hours"
            >▲</button>
          )}
          {canExpandDown && (
            <button
              onClick={onExpandDown}
              className="w-5 h-5 flex items-center justify-center text-[10px] font-bold active:brightness-110"
              style={{ background: 'var(--app-accent)', color: '#fff', borderRadius: 'var(--radius-sm)' }}
              title="Show later hours"
            >▼</button>
          )}
        </div>
      )}
    </div>
  )
}
