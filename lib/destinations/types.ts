export type DestinationMode = 'task' | 'event'
export type DestinationSource = 'herbe' | 'outlook' | 'google'

export type DestinationMeta =
  | { kind: 'herbe';         connectionId: string; connectionName: string }
  | { kind: 'outlook-task';  listId: string; listName: string }
  | { kind: 'outlook-event' }
  | { kind: 'google-task';   tokenId: string; listId: string;   listName: string;   email: string }
  | { kind: 'google-event';  tokenId: string; calendarId: string; calendarName: string; email: string }

export interface Destination {
  /** Parseable stable identity — see makeKey / parseDestinationKey. */
  key: string
  source: DestinationSource
  /** Short human label (list/calendar/connection name). */
  label: string
  /** "ERP" | "Outlook" | "Google" — for the source prefix in the dropdown. */
  sourceLabel: string
  /** Hex color for the leading dot. Brand color or per-calendar override. */
  color: string
  meta: DestinationMeta
}
