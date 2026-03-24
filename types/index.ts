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
  ccPersons?: string[]    // Herbe CCPersons field — comma-split
  rsvpStatus?: 'accepted' | 'declined' | 'tentativelyAccepted' | 'notResponded' | 'organizer'
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
