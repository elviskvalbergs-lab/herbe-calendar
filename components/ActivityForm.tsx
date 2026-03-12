'use client'
import { Activity, Person } from '@/types'
interface Props {
  initial?: Partial<Activity>
  editId?: string
  people: Person[]
  defaultPersonCode: string
  todayActivities: Activity[]
  onClose: () => void
  onSaved: () => void
  onDuplicate: (initial: Partial<Activity>) => void
}
export default function ActivityForm(_props: Props) {
  return null
}
