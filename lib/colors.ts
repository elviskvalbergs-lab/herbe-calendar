import type React from 'react'

const PERSON_COLORS = [
  '#00ABCE', // cyan — brand primary
  '#cd4c38', // red — brand accent
  '#4db89a', // teal
  '#a855f7', // violet
  '#e8923a', // orange
  '#3b82f6', // blue
  '#ec4899', // pink
  '#84cc16', // lime
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#14b8a6', // dark teal
  '#d946ef', // fuchsia
] as const

/** Get a consistent brand color for a person by their zero-based index in the view. */
export function personColor(index: number): string {
  return PERSON_COLORS[index % PERSON_COLORS.length]
}

const PERSON_COLOR_KEY = 'personColorOverrides'

/** Load custom person color overrides from localStorage */
export function loadPersonColorOverrides(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(PERSON_COLOR_KEY) || '{}')
  } catch { return {} }
}

/** Save a custom color for a person code */
export function savePersonColorOverride(personCode: string, color: string): void {
  if (typeof window === 'undefined') return
  const overrides = loadPersonColorOverrides()
  overrides[personCode] = color
  localStorage.setItem(PERSON_COLOR_KEY, JSON.stringify(overrides))
}

/** Remove custom color override for a person code */
export function removePersonColorOverride(personCode: string): void {
  if (typeof window === 'undefined') return
  const overrides = loadPersonColorOverrides()
  delete overrides[personCode]
  localStorage.setItem(PERSON_COLOR_KEY, JSON.stringify(overrides))
}

/** Return CSS custom property for a person column */
export function personStyle(index: number): React.CSSProperties {
  const color = personColor(index)
  return { '--person-color': color } as React.CSSProperties
}
