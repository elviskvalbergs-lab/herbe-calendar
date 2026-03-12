'use client'
import { Activity, CalendarState } from '@/types'
interface Props {
  state: CalendarState
  activities: Activity[]
  loading: boolean
  sessionUserCode?: string
  onRefresh: () => void
  onSlotClick: (personCode: string, time: string) => void
  onActivityClick: (activity: Activity) => void
  onActivityUpdate: () => void
}
export default function CalendarGrid(_props: Props) {
  return <div className="flex-1 bg-bg" />
}
