import { personColor } from '@/lib/colors'

describe('personColor', () => {
  it('returns High Sky for index 0', () => expect(personColor(0)).toBe('#00ABCE'))
  it('returns Rowanberry for index 1', () => expect(personColor(1)).toBe('#cd4c38'))
  it('returns Forest Green for index 2', () => expect(personColor(2)).toBe('#4db89a'))
  it('cycles back to index 0 color at index 3 as rgba', () => {
    const color3 = personColor(3)
    expect(color3).toContain('rgba')
  })
})
