import { GRID_START_HOUR, GRID_END_HOUR } from '@/lib/time'

export default function TimeColumn({ is3Day = false }: { is3Day?: boolean }) {
  const hours = Array.from(
    { length: GRID_END_HOUR - GRID_START_HOUR },
    (_, i) => GRID_START_HOUR + i
  )
  return (
    <div className="w-14 shrink-0 sticky left-0 z-10 bg-black/40 backdrop-blur-md border-r border-white/5">
      <div className={`${is3Day ? 'h-16' : 'h-10'} border-b border-white/10`} /> {/* header spacer */}
      {hours.map(h => (
        <div key={h} className="h-14 border-b border-white/5 relative group">
          <span className="absolute -top-2 right-2 text-[9px] font-black tracking-tighter text-text-muted group-hover:text-primary transition-colors">
            {String(h).padStart(2, '0')}:00
          </span>
          {/* Half-hour dashed divider */}
          <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-white/5" />
        </div>
      ))}
    </div>
  )
}
