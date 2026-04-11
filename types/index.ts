/** Known calendar sources. Use string (not a closed union) so new sources can be added without touching this type. */
export type Source = 'herbe' | 'outlook' | 'google' | (string & {})

/** Well-known source identifiers */
export const SOURCES = {
  herbe: 'herbe',
  outlook: 'outlook',
  google: 'google',
} as const

/** A connected Google account for a user */
export interface UserGoogleAccount {
  id: string
  googleEmail: string
  calendars: UserGoogleCalendar[]
}

/** A single Google calendar within a connected account */
export interface UserGoogleCalendar {
  id: string
  calendarId: string       // Google's calendar ID
  name: string             // Display name from Google
  color: string | null     // User-assigned hex color
  enabled: boolean
  googleEmail: string      // Parent account email
  tokenId: string          // FK to user_google_tokens
}

export interface Person {
  code: string      // e.g. "EKS"
  name: string
  email: string
}

export interface Activity {
  id: string
  source: Source
  personCode: string
  description: string
  date: string         // "YYYY-MM-DD"
  timeFrom: string     // "HH:mm"
  timeTo: string       // "HH:mm"
  activityTypeCode?: string
  activityTypeName?: string
  projectCode?: string
  projectName?: string
  customerCode?: string
  customerName?: string
  itemCode?: string
  textInMatrix?: string   // Additional text required by ForceTextInMatrix
  mainPersons?: string[]  // Herbe: all persons on the activity
  accessGroup?: string    // comma-separated person codes (Herbe)
  planned?: boolean       // Herbe: planned (true) vs actual (false/undefined)
  okFlag?: boolean         // Herbe: OKFlag=1 means approved/locked, read-only
  location?: string        // Outlook: meeting location
  isOrganizer?: boolean   // Outlook only
  isOnlineMeeting?: boolean // Outlook: whether it's a Teams meeting
  attendees?: { email: string; name?: string; type: 'required' | 'optional'; responseStatus?: string }[]
  videoProvider?: 'teams' | 'meet' | 'zoom' | (string & {})  // Video call provider (extensible)
  joinUrl?: string        // Video meeting join link
  webLink?: string        // Outlook web UI link that opens this specific event
  ccPersons?: string[]    // Herbe CCPersons field — comma-split
  rsvpStatus?: 'accepted' | 'declined' | 'tentativelyAccepted' | 'notResponded' | 'organizer'
  erpConnectionId?: string   // ID of the ERP connection this activity came from
  erpConnectionName?: string // Name of the ERP connection this activity came from
  isExternal?: boolean   // ICS-backed external calendar
  isAllDay?: boolean     // All-day or multi-day event (no specific time)
  icsColor?: string      // Custom color from ICS calendar settings
  icsCalendarName?: string  // Name of the ICS calendar this event came from
  googleAccountEmail?: string  // Per-user Google: the connected account email
  googleCalendarId?: string    // Per-user Google: the specific calendar ID
  googleTokenId?: string       // Per-user Google: token ID for CRUD routing
}

export interface ActivityType {
  code: string
  name: string
  classGroupCode?: string
}

export interface ActivityClassGroup {
  code: string
  name: string
  calColNr?: string | number
  forceProj?: boolean
  forceCust?: boolean
  forceItem?: boolean
  forceTextInMatrix?: boolean
}

export interface SearchResult {
  code: string
  name: string
  customerCode?: string
  customerName?: string
}

export interface CalendarState {
  view: 'day' | '3day' | '5day' | '7day'
  date: string           // "YYYY-MM-DD" — anchor date
  selectedPersons: Person[]
}

export interface CalendarSource {
  id: string        // 'herbe' | 'outlook' | 'ics:<name>'
  label: string
  color: string
  personCode?: string  // for grouping ICS calendars by person
  group?: string          // e.g. "Google (elvis@gmail.com)"
  googleTokenId?: string  // for CRUD routing
  googleCalendarId?: string
}

export interface Favorite {
  id: string
  name: string
  view: CalendarState['view']
  personCodes: string[]
  hiddenCalendars?: string[]
}

export type ShareVisibility = 'busy' | 'titles' | 'full'

export interface ShareLink {
  id: string
  favoriteId: string
  token: string
  name: string
  visibility: ShareVisibility
  hasPassword: boolean
  expiresAt: string | null
  createdAt: string
  lastAccessedAt: string | null
  accessCount: number
  bookingEnabled?: boolean
  templateIds?: string[]
}

export interface AvailabilityWindow {
  days: number[]        // 0=Sun, 1=Mon, ... 6=Sat
  startTime: string     // "HH:mm"
  endTime: string       // "HH:mm"
}

export interface CustomField {
  label: string
  type: 'text' | 'email'
  required: boolean
}

export interface TemplateTargets {
  erp?: {
    connectionId: string
    fields: Record<string, string>
  }[]
  outlook?: {
    enabled: boolean
    onlineMeeting: boolean
    location?: string
  }
  google?: {
    enabled: boolean
    onlineMeeting: boolean
    location?: string
  }
  zoom?: {
    enabled: boolean
  }
}

export interface BookingTemplate {
  id: string
  name: string
  duration_minutes: number
  availability_windows: AvailabilityWindow[]
  buffer_minutes: number
  targets: TemplateTargets
  custom_fields: CustomField[]
  active: boolean
  created_at: string
  updated_at: string
  linked_share_links?: { id: string; name: string }[]
}

export interface Booking {
  id: string
  template_id: string
  share_link_id: string
  booker_email: string
  booked_date: string
  booked_time: string
  duration_minutes: number
  field_values: Record<string, string>
  cancel_token: string
  status: 'confirmed' | 'cancelled' | 'rescheduled'
  created_erp_ids: { connectionId: string; activityId: string }[]
  created_outlook_id: string | null
  created_google_id: string | null
  created_at: string
}
