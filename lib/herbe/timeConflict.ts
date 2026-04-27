import type { Activity } from '@/types'
import type { HerbeFieldError } from './errors'

interface ProposedRange {
  date: string
  timeFrom: string
  timeTo: string
  personCodes: string[]
  editId?: string
  connectionId?: string
}

const TIME_FIELDS = new Set(['StartTime', 'EndTime', 'TimeFromHHMM', 'TimeToHHMM'])

/** True when the ERP returned a conflict-shaped error: code 1547, or a field
 *  error pointing at one of the start/end-time fields. */
export function isTimeConflictError(
  fieldErrors: HerbeFieldError[] | undefined,
  errors: string[] | undefined,
): boolean {
  if (fieldErrors?.some(f => f.code === '1547' || TIME_FIELDS.has(f.field))) return true
  if (errors?.some(e => /1547|time conflict/i.test(e))) return true
  return false
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function activityPersons(a: Activity): string[] {
  if (a.mainPersons?.length) return a.mainPersons
  return a.personCode ? [a.personCode] : []
}

/** Find ERP activities that overlap the proposed time range for any of the
 *  given persons. Excludes the activity being edited. */
export function findTimeConflicts(
  proposed: ProposedRange,
  activities: Activity[],
): Activity[] {
  if (!proposed.timeFrom || !proposed.timeTo || !proposed.date) return []
  const pS = toMin(proposed.timeFrom)
  const pE = toMin(proposed.timeTo)
  if (!(pE > pS)) return []
  const wantedPersons = new Set(proposed.personCodes)
  const out: Activity[] = []
  const seen = new Set<string>()
  for (const a of activities) {
    if (a.source !== 'herbe') continue
    if (a.date !== proposed.date) continue
    if (proposed.editId && a.id === proposed.editId) continue
    if (proposed.connectionId && a.erpConnectionId && a.erpConnectionId !== proposed.connectionId) continue
    if (!a.timeFrom || !a.timeTo) continue
    const persons = activityPersons(a)
    if (!persons.some(p => wantedPersons.has(p))) continue
    const aS = toMin(a.timeFrom)
    const aE = toMin(a.timeTo)
    if (!(aE > aS)) continue
    if (pS < aE && pE > aS) {
      if (seen.has(a.id)) continue
      seen.add(a.id)
      out.push(a)
    }
  }
  return out
}

function describeOverlap(proposed: ProposedRange, conflict: Activity): string {
  const pS = toMin(proposed.timeFrom)
  const pE = toMin(proposed.timeTo)
  const aS = toMin(conflict.timeFrom)
  const aE = toMin(conflict.timeTo)
  const endHitsStart = pS < aS && pE > aS  // proposed end runs into existing start
  const startHitsEnd = pS < aE && pE > aE  // proposed start runs into existing end
  if (endHitsStart && !startHitsEnd) return `which starts at ${conflict.timeFrom}`
  if (startHitsEnd && !endHitsStart) return `which ends at ${conflict.timeTo}`
  return `which runs ${conflict.timeFrom}–${conflict.timeTo}`
}

function eventLabel(a: Activity): string {
  return (a.description || a.activityTypeName || 'another event').trim()
}

/** Build a friendly conflict message. Returns null if there are no conflicts
 *  (so the caller can fall back to the original server message). */
export function formatTimeConflictMessage(
  proposed: ProposedRange,
  conflicts: Activity[],
): string | null {
  if (conflicts.length === 0) return null
  if (conflicts.length === 1) {
    const c = conflicts[0]
    return `This event overlaps with "${eventLabel(c)}" ${describeOverlap(proposed, c)}. Adjust the start or end time and save again.`
  }
  const lines = conflicts.map(c => `"${eventLabel(c)}" (${c.timeFrom}–${c.timeTo})`)
  return `This event overlaps with: ${lines.join('; ')}. Adjust the start or end time and save again.`
}
