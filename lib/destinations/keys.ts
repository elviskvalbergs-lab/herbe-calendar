import type { Destination, DestinationSource } from './types'

export function makeKey(dest: Destination): string {
  switch (dest.meta.kind) {
    case 'herbe':         return `herbe:${dest.meta.connectionId}`
    case 'outlook-task':  return `outlook:${dest.meta.listId}`
    case 'outlook-event': return `outlook`
    case 'google-task':   return `google:${dest.meta.tokenId}:${dest.meta.listId}`
    case 'google-event':  return `google:${dest.meta.tokenId}:${dest.meta.calendarId}`
  }
}

/** Parse a key back into its source + raw parts. Returns null if malformed.
 * The caller still needs to look up the full Destination from a fetched list
 * — parsing alone cannot recover label / color / email / etc. */
export function parseDestinationKey(
  key: string,
): { source: DestinationSource; parts: string[] } | null {
  if (!key) return null
  if (key === 'outlook') return { source: 'outlook', parts: [] }
  const idx = key.indexOf(':')
  if (idx <= 0) return null
  const source = key.slice(0, idx)
  const rest = key.slice(idx + 1)
  if (source !== 'herbe' && source !== 'outlook' && source !== 'google') return null
  const parts = rest.split(':')
  if (parts.length === 0 || parts[0] === '') return null
  if (source === 'google' && parts.length !== 2) return null
  if (source === 'herbe'  && parts.length !== 1) return null
  if (source === 'outlook' && parts.length !== 1) return null
  return { source, parts }
}
