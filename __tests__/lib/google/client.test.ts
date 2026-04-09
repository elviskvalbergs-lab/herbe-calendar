const mockJWT = jest.fn()
const mockCalendar = jest.fn()
const mockAdmin = jest.fn()

jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('@/lib/crypto', () => ({
  decrypt: jest.fn(),
}))
jest.mock('googleapis', () => ({
  google: {
    auth: { JWT: mockJWT },
    calendar: mockCalendar,
    admin: mockAdmin,
  },
}))

const { pool } = require('@/lib/db')
const { decrypt } = require('@/lib/crypto')

function freshModule() {
  jest.resetModules()
  jest.mock('@/lib/db', () => ({ pool: { query: pool.query } }))
  jest.mock('@/lib/crypto', () => ({ decrypt: decrypt }))
  jest.mock('googleapis', () => ({
    google: {
      auth: { JWT: mockJWT },
      calendar: mockCalendar,
      admin: mockAdmin,
    },
  }))
  return require('@/lib/google/client') as typeof import('@/lib/google/client')
}

describe('getGoogleConfig', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns null when no config row exists', async () => {
    const { getGoogleConfig } = freshModule()
    pool.query.mockResolvedValueOnce({ rows: [] })
    const result = await getGoogleConfig('acct-1')
    expect(result).toBeNull()
  })

  it('returns config from DB and decrypts key', async () => {
    const { getGoogleConfig } = freshModule()
    pool.query.mockResolvedValueOnce({
      rows: [{
        service_account_email: 'sa@project.iam.gserviceaccount.com',
        service_account_key: Buffer.from('encrypted-key'),
        admin_email: 'admin@example.com',
        domain: 'example.com',
      }],
    })
    decrypt.mockReturnValueOnce('-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----')

    const result = await getGoogleConfig('acct-1')
    expect(result).toEqual({
      serviceAccountEmail: 'sa@project.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----',
      adminEmail: 'admin@example.com',
      domain: 'example.com',
    })
    expect(decrypt).toHaveBeenCalledWith(Buffer.from('encrypted-key'))
  })

  it('uses cache on second call', async () => {
    const { getGoogleConfig } = freshModule()
    pool.query.mockResolvedValueOnce({
      rows: [{
        service_account_email: 'sa@proj.iam.gserviceaccount.com',
        service_account_key: null,
        admin_email: 'admin@example.com',
        domain: 'example.com',
      }],
    })

    await getGoogleConfig('acct-c')
    const second = await getGoogleConfig('acct-c')
    expect(pool.query).toHaveBeenCalledTimes(1)
    expect(second).toMatchObject({ domain: 'example.com' })
  })

  it('returns null and caches on DB error', async () => {
    const { getGoogleConfig } = freshModule()
    pool.query.mockRejectedValueOnce(new Error('db down'))

    const result = await getGoogleConfig('acct-err')
    expect(result).toBeNull()

    const second = await getGoogleConfig('acct-err')
    expect(second).toBeNull()
    expect(pool.query).toHaveBeenCalledTimes(1)
  })
})

describe('getCalendarClient', () => {
  it('returns a Calendar instance with JWT auth', () => {
    const { getCalendarClient } = freshModule()
    const calendarObj = { events: {} }
    mockCalendar.mockReturnValueOnce(calendarObj)

    const config = {
      serviceAccountEmail: 'sa@proj.iam.gserviceaccount.com',
      privateKey: 'key',
      adminEmail: 'admin@example.com',
      domain: 'example.com',
    }
    const result = getCalendarClient(config, 'user@example.com')

    expect(mockJWT).toHaveBeenCalledWith({
      email: 'sa@proj.iam.gserviceaccount.com',
      key: 'key',
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      subject: 'user@example.com',
    })
    expect(mockCalendar).toHaveBeenCalledWith({ version: 'v3', auth: expect.anything() })
    expect(result).toBe(calendarObj)
  })
})

describe('getDirectoryClient', () => {
  it('returns a Directory instance with admin impersonation', () => {
    const { getDirectoryClient } = freshModule()
    const dirObj = { users: {} }
    mockAdmin.mockReturnValueOnce(dirObj)

    const config = {
      serviceAccountEmail: 'sa@proj.iam.gserviceaccount.com',
      privateKey: 'key',
      adminEmail: 'admin@example.com',
      domain: 'example.com',
    }
    const result = getDirectoryClient(config)

    expect(mockJWT).toHaveBeenCalledWith({
      email: 'sa@proj.iam.gserviceaccount.com',
      key: 'key',
      scopes: ['https://www.googleapis.com/auth/admin.directory.user.readonly'],
      subject: 'admin@example.com',
    })
    expect(mockAdmin).toHaveBeenCalledWith({ version: 'directory_v1', auth: expect.anything() })
    expect(result).toBe(dirObj)
  })
})
