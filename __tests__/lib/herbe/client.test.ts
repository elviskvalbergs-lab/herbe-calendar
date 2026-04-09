import { herbeUrl, herbeUrlById } from '@/lib/herbe/client'

const testConn = {
  id: 'test', name: 'Test', apiBaseUrl: 'https://example.com/api', companyCode: '3',
  clientId: '', clientSecret: '', accessToken: null, refreshToken: null,
  tokenExpiresAt: 0, username: null, password: null, active: true,
}

describe('herbeUrl', () => {
  it('constructs the correct ERP endpoint URL from connection', () => {
    expect(herbeUrl('ActVc', undefined, testConn)).toBe('https://example.com/api/3/ActVc')
  })

  it('appends query string when provided', () => {
    expect(herbeUrl('ActVc', 'limit=100&offset=0', testConn)).toBe(
      'https://example.com/api/3/ActVc?limit=100&offset=0'
    )
  })

  it('returns empty base when no connection provided', () => {
    expect(herbeUrl('ActVc')).toBe('//ActVc')
  })
})

describe('herbeUrlById', () => {
  it('constructs URL with register and id from connection', () => {
    expect(herbeUrlById('ActVc', '12345', testConn)).toBe('https://example.com/api/3/ActVc/12345')
  })
})
