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

const btnClass = 'w-full flex items-center justify-center py-1 text-text-muted text-[10px] leading-none font-bold border-b border-border/30 hover:bg-border transition-colors cursor-pointer'

export default function TimeColumn({
  is3Day = false, scale = 1, startHour, endHour,
  canExpandUp, canExpandDown, canContractUp, canContractDown,
  onExpandUp, onExpandDown, onContractUp, onContractDown,
}: Props) {
  const start = startHour ?? GRID_START_HOUR
  const end = endHour ?? GRID_END_HOUR
  const hours = Array.from(
    { length: end - start },
    (_, i) => start + i
  )
  const rowHeight = PX_PER_HOUR * scale
  return (
    <div className="w-12 shrink-0 sticky left-0 z-10 bg-surface">
      <div className={`${is3Day ? 'h-16' : 'h-10'} border-b border-border`} /> {/* header spacer */}
      {/* Expand / contract top */}
      {(canExpandUp || canContractUp) && (
        <div className="flex">
          {canExpandUp && (
            <button onClick={onExpandUp} className={btnClass} title="Show earlier hours">
              ▲
            </button>
          )}
          {canContractUp && (
            <button onClick={onContractUp} className={btnClass} title="Hide earlier hours">
              ▼
            </button>
          )}
        </div>
      )}
      {hours.map(h => (
        <div key={h} className="border-b border-border/30 relative" style={{ height: rowHeight }}>
          <span className="absolute -top-2 right-2 text-[10px] text-text-muted">
            {String(h).padStart(2, '0')}:00
          </span>
          {/* Half-hour dashed divider */}
          <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-border/20" />
        </div>
      ))}
      {/* Expand / contract bottom */}
      {(canExpandDown || canContractDown) && (
        <div className="flex">
          {canContractDown && (
            <button onClick={onContractDown} className={btnClass} title="Hide later hours">
              ▲
            </button>
          )}
          {canExpandDown && (
            <button onClick={onExpandDown} className={btnClass} title="Show later hours">
              ▼
            </button>
          )}
        </div>
      )}
    </div>
  )
}
