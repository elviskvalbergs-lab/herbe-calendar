const ALLOWED_ICS_DOMAINS = [
  // Microsoft
  'outlook.office365.com',
  'outlook.live.com',
  'outlook.office.com',
  // Google
  'calendar.google.com',
  // Apple
  'caldav.icloud.com',
  'p-calendar.icloud.com',
  'webcal.me',
  // Other common providers
  'ical.fastmail.com',
  'cloud.timify.com',
  'app.reclaim.ai',
  'calendly.com',
]

export function validateIcsUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'ICS URL must use HTTPS' }
    }
    const hostname = parsed.hostname.toLowerCase()
    const allowed = ALLOWED_ICS_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    )
    if (!allowed) {
      return { valid: false, error: `Domain '${hostname}' is not in the allowed list. Allowed: ${ALLOWED_ICS_DOMAINS.join(', ')}` }
    }
    return { valid: true }
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }
}
