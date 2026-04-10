import { buildBookingEmail, buildActivityText, type BookingEmailData } from '@/lib/bookingEmail'

function makeData(overrides: Partial<BookingEmailData> = {}): BookingEmailData {
  return {
    templateName: 'Strategy Call',
    date: '2026-04-15',
    time: '14:00',
    duration: 30,
    bookerEmail: 'alice@example.com',
    participants: ['bob@example.com', 'carol@example.com'],
    fieldValues: { Company: 'Acme', Notes: 'Discuss roadmap' },
    cancelUrl: 'https://cal.example.com/cancel/abc123',
    status: 'confirmed',
    ...overrides,
  }
}

describe('buildBookingEmail', () => {
  it('returns correct subject for confirmed booking', () => {
    const { subject } = buildBookingEmail(makeData({ status: 'confirmed' }))
    expect(subject).toBe('Booking Confirmed: Strategy Call — 2026-04-15 14:00')
  })

  it('returns correct subject for cancelled booking', () => {
    const { subject } = buildBookingEmail(makeData({ status: 'cancelled' }))
    expect(subject).toBe('Booking Cancelled: Strategy Call — 2026-04-15 14:00')
  })

  it('returns correct subject for rescheduled booking', () => {
    const { subject } = buildBookingEmail(makeData({ status: 'rescheduled' }))
    expect(subject).toBe('Booking Rescheduled: Strategy Call — 2026-04-15 14:00')
  })

  it('HTML contains template name, date, time, and duration', () => {
    const { html } = buildBookingEmail(makeData())
    expect(html).toContain('Strategy Call')
    expect(html).toContain('2026-04-15')
    expect(html).toContain('14:00')
    expect(html).toContain('30 min')
  })

  it('HTML contains booker email and participants', () => {
    const { html } = buildBookingEmail(makeData())
    expect(html).toContain('alice@example.com')
    expect(html).toContain('bob@example.com')
    expect(html).toContain('carol@example.com')
  })

  it('HTML contains custom field values', () => {
    const { html } = buildBookingEmail(makeData())
    expect(html).toContain('Company')
    expect(html).toContain('Acme')
    expect(html).toContain('Notes')
    expect(html).toContain('Discuss roadmap')
  })

  it('HTML does NOT contain cancel button when status is cancelled', () => {
    const { html } = buildBookingEmail(makeData({ status: 'cancelled' }))
    expect(html).not.toContain('Cancel / Reschedule')
    expect(html).not.toContain('cancel/abc123')
  })

  it('HTML contains cancel URL when status is confirmed', () => {
    const { html } = buildBookingEmail(makeData({ status: 'confirmed' }))
    expect(html).toContain('https://cal.example.com/cancel/abc123')
    expect(html).toContain('Cancel / Reschedule')
  })

  it('escapes special characters to prevent XSS', () => {
    const { html } = buildBookingEmail(makeData({
      templateName: '<script>alert("xss")</script>',
      bookerEmail: 'evil@"hacker.com',
      fieldValues: { 'Hack&Field': '<b>bold</b>' },
    }))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;hacker.com')
    expect(html).toContain('Hack&amp;Field')
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
  })
})

describe('buildActivityText', () => {
  it('includes booker email', () => {
    const text = buildActivityText('alice@example.com', {}, 'https://cancel.url')
    expect(text).toContain('Booked by: alice@example.com')
  })

  it('includes all field values', () => {
    const text = buildActivityText('a@b.com', { Company: 'Acme', Topic: 'Sales' }, 'https://x')
    expect(text).toContain('Company: Acme')
    expect(text).toContain('Topic: Sales')
  })

  it('includes cancel URL', () => {
    const text = buildActivityText('a@b.com', {}, 'https://cancel.example.com/xyz')
    expect(text).toContain('Cancel/reschedule: https://cancel.example.com/xyz')
  })

  it('shows dash for empty optional fields', () => {
    const text = buildActivityText('a@b.com', { Company: '', Notes: '' }, 'https://x')
    expect(text).toContain('Company: \u2014')
    expect(text).toContain('Notes: \u2014')
  })
})
