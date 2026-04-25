import { pool } from '@/lib/db'
import type { Activity, SharingLevel } from '@/types'

interface BusyBlock { start: string; end: string }

/**
 * Fetch shared calendar events from other users for a set of person codes.
 * Discovers users who have calendars with sharing != 'private' and fetches
 * events, filtering by visibility level.
 */
export async function fetchSharedCalendarEvents(
  personCodes: string[],
  viewerEmail: string,
  accountId: string,
  dateFrom: string,
  dateTo: string,
  hiddenCalendars?: Set<string>,
): Promise<{ events: Activity[]; busyBlocks: Map<string, BusyBlock[]> }> {
  const events: Activity[] = []
  const busyBlocks = new Map<string, BusyBlock[]>()

  function addBusy(date: string, block: BusyBlock) {
    const existing = busyBlocks.get(date) ?? []
    existing.push(block)
    busyBlocks.set(date, existing)
  }

  // 1. ICS feeds shared by OTHER users for these person codes
  const { rows: sharedIcs } = await pool.query(
    `SELECT uc.user_email, uc.target_person_code, uc.ics_url, uc.color, uc.name, uc.sharing
     FROM user_calendars uc
     WHERE uc.account_id = $1
       AND uc.target_person_code = ANY($2)
       AND uc.sharing != 'private'
       AND LOWER(uc.user_email) != LOWER($3)`,
    [accountId, personCodes, viewerEmail]
  )

  for (const row of sharedIcs) {
    const icsSourceId = `ics:${row.name} (shared)`
    if (hiddenCalendars?.has(icsSourceId)) continue
    try {
      // Fetch this specific ICS URL directly (not all feeds for the user+person)
      const { fetchIcsEvents } = await import('@/lib/icsParser')
      const result = await fetchIcsEvents(row.ics_url, row.target_person_code, dateFrom, dateTo)
      for (const ev of result.events) {
        const date = String(ev.date ?? '')
        const start = String(ev.timeFrom ?? '')
        const end = String(ev.timeTo ?? '')
        const isAllDay = ev.isAllDay === true
        if (!date || (!isAllDay && (!start || !end))) continue

        if (!isAllDay) addBusy(date, { start, end })
        events.push(applySharing({
          id: `shared-ics-${ev.id ?? date + start}`,
          source: 'outlook' as Activity['source'],
          personCode: row.target_person_code,
          date,
          timeFrom: start || '00:00',
          timeTo: end || '23:59',
          description: String(ev.description ?? ''),
          icsColor: row.color ?? undefined,
          icsCalendarName: `${row.name} (shared)`,
          isShared: true,
          isAllDay,
        } as Activity, row.sharing as SharingLevel))
      }
    } catch (e) {
      console.warn(`[sharedCalendars] ICS fetch failed for ${row.name}:`, String(e))
    }
  }

  // 2. Google OAuth calendars shared by OTHER users
  const { rows: sharedGoogle } = await pool.query(
    `SELECT gt.user_email, gc.calendar_id, gc.name, gc.color, gc.sharing, gt.id as token_id
     FROM user_google_calendars gc
     JOIN user_google_tokens gt ON gt.id = gc.user_google_token_id
     WHERE gt.account_id = $1
       AND gc.enabled = true
       AND gc.sharing != 'private'
       AND LOWER(gt.user_email) != LOWER($2)`,
    [accountId, viewerEmail]
  )

  // Group by token_id to batch per-user token fetches
  const tokenGroups = new Map<string, typeof sharedGoogle>()
  for (const row of sharedGoogle) {
    const group = tokenGroups.get(row.token_id) ?? []
    group.push(row)
    tokenGroups.set(row.token_id, group)
  }

  for (const [tokenId, cals] of tokenGroups) {
    try {
      const { getValidAccessTokenForUser } = await import('@/lib/google/userOAuth')
      const { getOAuthCalendarClient } = await import('@/lib/google/client')
      // Token belongs to a different user than the viewer (these are SHARED
      // calendars). Use the owner's email — carried on every row — so the
      // ownership check passes. account_id is the same across the join.
      const ownerEmail = cals[0]?.user_email
      if (!ownerEmail) continue
      const accessToken = await getValidAccessTokenForUser(tokenId, ownerEmail, accountId)
      if (!accessToken) continue

      const oauthCal = getOAuthCalendarClient(accessToken)
      for (const cal of cals) {
        const googleSourceId = `ics:${cal.name} (shared)`
        if (hiddenCalendars?.has(googleSourceId)) continue
        try {
          const res = await oauthCal.events.list({
            calendarId: cal.calendar_id,
            timeMin: `${dateFrom}T00:00:00Z`,
            timeMax: `${dateTo}T23:59:59Z`,
            timeZone: 'Europe/Riga',  // Google converts UTC boundaries to this timezone for filtering
            singleEvents: true,
            fields: 'items(id,summary,start,end,status)',
            maxResults: 250,
          })
          for (const ev of res.data.items ?? []) {
            if (ev.status === 'cancelled') continue
            const isAllDay = !ev.start?.dateTime
            const startStr = ev.start?.dateTime ?? ev.start?.date ?? ''
            const endStr = ev.end?.dateTime ?? ev.end?.date ?? ''
            if (!startStr || !endStr) continue
            const date = startStr.slice(0, 10)
            const start = isAllDay ? '00:00' : startStr.slice(11, 16)
            const end = isAllDay ? '23:59' : endStr.slice(11, 16)
            if (!date) continue

            if (!isAllDay) addBusy(date, { start, end })
            events.push(applySharing({
              id: `shared-g-${ev.id}`,
              source: 'google' as Activity['source'],
              personCode: '',
              date,
              timeFrom: start,
              timeTo: end,
              description: ev.summary ?? '',
              icsColor: cal.color ?? undefined,
              icsCalendarName: `${cal.name} (shared)`,
              isShared: true,
              isAllDay,
            } as Activity, cal.sharing as SharingLevel))
          }
        } catch (e) {
          console.warn(`[sharedCalendars] Google calendar "${cal.name}" fetch failed:`, String(e))
        }
      }
    } catch (e) {
      console.warn(`[sharedCalendars] Google token ${tokenId} failed:`, String(e))
    }
  }

  return { events, busyBlocks }
}

/** Apply sharing level visibility filter to an event */
function applySharing(event: Activity, sharing: SharingLevel): Activity {
  const base = { ...event, sharingLevel: sharing }
  if (sharing === 'busy') {
    return {
      ...base,
      description: 'Busy',
      textInMatrix: undefined,
      location: undefined,
      attendees: undefined,
    }
  }
  if (sharing === 'titles') {
    return {
      ...base,
      textInMatrix: undefined,
      location: undefined,
      attendees: undefined,
    }
  }
  // 'full' — return as-is
  return base
}
