export type Source = 'herbe' | 'outlook'

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
  isOrganizer?: boolean   // Outlook only
  joinUrl?: string        // Outlook/Teams meeting join link
  webLink?: string        // Outlook web UI link that opens this specific event
  ccPersons?: string[]    // Herbe CCPersons field — comma-split
  rsvpStatus?: 'accepted' | 'declined' | 'tentativelyAccepted' | 'notResponded' | 'organizer'
  isExternal?: boolean   // ICS-backed external calendar
  isAllDay?: boolean     // All-day or multi-day event (no specific time)
  icsColor?: string      // Custom color from ICS calendar settings
  icsCalendarName?: string  // Name of the ICS calendar this event came from
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
  view: 'day' | '3day' | '5day'
  date: string           // "YYYY-MM-DD" — anchor date
  selectedPersons: Person[]
}

export interface CalendarSource {
  id: string        // 'herbe' | 'outlook' | 'ics:<name>'
  label: string
  color: string
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
}
