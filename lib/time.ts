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

export const PX_PER_HOUR = 56

/** Convert minutes to pixel offset in the time grid */
export function minutesToPx(minutes: number, scale: number = 1): number {
  return minutes * (PX_PER_HOUR * scale) / 60
}

/** Convert pixel offset to minutes */
export function pxToMinutes(px: number, scale: number = 1): number {
  return px / ((PX_PER_HOUR * scale) / 60)
}

/** Snap minutes to nearest 15-minute boundary */
export function snapToQuarter(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

/** Grid start and end hours */
export const GRID_START_HOUR = 7
export const GRID_END_HOUR = 19
export const GRID_TOTAL_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60

/** Offset in px from top of grid for a given "HH:mm" time */
export function timeToTopPx(time: string, scale: number = 1, startHour?: number): number {
  return minutesToPx(timeToMinutes(time) - (startHour ?? GRID_START_HOUR) * 60, scale)
}

/** Height in px for a duration from timeFrom to timeTo */
export function durationToPx(timeFrom: string, timeTo: string, scale: number = 1): number {
  return minutesToPx(timeToMinutes(timeTo) - timeToMinutes(timeFrom), scale)
}
