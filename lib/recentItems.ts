const RECENT_TYPES_KEY = 'recentActivityTypes'
const RECENT_PERSONS_KEY = 'recentPersons'
const MAX_RECENT = 6
const MAX_RECENT_TYPES = 10

export function getRecentTypes(connectionKey?: string): string[] {
  if (typeof window === 'undefined') return []
  const key = connectionKey ? `${RECENT_TYPES_KEY}_${connectionKey}` : RECENT_TYPES_KEY
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}

export function saveRecentType(code: string, connectionKey?: string) {
  const key = connectionKey ? `${RECENT_TYPES_KEY}_${connectionKey}` : RECENT_TYPES_KEY
  const list = [code, ...getRecentTypes(connectionKey).filter(c => c !== code)].slice(0, MAX_RECENT_TYPES)
  localStorage.setItem(key, JSON.stringify(list))
}

export function getRecentPersons(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(RECENT_PERSONS_KEY) ?? '[]') } catch { return [] }
}

export function saveRecentPersons(codes: string[]) {
  const existing = getRecentPersons()
  const merged = [...codes, ...existing.filter(c => !codes.includes(c))].slice(0, MAX_RECENT)
  localStorage.setItem(RECENT_PERSONS_KEY, JSON.stringify(merged))
}

const RECENT_CC_PERSONS_KEY = 'recentCCPersons'

export function getRecentCCPersons(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(RECENT_CC_PERSONS_KEY) ?? '[]') } catch { return [] }
}

export function saveRecentCCPersons(codes: string[]): void {
  if (typeof window === 'undefined' || codes.length === 0) return
  const existing = getRecentCCPersons()
  const merged = [...codes, ...existing.filter(c => !codes.includes(c))].slice(0, MAX_RECENT)
  localStorage.setItem(RECENT_CC_PERSONS_KEY, JSON.stringify(merged))
}
