export const HERBE_ID = 'herbe'
export const OUTLOOK_ID = 'outlook'
export const HERBE_COLOR = '#228B22'

export function icsId(name: string): string {
  return `ics:${name}`
}

const STORAGE_KEY = 'calendarVisibility'

export function loadHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {}
  return new Set()
}

export function saveHidden(hidden: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]))
  } catch {}
}
