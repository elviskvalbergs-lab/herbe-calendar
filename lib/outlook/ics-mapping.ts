/**
 * Registry mapping external emails or person codes to public/secret ICS (iCal) feed URLs.
 * This allows fetching external calendars without Graph API organization boundaries.
 */
export const ICS_MAPPING: Record<string, string> = {
  'elvis@excellent.lv': 'https://outlook.office365.com/owa/calendar/5ef07701a95447f88e8ff04ab5fe2cfe@excellent.lv/6ff7b70e396e4c178a8bf0a8545dde1e2879010679296530894/calendar.ics',
  'barba@excellent.lv': '', // Placeholder: User can provide this later
}

export function getIcsUrlByEmail(email: string): string | undefined {
  const lower = email.toLowerCase()
  return ICS_MAPPING[lower]
}
