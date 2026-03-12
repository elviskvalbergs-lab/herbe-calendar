/** Convert "HH:mm" to minutes since midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Convert minutes since midnight to "HH:mm" */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const PX_PER_HOUR = 56
const PX_PER_MINUTE = PX_PER_HOUR / 60

/** Convert minutes to pixel offset in the time grid */
export function minutesToPx(minutes: number): number {
  return minutes * PX_PER_MINUTE
}

/** Convert pixel offset to minutes */
export function pxToMinutes(px: number): number {
  return px / PX_PER_MINUTE
}

/** Snap minutes to nearest 15-minute boundary */
export function snapToQuarter(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

/** Grid start and end hours */
export const GRID_START_HOUR = 6
export const GRID_END_HOUR = 22
export const GRID_TOTAL_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60

/** Offset in px from top of grid for a given "HH:mm" time */
export function timeToTopPx(time: string): number {
  return minutesToPx(timeToMinutes(time) - GRID_START_HOUR * 60)
}

/** Height in px for a duration from timeFrom to timeTo */
export function durationToPx(timeFrom: string, timeTo: string): number {
  return minutesToPx(timeToMinutes(timeTo) - timeToMinutes(timeFrom))
}
