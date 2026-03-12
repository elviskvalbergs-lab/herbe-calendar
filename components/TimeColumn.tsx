import { GRID_START_HOUR, GRID_END_HOUR } from '@/lib/time'

export default function TimeColumn() {
  const hours = Array.from(
    { length: GRID_END_HOUR - GRID_START_HOUR },
    (_, i) => GRID_START_HOUR + i
  )
  return (
    <div className="w-12 shrink-0 sticky left-0 z-10 bg-surface">
      <div className="h-10 border-b border-border" /> {/* header spacer */}
      {hours.map(h => (
        <div key={h} className="h-14 border-b border-border/30 relative">
          <span className="absolute -top-2 right-2 text-[10px] text-text-muted">
            {String(h).padStart(2, '0')}:00
          </span>
          {/* Half-hour dashed divider */}
          <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-border/20" />
        </div>
      ))}
    </div>
  )
}
