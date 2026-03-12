import { getHerbeToken, herbeUrl } from '@/lib/herbe/client'

describe('herbeUrl', () => {
  it('constructs the correct ERP endpoint URL', () => {
    process.env.HERBE_API_BASE_URL = 'https://example.com/api'
    process.env.HERBE_COMPANY_CODE = '3'
    expect(herbeUrl('ActVc')).toBe('https://example.com/api/3/ActVc')
  })

  it('appends query string when provided', () => {
    process.env.HERBE_API_BASE_URL = 'https://example.com/api'
    process.env.HERBE_COMPANY_CODE = '3'
    expect(herbeUrl('ActVc', 'limit=100&offset=0')).toBe(
      'https://example.com/api/3/ActVc?limit=100&offset=0'
    )
  })
})

describe('getHerbeToken', () => {
  it('throws if HERBE_CLIENT_ID is missing', async () => {
    delete process.env.HERBE_CLIENT_ID
    await expect(getHerbeToken()).rejects.toThrow('HERBE_CLIENT_ID')
  })
})
