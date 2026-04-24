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
