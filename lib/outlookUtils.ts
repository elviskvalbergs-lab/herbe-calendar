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
 */
export async function fetchOutlookEventsForPerson(
  email: string,
  accountId: string,
  dateFrom: string,
  dateTo: string,
): Promise<OutlookEvent[] | null> {
  const azureConfig = await getAzureConfig(accountId)
  if (!azureConfig) return null

  const startDt = `${dateFrom}T00:00:00`
  const endDt = `${dateTo}T23:59:59`
  const res = await graphFetch(
    `/users/${email}/calendarView?startDateTime=${startDt}&endDateTime=${endDt}&$top=200&$select=id,subject,start,end,organizer,isOnlineMeeting,onlineMeetingUrl,onlineMeeting,attendees,location,bodyPreview,webLink,responseStatus`,
    { headers: { Prefer: 'outlook.timezone="Europe/Riga"' } },
    azureConfig,
  )
  if (!res.ok) return null
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
