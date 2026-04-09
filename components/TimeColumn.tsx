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
  const hours = Array.from(
    { length: end - start },
    (_, i) => start + i
  )
  const rowHeight = PX_PER_HOUR * scale
  const showTop = canExpandUp || canContractUp
  const showBottom = canExpandDown || canContractDown
  return (
    <div className="w-12 shrink-0 sticky left-0 z-10 bg-surface">
      <div className={`${is3Day ? 'h-16' : 'h-10'} border-b border-border`} /> {/* header spacer */}
      {/* Expand / contract top */}
      {showTop && (
        <div className="flex justify-center gap-0.5 py-1 border-b border-border/30">
          {canExpandUp && (
            <button
              onClick={onExpandUp}
              className="w-5 h-5 flex items-center justify-center rounded-lg bg-primary/80 text-white text-[10px] font-bold shadow active:bg-primary"
              title="Show earlier hours"
            >▲</button>
          )}
          {canContractUp && (
            <button
              onClick={onContractUp}
              className="w-5 h-5 flex items-center justify-center rounded-lg bg-primary/80 text-white text-[10px] font-bold shadow active:bg-primary"
              title="Hide earlier hours"
            >▼</button>
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
      {showBottom && (
        <div className="flex justify-center gap-0.5 py-1 border-t border-border/30">
          {canContractDown && (
            <button
              onClick={onContractDown}
              className="w-5 h-5 flex items-center justify-center rounded-lg bg-primary/80 text-white text-[10px] font-bold shadow active:bg-primary"
              title="Hide later hours"
            >▲</button>
          )}
          {canExpandDown && (
            <button
              onClick={onExpandDown}
              className="w-5 h-5 flex items-center justify-center rounded-lg bg-primary/80 text-white text-[10px] font-bold shadow active:bg-primary"
              title="Show later hours"
            >▼</button>
          )}
        </div>
      )}
    </div>
  )
}
