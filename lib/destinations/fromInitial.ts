import type { Destination, DestinationMode } from './types'
import { makeKey } from './keys'

const HERBE_COLOR   = '#00AEE7'
const OUTLOOK_COLOR = '#6264a7'
const GOOGLE_COLOR  = '#4285f4'

interface InitialLike {
  source?: string
  erpConnectionId?: string
  erpConnectionName?: string
  googleTokenId?: string
  googleCalendarId?: string
  googleCalendarName?: string
  /** Only present when opening for a task edit. Not on Activity — added defensively. */
  listName?: string
}

interface ErpConnectionLike { id: string; name: string }

/**
 * Build a `Destination` from an edit-mode `initial` record. Returns null when
 * the record carries no recognizable source. The returned destination is a
 * best-effort synthetic: meta fields that don't exist on the edit record
 * (e.g. Outlook list id) fall back to empty strings, which is fine because
 * edit-mode save paths route by `editId` and don't consume those fields.
 *
 * Downstream consumers in `ActivityForm` rely only on `source` and `meta.kind`
 * (to derive `isErpSource` / `isGoogleSource` / `isOutlookSource` and to route
 * POST/PATCH calls), plus `meta.connectionId` for the ERP connection param.
 */
export function destinationFromInitial(
  initial: InitialLike | undefined,
  mode: DestinationMode,
  erpConnections: readonly ErpConnectionLike[],
): Destination | null {
  if (!initial?.source) return null

  if (initial.source === 'herbe') {
    const conn = erpConnections.find(c => c.id === initial.erpConnectionId) ?? erpConnections[0]
    if (!conn) return null
    const d: Destination = {
      key: '',
      source: 'herbe',
      label: conn.name,
      sourceLabel: 'ERP',
      color: HERBE_COLOR,
      meta: { kind: 'herbe', connectionId: conn.id, connectionName: conn.name },
    }
    d.key = makeKey(d)
    return d
  }

  if (initial.source === 'outlook') {
    if (mode === 'event') {
      const d: Destination = {
        key: '',
        source: 'outlook',
        label: 'Outlook',
        sourceLabel: 'Outlook',
        color: OUTLOOK_COLOR,
        meta: { kind: 'outlook-event' },
      }
      d.key = makeKey(d)
      return d
    }
    return {
      key: 'outlook:__edit__',
      source: 'outlook',
      label: initial.listName ?? 'Tasks',
      sourceLabel: 'Outlook',
      color: OUTLOOK_COLOR,
      meta: { kind: 'outlook-task', listId: '', listName: initial.listName ?? '' },
    }
  }

  if (initial.source === 'google') {
    const tokenId = initial.googleTokenId ?? ''
    if (mode === 'event') {
      const calendarId = initial.googleCalendarId ?? ''
      const calendarName = initial.googleCalendarName ?? 'Google'
      return {
        key: `google:${tokenId}:${calendarId}`,
        source: 'google',
        label: calendarName,
        sourceLabel: 'Google',
        color: GOOGLE_COLOR,
        meta: { kind: 'google-event', tokenId, calendarId, calendarName, email: '' },
      }
    }
    return {
      key: `google:${tokenId}:__edit__`,
      source: 'google',
      label: initial.listName ?? 'Google',
      sourceLabel: 'Google',
      color: GOOGLE_COLOR,
      meta: {
        kind: 'google-task',
        tokenId,
        listId: '',
        listName: initial.listName ?? '',
        email: '',
      },
    }
  }

  return null
}
