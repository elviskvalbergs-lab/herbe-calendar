import { buildLanedActivities, LanedActivity, LayoutActivity } from '@/lib/layout'

function act(id: string, timeFrom: string, timeTo: string): LayoutActivity {
  return { id, timeFrom, timeTo }
}

function lanes(results: LanedActivity<LayoutActivity>[]) {
  return Object.fromEntries(results.map(r => [r.activity.id, { lane: r.laneIndex, count: r.laneCount }]))
}

describe('buildLanedActivities', () => {
  it('returns empty for no activities', () => {
    expect(buildLanedActivities([])).toEqual([])
  })

  it('single activity gets lane 0 of 1', () => {
    const result = lanes(buildLanedActivities([act('A', '09:00', '10:00')]))
    expect(result).toEqual({ A: { lane: 0, count: 1 } })
  })

  it('back-to-back activities (end == start) do NOT overlap — each gets full lane', () => {
    const result = lanes(buildLanedActivities([
      act('A', '09:00', '10:00'),
      act('B', '10:00', '11:00'),
    ]))
    expect(result.A).toEqual({ lane: 0, count: 1 })
    expect(result.B).toEqual({ lane: 0, count: 1 })
  })

  it('truly overlapping activities share a collision group', () => {
    const result = lanes(buildLanedActivities([
      act('A', '09:00', '10:00'),
      act('B', '09:30', '10:30'),
    ]))
    expect(result.A.count).toBe(2)
    expect(result.B.count).toBe(2)
    expect(result.A.lane).not.toBe(result.B.lane)
  })

  it('three sequential activities — each full width (laneCount === 1)', () => {
    const result = lanes(buildLanedActivities([
      act('A', '09:00', '10:00'),
      act('B', '10:00', '11:00'),
      act('C', '11:00', '12:00'),
    ]))
    // laneCount 1 means left=0%, right=0% → full sub-column width
    expect(result.A).toEqual({ lane: 0, count: 1 })
    expect(result.B).toEqual({ lane: 0, count: 1 })
    expect(result.C).toEqual({ lane: 0, count: 1 })
  })

  it('transitive chain A-B overlap, B-C overlap → all in one group of 2 lanes', () => {
    // A(9-10), B(9:30-10:30), C(10:00-11:00)
    // A and C touch but don't overlap; B connects them transitively
    const result = lanes(buildLanedActivities([
      act('A', '09:00', '10:00'),
      act('B', '09:30', '10:30'),
      act('C', '10:00', '11:00'),
    ]))
    expect(result.A.count).toBe(2)
    expect(result.B.count).toBe(2)
    expect(result.C.count).toBe(2)
    // A and C can share a lane (C starts exactly when A ends — allowed)
    expect(result.A.lane).toBe(result.C.lane)
    expect(result.B.lane).not.toBe(result.A.lane)
  })

  it('mix: one overlap pair, then independent activity', () => {
    const result = lanes(buildLanedActivities([
      act('A', '09:00', '10:00'),
      act('B', '09:30', '10:30'),
      act('C', '11:00', '12:00'),
    ]))
    expect(result.A.count).toBe(2)
    expect(result.B.count).toBe(2)
    expect(result.C).toEqual({ lane: 0, count: 1 })
  })
})
