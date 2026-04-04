import { personColor, loadPersonColorOverrides, savePersonColorOverride, removePersonColorOverride } from '@/lib/colors'

describe('personColor', () => {
  it('returns cyan for index 0', () => expect(personColor(0)).toBe('#00ABCE'))
  it('returns red for index 1', () => expect(personColor(1)).toBe('#cd4c38'))
  it('returns teal for index 2', () => expect(personColor(2)).toBe('#4db89a'))
  it('returns violet for index 3', () => expect(personColor(3)).toBe('#a855f7'))
  it('returns orange for index 4', () => expect(personColor(4)).toBe('#e8923a'))
  it('wraps around after 12 colors', () => expect(personColor(12)).toBe('#00ABCE'))
  it('wraps at 13 to second color', () => expect(personColor(13)).toBe('#cd4c38'))
})

describe('personColorOverrides', () => {
  it('returns empty object when window is undefined (SSR)', () => {
    // In node test env without localStorage, should return {}
    expect(loadPersonColorOverrides()).toEqual({})
  })
})
