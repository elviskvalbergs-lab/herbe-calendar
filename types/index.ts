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
  mainPersons?: string[]  // Herbe: all persons on the activity
  accessGroup?: string    // comma-separated person codes (Herbe)
  isOrganizer?: boolean   // Outlook only
  joinUrl?: string        // Outlook/Teams meeting join link
}

export interface ActivityType {
  code: string
  name: string
}

export interface SearchResult {
  code: string
  name: string
  customerCode?: string
  customerName?: string
}

export interface CalendarState {
  view: 'day' | '3day'
  date: string           // "YYYY-MM-DD" — anchor date
  selectedPersons: Person[]
}
