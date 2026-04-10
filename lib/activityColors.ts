import type { Activity } from '@/types'

export const OUTLOOK_COLOR = '#6264a7' // Teams purple
export const GOOGLE_COLOR = '#4285f4'  // Google blue
export const FALLBACK_COLOR = '#6b7280' // gray — activity with no type or unknown class

/** Parse hex color to RGB values */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/** Relative luminance per WCAG 2.0 */
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/**
 * Returns a readable text color for use with a given accent color.
 * On dark backgrounds (dark theme), light accent colors get darkened text.
 * On light backgrounds (light theme), light accent colors use a darkened version.
 * For the accent-tinted background (color + '33'), ensures text is always readable.
 */
export function readableAccentColor(accentHex: string, isDarkTheme: boolean): string {
  const lum = luminance(accentHex)
  if (isDarkTheme) {
    // Dark theme: text on dark bg with light tint. Very light colors are fine as-is.
    // But extremely light colors (e.g. yellow) may lack contrast against white text in cards.
    return accentHex
  }
  // Light theme: text on light bg with color tint.
  // Light colors (high luminance) need darkening to be readable.
  if (lum > 0.4) {
    // Darken by mixing toward black
    const { r, g, b } = hexToRgb(accentHex)
    const factor = 0.45
    const dr = Math.round(r * factor)
    const dg = Math.round(g * factor)
    const db = Math.round(b * factor)
    return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`
  }
  return accentHex
}

/**
 * Returns white or dark text color for use ON a solid accent background (buttons).
 * Uses WCAG contrast ratio to decide.
 */
export function textOnAccent(accentHex: string): string {
  return luminance(accentHex) > 0.35 ? '#1a1a1a' : '#ffffff'
}

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
  // Source-level overrides (auto-extensible for new sources)
  for (const code of Object.values(SOURCE_COLOR_CODES)) {
    if (overrides[code]) map.set(code, overrides[code])
  }
  return map
}

/** Special class_group_code keys for source-level color overrides */
export const SOURCE_COLOR_CODES = {
  outlook: '__outlook__',
  google: '__google__',
  erp: '__erp__',
} as const

const SOURCE_COLOR_VALUES = new Set(Object.values(SOURCE_COLOR_CODES) as string[])

/** Resolve the display color for a single activity. */
export function getActivityColor(
  activity: Activity,
  typeToClassGroup: Map<string, string>,
  classGroupToColor: Map<string, string>
): string {
  if (activity.icsColor) return activity.icsColor
  if (activity.source === 'google') return classGroupToColor.get(SOURCE_COLOR_CODES.google) ?? GOOGLE_COLOR
  if (activity.source === 'outlook') return classGroupToColor.get(SOURCE_COLOR_CODES.outlook) ?? OUTLOOK_COLOR
  if (!activity.activityTypeCode) return classGroupToColor.get(SOURCE_COLOR_CODES.erp) ?? FALLBACK_COLOR
  const grp = typeToClassGroup.get(activity.activityTypeCode)
  if (!grp) return classGroupToColor.get(SOURCE_COLOR_CODES.erp) ?? FALLBACK_COLOR
  return classGroupToColor.get(grp) ?? FALLBACK_COLOR
}

export interface ColorOverrideRow {
  user_email: string | null
  connection_id: string | null
  class_group_code: string
  color: string
}

/**
 * Resolve the color for a class group code using the 6-level override hierarchy:
 * 1. user per-connection → 2. user global → 3. admin per-connection →
 * 4. admin global → 5. ERP CalColNr → 6. palette fallback
 */
export function resolveColorWithOverrides(
  classGroupCode: string,
  connectionId: string | null,
  classGroups: { code: string; calColNr?: string | number }[],
  groupIndex: number,
  overrides: ColorOverrideRow[],
): string {
  // Source color codes resolve directly without connection hierarchy
  if (SOURCE_COLOR_VALUES.has(classGroupCode)) {
    const defaultColor = classGroupCode === SOURCE_COLOR_CODES.outlook ? OUTLOOK_COLOR : classGroupCode === SOURCE_COLOR_CODES.google ? GOOGLE_COLOR : FALLBACK_COLOR
    const userOverride = overrides.find(o => o.class_group_code === classGroupCode && o.user_email !== null && o.connection_id === null)
    if (userOverride) return userOverride.color
    const adminOverride = overrides.find(o => o.class_group_code === classGroupCode && o.user_email === null && o.connection_id === null)
    if (adminOverride) return adminOverride.color
    return defaultColor
  }
  // 1. User per-connection
  if (connectionId) {
    const match = overrides.find(o => o.class_group_code === classGroupCode && o.user_email !== null && o.connection_id === connectionId)
    if (match) return match.color
  }
  // 2. User global
  const userGlobal = overrides.find(o => o.class_group_code === classGroupCode && o.user_email !== null && o.connection_id === null)
  if (userGlobal) return userGlobal.color
  // 3. Admin per-connection
  if (connectionId) {
    const match = overrides.find(o => o.class_group_code === classGroupCode && o.user_email === null && o.connection_id === connectionId)
    if (match) return match.color
  }
  // 4. Admin global
  const adminGlobal = overrides.find(o => o.class_group_code === classGroupCode && o.user_email === null && o.connection_id === null)
  if (adminGlobal) return adminGlobal.color
  // 5. ERP CalColNr
  const group = classGroups.find(g => g.code === classGroupCode)
  if (group) {
    const erpColor = calColNrToColor(group.calColNr)
    if (erpColor) return erpColor
  }
  // 6. Palette fallback
  return BRAND_PALETTE[groupIndex % BRAND_PALETTE.length]
}
