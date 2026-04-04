import type { Activity } from '@/types'

export const OUTLOOK_COLOR = '#6264a7' // Teams purple
export const FALLBACK_COLOR = '#6b7280' // gray — activity with no type or unknown class

/** 20 brand-compatible colors for dark theme. Index 0-based. */
export const BRAND_PALETTE = [
  '#00ABCE', // 0  cyan — brand primary
  '#cd4c38', // 1  red — brand accent
  '#22c55e', // 2  green
  '#e8923a', // 3  orange
  '#a855f7', // 4  violet
  '#3b82f6', // 5  blue
  '#ec4899', // 6  pink
  '#84cc16', // 7  lime
  '#f59e0b', // 8  amber
  '#6366f1', // 9  indigo
  '#14b8a6', // 10 teal
  '#d946ef', // 11 fuchsia
  '#64748b', // 12 slate
  '#b45309', // 13 brown
  '#0d9488', // 14 dark teal
  '#7c3aed', // 15 deep purple
  '#dc2626', // 16 crimson
  '#0284c7', // 17 sky blue
  '#65a30d', // 18 olive
  '#be185d', // 19 dark pink
] as const

const OVERRIDES_KEY = 'activityClassGroupColors'

export function loadColorOverrides(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function saveColorOverride(classGroupCode: string, color: string) {
  const overrides = loadColorOverrides()
  overrides[classGroupCode] = color
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides))
}

/** Herbe CalColNr color name → brand palette hex */
export const HERBE_COLOR_NAMES: Record<string, string> = {
  'Sky Blue':    '#00ABCE',
  'Green':       '#22c55e',
  'Red':         '#cd4c38',
  'Grey':        '#6b7280',
  'Deep Forest': '#22c55e',
  'Desert Glow': '#e8923a',
  'Coffee':      '#8b5cf6',
}

/** Map CalColNr (Herbe color name string or legacy integer) to a palette color. */
export function calColNrToColor(calColNr: string | number | undefined): string | undefined {
  if (calColNr == null) return undefined
  if (typeof calColNr === 'string') return HERBE_COLOR_NAMES[calColNr]
  if (!Number.isFinite(calColNr)) return undefined
  return BRAND_PALETTE[Math.abs(calColNr) % BRAND_PALETTE.length]
}

/** Build a classGroupCode → hex color map from class group data + overrides. */
export function buildClassGroupColorMap(
  classGroups: { code: string; calColNr?: string | number }[],
  overrides: Record<string, string>
): Map<string, string> {
  const map = new Map<string, string>()
  classGroups.forEach((g, idx) => {
    if (!g.code) return
    const base = calColNrToColor(g.calColNr) ?? BRAND_PALETTE[idx % BRAND_PALETTE.length]
    map.set(g.code, overrides[g.code] ?? base)
  })
  return map
}

/** Resolve the display color for a single activity. */
export function getActivityColor(
  activity: Activity,
  typeToClassGroup: Map<string, string>,
  classGroupToColor: Map<string, string>
): string {
  if (activity.icsColor) return activity.icsColor
  if (activity.source === 'outlook') return OUTLOOK_COLOR
  if (!activity.activityTypeCode) return FALLBACK_COLOR
  const grp = typeToClassGroup.get(activity.activityTypeCode)
  if (!grp) return FALLBACK_COLOR
  return classGroupToColor.get(grp) ?? FALLBACK_COLOR
}
