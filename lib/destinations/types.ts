export type DestinationMode = 'task' | 'event'
export type DestinationSource = 'herbe' | 'outlook' | 'google'

export type DestinationMeta =
  | { kind: 'herbe';         connectionId: string; connectionName: string }
  | { kind: 'outlook-task';  listId: string; listName: string }
  | { kind: 'outlook-event' }
  | { kind: 'google-task';   tokenId: string; listId: string;   listName: string }
  | { kind: 'google-event';  tokenId: string; calendarId: string; calendarName: string }

export interface Destination {
  /** Parseable stable identity — see makeKey / parseDestinationKey.
   *  May be the empty string for edit-mode synthetic destinations whose real
   *  list/calendar id isn't known yet — pair with `editLabelHint`. */
  key: string
  source: DestinationSource
  /** Short human label (list/calendar/connection name). */
  label: string
  /** "ERP" | "Outlook" | "Google" — for the source prefix in the dropdown. */
  sourceLabel: string
  /** Hex color for the leading dot. Brand color or per-calendar override. */
  color: string
  meta: DestinationMeta
  /** When set, the picker reconciles a synthetic edit-mode destination
   *  against the fetched list by matching `label === editLabelHint`. Used
   *  instead of encoding "__edit__" into the parseable key. */
  editLabelHint?: string
}
