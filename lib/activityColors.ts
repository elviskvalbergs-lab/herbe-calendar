import type { Activity } from '@/types'

export const OUTLOOK_COLOR = '#6264a7' // Teams purple
export const FALLBACK_COLOR = '#6b7280' // gray — activity with no type or unknown class

/** 20 brand-compatible colors for dark theme. Index 0-based. */
export const BRAND_PALETTE = [
  '#00ABCE', // 0  cyan — brand primary
  '#cd4c38', // 1  red — brand accent
  '#4db89a', // 2  teal — brand secondary
  '#e8923a', // 3  orange
  '#a855f7', // 4  violet
  '#22c55e', // 5  green
  '#f59e0b', // 6  amber
  '#3b82f6', // 7  blue
  '#ec4899', // 8  pink
  '#14b8a6', // 9  teal-400
  '#f97316', // 10 orange-500
  '#8b5cf6', // 11 purple-500
  '#06b6d4', // 12 cyan-400
  '#84cc16', // 13 lime
  '#d946ef', // 14 fuchsia
  '#10b981', // 15 emerald
  '#6366f1', // 16 indigo
  '#ef4444', // 17 red-500
  '#f43f5e', // 18 rose
  '#64748b', // 19 slate
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
const HERBE_COLOR_NAMES: Record<string, string> = {
  'Sky Blue':    '#00ABCE',
  'Green':       '#22c55e',
  'Red':         '#cd4c38',
  'Grey':        '#6b7280',
  'Deep Forest': '#4db89a',
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
  if (activity.source === 'outlook') return OUTLOOK_COLOR
  if (!activity.activityTypeCode) return FALLBACK_COLOR
  const grp = typeToClassGroup.get(activity.activityTypeCode)
  if (!grp) return FALLBACK_COLOR
  return classGroupToColor.get(grp) ?? FALLBACK_COLOR
}
