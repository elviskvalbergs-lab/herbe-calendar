import type React from 'react'

const BASE_COLORS = ['#00ABCE', '#cd4c38', '#4db89a'] as const

/** Get a consistent brand color for a person by their zero-based index in the view. */
export function personColor(index: number): string {
  const base = BASE_COLORS[index % 3]
  if (index < 3) return base
  // 4th person onwards: tinted at 70% opacity as rgba
  const r = parseInt(base.slice(1, 3), 16)
  const g = parseInt(base.slice(3, 5), 16)
  const b = parseInt(base.slice(5, 7), 16)
  return `rgba(${r},${g},${b},0.7)`
}

/** Return CSS custom property for a person column */
export function personStyle(index: number): React.CSSProperties {
  const color = personColor(index)
  return { '--person-color': color } as React.CSSProperties
}
