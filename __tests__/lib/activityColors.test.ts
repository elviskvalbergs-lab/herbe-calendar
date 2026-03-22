import { BRAND_PALETTE, HERBE_COLOR_NAMES, calColNrToColor } from '@/lib/activityColors'

describe('HERBE_COLOR_NAMES', () => {
  it('Deep Forest maps to lime-green, not teal', () => {
    expect(HERBE_COLOR_NAMES['Deep Forest']).toBe('#22c55e')
  })
  it('Sky Blue is still cyan', () => {
    expect(HERBE_COLOR_NAMES['Sky Blue']).toBe('#00ABCE')
  })
  it('Green is still #22c55e', () => {
    expect(HERBE_COLOR_NAMES['Green']).toBe('#22c55e')
  })
})

describe('BRAND_PALETTE order', () => {
  it('index 2 is green #22c55e (swapped from teal)', () => {
    expect(BRAND_PALETTE[2]).toBe('#22c55e')
  })
  it('index 5 is teal #4db89a (swapped from green)', () => {
    expect(BRAND_PALETTE[5]).toBe('#4db89a')
  })
})

describe('calColNrToColor', () => {
  it('resolves "Deep Forest" to lime-green after fix', () => {
    expect(calColNrToColor('Deep Forest')).toBe('#22c55e')
  })
  it('resolves numeric 2 to palette index 2', () => {
    expect(calColNrToColor(2)).toBe(BRAND_PALETTE[2])
  })
})
