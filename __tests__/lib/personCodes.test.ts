import { generateCode } from '@/lib/personCodes'

describe('generateCode', () => {
  it('generates code from "Elvis Kvalbergs" → "EKS"', () => {
    expect(generateCode('Elvis Kvalbergs')).toBe('EKS')
  })

  it('generates code from "John Doe" → "JDE"', () => {
    expect(generateCode('John Doe')).toBe('JDE')
  })

  it('generates code from "Anna Maria Berzina" → "ABA" (uses last word)', () => {
    expect(generateCode('Anna Maria Berzina')).toBe('ABA')
  })

  it('handles single-word name by taking first 3 chars', () => {
    expect(generateCode('Admin')).toBe('ADM')
  })

  it('pads short single-word names with X', () => {
    expect(generateCode('Al')).toBe('ALX')
  })

  it('handles single char name', () => {
    expect(generateCode('A')).toBe('AXX')
  })

  it('returns USR for empty string', () => {
    expect(generateCode('')).toBe('USR')
  })

  it('returns USR for whitespace-only', () => {
    expect(generateCode('   ')).toBe('USR')
  })

  it('handles extra whitespace in name', () => {
    expect(generateCode('  Elvis   Kvalbergs  ')).toBe('EKS')
  })

  it('uppercases the result', () => {
    expect(generateCode('elvis kvalbergs')).toBe('EKS')
  })

  it('generates code from "Jānis Āboltiņš" → "JĀŠ"', () => {
    const result = generateCode('Jānis Āboltiņš')
    expect(result).toBe('JĀŠ')
  })
})
