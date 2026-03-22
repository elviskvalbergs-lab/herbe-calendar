import { timeToMinutes } from './time'

export interface LayoutActivity {
  id: string | number
  timeFrom: string
  timeTo: string
}

export interface LanedActivity<T extends LayoutActivity> {
  activity: T
  laneIndex: number
  laneCount: number
}

/**
 * Two-pass layout algorithm.
 *
 * Pass 1: Build collision groups — clusters of activities where any two are
 * time-overlapping (strictly: timeTo > next timeFrom). Back-to-back activities
 * (end == start) are NOT overlapping and start a new group.
 *
 * Pass 2: Within each collision group, assign lanes greedily. A lane is reused
 * when its last activity ends at or before the new activity's start (<=).
 *
 * Returns every activity annotated with its laneIndex and laneCount so the
 * caller can compute left/right percentages within a sub-column container.
 */
export function buildLanedActivities<T extends LayoutActivity>(activities: T[]): LanedActivity<T>[] {
  if (activities.length === 0) return []

  // Sort by start time
  const sorted = [...activities].sort((a, b) => a.timeFrom.localeCompare(b.timeFrom))

  // Pass 1: build collision groups
  const collisionGroups: T[][] = []
  let currentGroup: T[] = [sorted[0]]
  let currentGroupMaxEnd = timeToMinutes(sorted[0].timeTo)

  for (let i = 1; i < sorted.length; i++) {
    const act = sorted[i]
    if (timeToMinutes(act.timeFrom) < currentGroupMaxEnd) {
      // Overlaps with current group
      currentGroup.push(act)
      currentGroupMaxEnd = Math.max(currentGroupMaxEnd, timeToMinutes(act.timeTo))
    } else {
      // No overlap — start new group
      collisionGroups.push(currentGroup)
      currentGroup = [act]
      currentGroupMaxEnd = timeToMinutes(act.timeTo)
    }
  }
  collisionGroups.push(currentGroup)

  // Pass 2: assign lanes within each collision group
  const result: LanedActivity<T>[] = []

  for (const group of collisionGroups) {
    // Each lane tracks the end time (in minutes) of its last activity
    const lanes: number[] = []
    const groupResults: LanedActivity<T>[] = []

    for (const act of group) {
      const startMins = timeToMinutes(act.timeFrom)
      // Find first lane whose last activity ends at or before this start
      const laneIdx = lanes.findIndex(endMins => endMins <= startMins)
      if (laneIdx === -1) {
        // Need a new lane
        lanes.push(timeToMinutes(act.timeTo))
        groupResults.push({ activity: act, laneIndex: lanes.length - 1, laneCount: -1 })
      } else {
        lanes[laneIdx] = timeToMinutes(act.timeTo)
        groupResults.push({ activity: act, laneIndex: laneIdx, laneCount: -1 })
      }
    }

    // Patch laneCount for all activities in this group
    const laneCount = lanes.length
    for (const item of groupResults) {
      item.laneCount = laneCount
    }

    result.push(...groupResults)
  }

  return result
}
