const ALLOWED_ICS_DOMAINS = [
  // Microsoft
  'outlook.office365.com',
  'outlook.live.com',
  'outlook.office.com',
  // Google
  'calendar.google.com',
  // Apple
  'icloud.com',
  'webcal.me',
  // Other common providers
  'ical.fastmail.com',
  'cloud.timify.com',
  'app.reclaim.ai',
  'calendly.com',
  // Our own feeds — share-link ICS endpoints on production and preview
  'herbe-calendar.vercel.app',
  'herbe-calendar-test.vercel.app',
]

/** Normalize webcal:// to https:// */
export function normalizeIcsUrl(url: string): string {
  return url.replace(/^webcal:\/\//i, 'https://')
}

export function validateIcsUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(normalizeIcsUrl(url))
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'ICS URL must use HTTPS or webcal' }
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
