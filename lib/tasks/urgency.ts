export type Urgency = 'overdue' | 'today' | 'none' | 'future'

function localISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function classifyUrgency(
  dueDate: string | undefined,
  done: boolean,
  now: Date,
): Urgency {
  if (done) return 'none'
  if (!dueDate) return 'none'
  const today = localISO(now)
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  return 'future'
}

import type { Task } from '@/types/task'

export function urgencyRank(u: Urgency): 0 | 1 | 2 | 3 {
  switch (u) {
    case 'overdue': return 0
    case 'today':   return 1
    case 'none':    return 2
    case 'future':  return 3
  }
}

export function compareForSidebar(a: Task, b: Task, now: Date): number {
  const ua = classifyUrgency(a.dueDate, a.done, now)
  const ub = classifyUrgency(b.dueDate, b.done, now)
  const ra = urgencyRank(ua)
  const rb = urgencyRank(ub)
  if (ra !== rb) return ra - rb

  if (ua === 'none') {
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  }
  // overdue/today/future: tie-break by dueDate ascending (oldest first for
  // overdue, soonest first for future). 'today' has identical dueDate so the
  // comparator returns 0, leaving the input order — Array.prototype.sort is
  // stable in modern engines.
  const da = a.dueDate ?? ''
  const db = b.dueDate ?? ''
  if (da < db) return -1
  if (da > db) return 1
  return 0
}
