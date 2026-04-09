import { timeToMinutes, minutesToPx, snapToQuarter, pxToMinutes, timeToTopPx, durationToPx, minutesToTime } from '@/lib/time'

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

describe('timeToTopPx', () => {
  // Grid starts at 07:00. timeToTopPx('07:00') should be 0px
  // timeToTopPx('09:00') = 2 hours * 56px = 112px
  it('returns 0 for 07:00 (grid start)', () => expect(timeToTopPx('07:00')).toBe(0))
  it('returns 112 for 09:00 (2 hours from grid start)', () => expect(timeToTopPx('09:00')).toBeCloseTo(112))
})

describe('durationToPx', () => {
  it('returns 56 for a 1-hour activity', () => expect(durationToPx('09:00', '10:00')).toBeCloseTo(56))
  it('returns 28 for a 30-minute activity', () => expect(durationToPx('09:00', '09:30')).toBeCloseTo(28))
})

describe('minutesToTime', () => {
  it('converts 480 to "08:00"', () => expect(minutesToTime(480)).toBe('08:00'))
  it('converts 0 to "00:00"', () => expect(minutesToTime(0)).toBe('00:00'))
})
