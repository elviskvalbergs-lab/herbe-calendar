import { graphFetch } from '@/lib/graph/client'
import { getAzureConfig } from '@/lib/accountConfig'

export interface OutlookEvent {
  id: string
  subject: string
  start: { dateTime: string }
  end: { dateTime: string }
  organizer?: { emailAddress?: { address?: string; name?: string } }
  isOnlineMeeting?: boolean
  onlineMeetingUrl?: string
  onlineMeeting?: { joinUrl?: string }
  attendees?: Array<{
    emailAddress?: { address?: string; name?: string }
    type?: string
    status?: { response?: string }
  }>
  location?: { displayName?: string }
  bodyPreview?: string
  webLink?: string
  responseStatus?: { response?: string }
}

/**
 * Fetch raw Outlook calendar events for a person via Graph API (domain-wide app credentials).
 * Returns null if Azure is not configured for the account, or if the request fails.
 *
 * Uses a narrow $select list suitable for full event display. Callers that only need
 * start/end times (e.g. availability) can ignore unused fields — Graph returns them anyway
 * because calendarView does not support field-level filtering on all properties.
 *
 * @param fallbackSessionEmail  If provided and the primary fetch returns 404 (user not in tenant),
 *                              attempt a fallback: search the session user's shared calendars for
 *                              one owned by `email`, and fetch from that calendar instead.
 */
export async function fetchOutlookEventsForPerson(
  email: string,
  accountId: string,
  dateFrom: string,
  dateTo: string,
  fallbackSessionEmail?: string,
): Promise<OutlookEvent[] | null> {
  const azureConfig = await getAzureConfig(accountId)
  if (!azureConfig) return null

  const startDt = `${dateFrom}T00:00:00`
  const endDt = `${dateTo}T23:59:59`
  const calendarViewParams = `startDateTime=${startDt}&endDateTime=${endDt}&$top=200&$select=id,subject,start,end,organizer,isOnlineMeeting,onlineMeetingUrl,onlineMeeting,attendees,location,bodyPreview,webLink,responseStatus`

  let res = await graphFetch(
    `/users/${email}/calendarView?${calendarViewParams}`,
    { headers: { Prefer: 'outlook.timezone="Europe/Riga"' } },
    azureConfig,
  )

  // If 404 and a fallback session email is provided, try the shared calendars approach
  if (!res.ok && res.status === 404 && fallbackSessionEmail) {
    try {
      const listRes = await graphFetch(
        `/users/${fallbackSessionEmail}/calendars?$select=id,owner`,
        undefined,
        azureConfig,
      )
      if (listRes.ok) {
        const listData = await listRes.json()
        const cals = listData.value as any[]
        console.log(`[outlookUtils] Fallback for ${email}: searching ${cals?.length ?? 0} calendars of ${fallbackSessionEmail}`)
        const sharedCal = cals?.find(c =>
          c.owner?.address?.toLowerCase() === email.toLowerCase()
        )
        if (sharedCal) {
          console.log(`[outlookUtils] Fallback found calendar ID ${sharedCal.id} for ${email}`)
          res = await graphFetch(
            `/users/${fallbackSessionEmail}/calendars/${sharedCal.id}/calendarView?${calendarViewParams}`,
            { headers: { Prefer: 'outlook.timezone="Europe/Riga"' } },
            azureConfig,
          )
        } else {
          console.log(`[outlookUtils] Fallback: No calendar owned by ${email} found in ${fallbackSessionEmail}'s list`)
        }
      } else {
        const listErr = await listRes.text()
        console.warn(`[outlookUtils] Fallback lookup failed for ${fallbackSessionEmail}: ${listRes.status} ${listErr}`)
      }
    } catch (e) {
      console.warn('[outlookUtils] Fallback shared calendar search failed:', String(e))
    }
  }

  // 404 = user not in tenant (e.g. placeholder/ICS-only user) — not an error, just no events
  if (!res.ok) return res.status === 404 ? [] : null
  const data = await res.json()
  return (data.value ?? []) as OutlookEvent[]
}

/**
 * Fetch raw Outlook events using a smaller $select (only start/end/id).
 * Cheaper for callers that only need dates/times (e.g. summary dot indicators).
 */
export async function fetchOutlookEventsMinimal(
  email: string,
  accountId: string,
  dateFrom: string,
  dateTo: string,
): Promise<Array<{ id: string; start: { dateTime: string }; end: { dateTime: string } }> | null> {
  const azureConfig = await getAzureConfig(accountId)
  if (!azureConfig) return null

  const startDt = `${dateFrom}T00:00:00`
  const endDt = `${dateTo}T23:59:59`
  const res = await graphFetch(
    `/users/${email}/calendarView?startDateTime=${startDt}&endDateTime=${endDt}&$top=500&$select=id,start,end`,
    { headers: { Prefer: 'outlook.timezone="Europe/Riga"' } },
    azureConfig,
  )
  if (!res.ok) return null
  const data = await res.json()
  return (data.value ?? []) as Array<{ id: string; start: { dateTime: string }; end: { dateTime: string } }>
}

/**
 * Convert a raw Microsoft Graph calendar event into an internal Activity.
 * Pure: no HTTP, no DB. Mirrors the inline mapping previously in /api/outlook GET.
 */
export function mapOutlookEvent(
  ev: OutlookEvent,
  personCode: string,
  sessionEmail: string,
): import('@/types').Activity {
  const startDt = ev.start?.dateTime ?? ''
  const endDt = ev.end?.dateTime ?? ''
  const organizerEmail = ev.organizer?.emailAddress?.address ?? ''
  const joinUrl = ev.onlineMeeting?.joinUrl ?? ev.onlineMeetingUrl ?? undefined
  const rawRsvp = ev.responseStatus?.response
  const rsvpStatus = (rawRsvp && rawRsvp !== 'none') ? rawRsvp as import('@/types').Activity['rsvpStatus'] : undefined
  const attendees = ev.attendees?.map(att => ({
    email: att.emailAddress?.address ?? '',
    name: att.emailAddress?.name ?? undefined,
    type: (att.type === 'optional' ? 'optional' : 'required') as 'required' | 'optional',
    responseStatus: att.status?.response ?? undefined,
  })).filter(a => a.email) ?? []
  return {
    id: ev.id ?? '',
    source: 'outlook' as const,
    personCode,
    description: ev.subject ?? '',
    date: startDt.slice(0, 10),
    timeFrom: startDt.slice(11, 16),
    timeTo: endDt.slice(11, 16),
    isOrganizer: organizerEmail.toLowerCase() === sessionEmail.toLowerCase(),
    isOnlineMeeting: ev.isOnlineMeeting === true,
    videoProvider: ev.isOnlineMeeting === true ? 'teams' as const : undefined,
    attendees,
    location: ev.location?.displayName,
    bodyPreview: ev.bodyPreview ?? '',
    joinUrl,
    webLink: ev.webLink ?? '',
    rsvpStatus,
  } as unknown as import('@/types').Activity
}
