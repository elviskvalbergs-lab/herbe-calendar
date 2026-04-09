jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('@/lib/crypto', () => ({
  decrypt: jest.fn(),
}))
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}))

const { pool } = require('@/lib/db')
const { decrypt } = require('@/lib/crypto')
const { createTransport } = require('nodemailer')

function freshModule() {
  jest.resetModules()
  jest.mock('@/lib/db', () => ({ pool: { query: pool.query } }))
  jest.mock('@/lib/crypto', () => ({ decrypt: decrypt }))
  jest.mock('nodemailer', () => ({ createTransport: createTransport }))
  return require('@/lib/smtp') as typeof import('@/lib/smtp')
}

describe('getSmtpConfig', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns null when no config row exists', async () => {
    const { getSmtpConfig } = freshModule()
    pool.query.mockResolvedValueOnce({ rows: [] })
    const result = await getSmtpConfig('acct-1')
    expect(result).toBeNull()
  })

  it('returns config from DB and decrypts password', async () => {
    const { getSmtpConfig } = freshModule()
    pool.query.mockResolvedValueOnce({
      rows: [{
        host: 'smtp.example.com',
        port: 587,
        username: 'user@example.com',
        password: Buffer.from('encrypted'),
        sender_email: 'noreply@example.com',
        sender_name: 'Herbe',
        use_tls: true,
      }],
    })
    decrypt.mockReturnValueOnce('decrypted-pass')

    const result = await getSmtpConfig('acct-1')
    expect(result).toEqual({
      host: 'smtp.example.com',
      port: 587,
      username: 'user@example.com',
      password: 'decrypted-pass',
      senderEmail: 'noreply@example.com',
      senderName: 'Herbe',
      useTls: true,
    })
    expect(decrypt).toHaveBeenCalledWith(Buffer.from('encrypted'))
  })

  it('uses cache on second call', async () => {
    const { getSmtpConfig } = freshModule()
    pool.query.mockResolvedValueOnce({
      rows: [{
        host: 'smtp.example.com',
        port: 465,
        username: 'u',
        password: null,
        sender_email: 's@e.com',
        sender_name: '',
        use_tls: false,
      }],
    })

    await getSmtpConfig('acct-2')
    const second = await getSmtpConfig('acct-2')
    expect(pool.query).toHaveBeenCalledTimes(1)
    expect(second).toMatchObject({ host: 'smtp.example.com' })
  })

  it('returns null and caches on DB error', async () => {
    const { getSmtpConfig } = freshModule()
    pool.query.mockRejectedValueOnce(new Error('db down'))

    const result = await getSmtpConfig('acct-err')
    expect(result).toBeNull()

    // second call should use cache, not query again
    const second = await getSmtpConfig('acct-err')
    expect(second).toBeNull()
    expect(pool.query).toHaveBeenCalledTimes(1)
  })
})

describe('sendMailSmtp', () => {
  beforeEach(() => jest.clearAllMocks())

  const config = {
    host: 'smtp.example.com',
    port: 587,
    username: 'user',
    password: 'pass',
    senderEmail: 'noreply@example.com',
    senderName: 'Herbe',
    useTls: true,
  }

  it('calls createTransport with correct params and sends mail', async () => {
    const sendMail = jest.fn().mockResolvedValue({})
    createTransport.mockReturnValueOnce({ sendMail })

    const { sendMailSmtp } = freshModule()
    await sendMailSmtp(config, 'to@example.com', 'Subject', '<p>body</p>')

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'user', pass: 'pass' },
      tls: { rejectUnauthorized: false },
    })

    expect(sendMail).toHaveBeenCalledWith({
      from: '"Herbe" <noreply@example.com>',
      to: 'to@example.com',
      subject: 'Subject',
      html: '<p>body</p>',
    })
  })

  it('sets secure true for port 465', async () => {
    const sendMail = jest.fn().mockResolvedValue({})
    createTransport.mockReturnValueOnce({ sendMail })

    const { sendMailSmtp } = freshModule()
    await sendMailSmtp({ ...config, port: 465 }, 'to@example.com', 'S', '<p>b</p>')

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true })
    )
  })

  it('uses plain email as from when senderName is empty', async () => {
    const sendMail = jest.fn().mockResolvedValue({})
    createTransport.mockReturnValueOnce({ sendMail })

    const { sendMailSmtp } = freshModule()
    await sendMailSmtp({ ...config, senderName: '' }, 'to@example.com', 'S', '<p>b</p>')

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'noreply@example.com' })
    )
  })
})
