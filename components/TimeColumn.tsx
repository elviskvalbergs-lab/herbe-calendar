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
  /** Height in px of the day-col-header so the gutter spacer matches it exactly. */
  headerHeight?: number
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
  headerHeight = 48,
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
      {/* Header spacer — height is measured from the first day-col-header
          (passed in as headerHeight) so the gutter and date columns line up
          exactly regardless of font/line-height. */}
      <div style={{ height: headerHeight, borderBottom: '1px solid var(--app-line)', background: 'var(--app-bg-alt)' }} />

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
            color: 'var(--app-fg-muted)',
            border: 'none',
            borderBottom: '1px solid var(--app-line)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18, height: 18,
              borderRadius: 4,
              background: 'color-mix(in oklab, var(--app-accent) 14%, transparent)',
              color: 'var(--app-accent)',
              flexShrink: 0,
            }}
          >
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: bandCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 120ms' }}
            >
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </span>
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
        <div className="flex justify-center gap-1 py-1" style={{ borderBottom: '1px solid var(--app-line)' }}>
          {canExpandUp && (
            <button
              onClick={onExpandUp}
              title="Show earlier hours"
              className="hour-pill"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(180deg)' }}><path d="m6 9 6 6 6-6"/></svg>
            </button>
          )}
          {canContractUp && (
            <button
              onClick={onContractUp}
              title="Hide earlier hours"
              className="hour-pill"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>
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
        <div className="flex justify-center gap-1 py-1" style={{ borderTop: '1px solid var(--app-line)' }}>
          {canContractDown && (
            <button
              onClick={onContractDown}
              title="Hide later hours"
              className="hour-pill"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(180deg)' }}><path d="m6 9 6 6 6-6"/></svg>
            </button>
          )}
          {canExpandDown && (
            <button
              onClick={onExpandDown}
              title="Show later hours"
              className="hour-pill"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
