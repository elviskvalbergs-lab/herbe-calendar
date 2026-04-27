import { herbeUrl, herbeUrlById, extractHerbePage } from '@/lib/herbe/client'

const testConn = {
  id: 'test', name: 'Test', apiBaseUrl: 'https://example.com/api', companyCode: '3',
  clientId: '', clientSecret: '', accessToken: null, refreshToken: null,
  tokenExpiresAt: 0, username: null, password: null, active: true,
  timezone: 'Europe/Riga',
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

describe('extractHerbePage', () => {
  it('reads the snapshot cursor from data["@sequence"]', () => {
    const json = {
      data: {
        '@register': 'ActVc',
        '@sequence': '33905356',
        ActVc: [{ SerNr: '100' }, { SerNr: '101' }],
      },
    }
    expect(extractHerbePage(json, 'ActVc')).toEqual({
      sequence: '33905356',
      page: [{ SerNr: '100' }, { SerNr: '101' }],
    })
  })

  it('coerces numeric sequence to string', () => {
    const json = { data: { '@sequence': 42, ActVc: [] } }
    expect(extractHerbePage(json, 'ActVc').sequence).toBe('42')
  })

  it('returns null sequence when @sequence is missing', () => {
    const json = { data: { ActVc: [{ SerNr: '1' }] } }
    expect(extractHerbePage(json, 'ActVc')).toEqual({
      sequence: null,
      page: [{ SerNr: '1' }],
    })
  })

  it('returns empty page when register key is absent', () => {
    const json = { data: { '@sequence': '9' } }
    expect(extractHerbePage(json, 'ActVc')).toEqual({ sequence: '9', page: [] })
  })

  it('ignores per-record @sequence (only top-level data.@sequence is the cursor)', () => {
    const json = {
      data: {
        '@sequence': '100',
        ActVc: [{ '@sequence': '50', SerNr: '1' }],
      },
    }
    expect(extractHerbePage(json, 'ActVc').sequence).toBe('100')
  })
})
