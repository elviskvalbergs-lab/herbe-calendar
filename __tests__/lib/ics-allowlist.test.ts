import { normalizeIcsUrl, validateIcsUrl } from '@/lib/ics-allowlist'

describe('normalizeIcsUrl', () => {
  it('should replace webcal:// with https://', () => {
    expect(normalizeIcsUrl('webcal://calendar.google.com/feed.ics'))
      .toBe('https://calendar.google.com/feed.ics')
  })

  it('should be case-insensitive for webcal scheme', () => {
    expect(normalizeIcsUrl('WEBCAL://calendar.google.com/feed.ics'))
      .toBe('https://calendar.google.com/feed.ics')
    expect(normalizeIcsUrl('Webcal://calendar.google.com/feed.ics'))
      .toBe('https://calendar.google.com/feed.ics')
  })

  it('should leave https:// URLs unchanged', () => {
    const url = 'https://calendar.google.com/feed.ics'
    expect(normalizeIcsUrl(url)).toBe(url)
  })

  it('should leave http:// URLs unchanged (not convert them)', () => {
    const url = 'http://example.com/feed.ics'
    expect(normalizeIcsUrl(url)).toBe(url)
  })

  it('should handle URLs with query params and fragments', () => {
    expect(normalizeIcsUrl('webcal://calendar.google.com/feed.ics?key=val#frag'))
      .toBe('https://calendar.google.com/feed.ics?key=val#frag')
  })
})

describe('validateIcsUrl', () => {
  describe('valid URLs', () => {
    it('should accept https URL with allowed domain', () => {
      const result = validateIcsUrl('https://calendar.google.com/calendar/ical/test.ics')
      expect(result).toEqual({ valid: true })
    })

    it('should accept webcal URL with allowed domain', () => {
      const result = validateIcsUrl('webcal://calendar.google.com/calendar/ical/test.ics')
      expect(result).toEqual({ valid: true })
    })

    it('should accept all allowed domains', () => {
      const allowedDomains = [
        'outlook.office365.com',
        'outlook.live.com',
        'outlook.office.com',
        'calendar.google.com',
        'icloud.com',
        'webcal.me',
        'ical.fastmail.com',
        'cloud.timify.com',
        'app.reclaim.ai',
        'calendly.com',
      ]
      for (const domain of allowedDomains) {
        const result = validateIcsUrl(`https://${domain}/feed.ics`)
        expect(result).toEqual({ valid: true })
      }
    })

    it('should accept subdomains of allowed domains', () => {
      const result = validateIcsUrl('https://p12-caldav.icloud.com/feed.ics')
      expect(result).toEqual({ valid: true })
    })
  })

  describe('invalid URLs', () => {
    it('should reject http:// URLs', () => {
      const result = validateIcsUrl('http://calendar.google.com/feed.ics')
      expect(result).toEqual({ valid: false, error: 'ICS URL must use HTTPS or webcal' })
    })

    it('should reject unknown domains', () => {
      const result = validateIcsUrl('https://evil.example.com/feed.ics')
      expect(result.valid).toBe(false)
      expect(result.error).toContain("Domain 'evil.example.com' is not in the allowed list")
    })

    it('should reject malformed URLs', () => {
      const result = validateIcsUrl('not a url at all')
      expect(result).toEqual({ valid: false, error: 'Invalid URL format' })
    })

    it('should reject empty string', () => {
      const result = validateIcsUrl('')
      expect(result).toEqual({ valid: false, error: 'Invalid URL format' })
    })

    it('should reject domains that only partially match (suffix attack)', () => {
      // "notcalendly.com" should not match "calendly.com"
      const result = validateIcsUrl('https://notcalendly.com/feed.ics')
      expect(result.valid).toBe(false)
    })

    it('should reject ftp:// scheme', () => {
      const result = validateIcsUrl('ftp://calendar.google.com/feed.ics')
      expect(result).toEqual({ valid: false, error: 'ICS URL must use HTTPS or webcal' })
    })

    it('should include allowed domains list in error message', () => {
      const result = validateIcsUrl('https://badsite.org/feed.ics')
      expect(result.error).toContain('Allowed:')
      expect(result.error).toContain('calendar.google.com')
    })
  })
})
