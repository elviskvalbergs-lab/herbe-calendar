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
}

export default function TimeColumn({
  is3Day = false, scale = 1, startHour, endHour,
  canExpandUp, canExpandDown, canContractUp, canContractDown,
  onExpandUp, onExpandDown, onContractUp, onContractDown,
}: Props) {
  const start = startHour ?? GRID_START_HOUR
  const end = endHour ?? GRID_END_HOUR
  const hours = Array.from({ length: end - start }, (_, i) => start + i)
  const rowHeight = PX_PER_HOUR * scale
  const showTop = canExpandUp || canContractUp
  const showBottom = canExpandDown || canContractDown

  return (
    <div
      className="time-col shrink-0 sticky left-0 z-10"
      style={{ width: 'var(--time-col-w, 56px)' }}
    >
      {/* Header spacer — mirrors day-col-header height */}
      <div className={is3Day ? 'h-12' : 'h-6'} style={{ borderBottom: '1px solid var(--app-line)', background: 'var(--app-bg-alt)' }} />

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
