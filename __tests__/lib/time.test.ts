import { timeToMinutes, minutesToPx, snapToQuarter, pxToMinutes } from '@/lib/time'

describe('timeToMinutes', () => {
  it('converts "08:00" to 480', () => expect(timeToMinutes('08:00')).toBe(480))
  it('converts "00:00" to 0', () => expect(timeToMinutes('00:00')).toBe(0))
  it('converts "22:30" to 1350', () => expect(timeToMinutes('22:30')).toBe(1350))
})

describe('snapToQuarter', () => {
  it('rounds 487 to 480 (08:00)', () => expect(snapToQuarter(487)).toBe(480))
  it('rounds 497 to 495 (08:15)', () => expect(snapToQuarter(497)).toBe(495))
  it('rounds 510 to 510 (08:30)', () => expect(snapToQuarter(510)).toBe(510))
})

describe('minutesToPx / pxToMinutes', () => {
  // Grid: 56px per hour = 56/60 px per minute
  it('converts 60 minutes to 56px', () => expect(minutesToPx(60)).toBeCloseTo(56))
  it('round-trips 120 minutes', () => expect(pxToMinutes(minutesToPx(120))).toBeCloseTo(120))
})
