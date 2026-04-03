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

describe('sourceConfig', () => {
  const origEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...origEnv }
  })

  afterAll(() => {
    process.env = origEnv
  })

  it('isHerbeConfigured returns true when both vars set', () => {
    process.env.HERBE_API_BASE_URL = 'https://example.com'
    process.env.HERBE_COMPANY_CODE = '3'
    const { isHerbeConfigured } = require('@/lib/sourceConfig')
    expect(isHerbeConfigured()).toBe(true)
  })

  it('isHerbeConfigured returns false when base URL missing', () => {
    delete process.env.HERBE_API_BASE_URL
    process.env.HERBE_COMPANY_CODE = '3'
    const { isHerbeConfigured } = require('@/lib/sourceConfig')
    expect(isHerbeConfigured()).toBe(false)
  })

  it('isHerbeConfigured returns false when company code is empty', () => {
    process.env.HERBE_API_BASE_URL = 'https://example.com'
    process.env.HERBE_COMPANY_CODE = '  '
    const { isHerbeConfigured } = require('@/lib/sourceConfig')
    expect(isHerbeConfigured()).toBe(false)
  })

  it('isAzureConfigured returns true when all three vars set', () => {
    process.env.AZURE_TENANT_ID = 'tenant'
    process.env.AZURE_CLIENT_ID = 'client'
    process.env.AZURE_CLIENT_SECRET = 'secret'
    const { isAzureConfigured } = require('@/lib/sourceConfig')
    expect(isAzureConfigured()).toBe(true)
  })

  it('isAzureConfigured returns false when tenant missing', () => {
    delete process.env.AZURE_TENANT_ID
    process.env.AZURE_CLIENT_ID = 'client'
    process.env.AZURE_CLIENT_SECRET = 'secret'
    const { isAzureConfigured } = require('@/lib/sourceConfig')
    expect(isAzureConfigured()).toBe(false)
  })

  it('isAzureConfigured returns false when secret empty', () => {
    process.env.AZURE_TENANT_ID = 'tenant'
    process.env.AZURE_CLIENT_ID = 'client'
    process.env.AZURE_CLIENT_SECRET = ''
    const { isAzureConfigured } = require('@/lib/sourceConfig')
    expect(isAzureConfigured()).toBe(false)
  })
})
