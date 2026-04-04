import { personColor } from '@/lib/colors'

describe('personColor', () => {
  it('returns High Sky for index 0', () => expect(personColor(0)).toBe('#00ABCE'))
  it('returns Rowanberry for index 1', () => expect(personColor(1)).toBe('#cd4c38'))
  it('returns Forest Green for index 2', () => expect(personColor(2)).toBe('#4db89a'))
  it('index 3 returns rgba version of person-1 color (#00ABCE) at 0.7 opacity', () => {
    expect(personColor(3)).toBe('rgba(0,171,206,0.7)')
  })

  it('index 4 returns rgba version of person-2 color (#cd4c38) at 0.7 opacity', () => {
    expect(personColor(4)).toBe('rgba(205,76,56,0.7)')
  })

  it('index 5 returns rgba version of person-3 color (#4db89a) at 0.7 opacity', () => {
    expect(personColor(5)).toBe('rgba(77,184,154,0.7)')
  })
})
