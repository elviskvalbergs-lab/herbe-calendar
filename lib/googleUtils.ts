import { getGoogleConfig, getCalendarClient, getOAuthCalendarClient } from '@/lib/google/client'
import { getUserGoogleAccounts, getValidAccessToken } from '@/lib/google/userOAuth'
import type { calendar_v3 } from 'googleapis'
import type { Activity } from '@/types'

export type GoogleCalendarEvent = calendar_v3.Schema$Event

export interface MapGoogleEventExtra {
  googleCalendarId?: string
  googleCalendarName?: string
  googleAccountEmail?: string
  icsColor?: string
  googleTokenId?: string
}

/**
 * Map a raw Google Calendar API event to an Activity.
 *
 * @param ev            Raw Google Calendar event
 * @param personCode    The person code this event belongs to
 * @param sessionEmail  The logged-in user's email (used for organizer/RSVP detection)
 * @param extra         Optional extra fields for per-user OAuth events
 * @param personEmail   Optional email of the person being fetched (for isOrganizer check)
 */
export function mapGoogleEvent(
  ev: GoogleCalendarEvent,
  personCode: string,
  sessionEmail: string,
  extra?: MapGoogleEventExtra,
  personEmail?: string | null,
): Activity {
  const start = ev.start?.dateTime ?? ev.start?.date ?? ''
  const end = ev.end?.dateTime ?? ev.end?.date ?? ''
  const isAllDay = !ev.start?.dateTime
  const startDate = start.slice(0, 10)
  const startTime = ev.start?.dateTime ? start.slice(11, 16) : '00:00'
  const endTime = ev.end?.dateTime ? end.slice(11, 16) : '23:59'

  // Extract Google Meet link
  const meetLink = ev.conferenceData?.entryPoints?.find(
    (ep: any) => ep.entryPointType === 'video'
  )?.uri

  // Map attendees
  const attendees = ((ev.attendees ?? []) as any[]).map((att: any) => ({
    email: att.email ?? '',
    name: att.displayName ?? undefined,
    type: (att.optional ? 'optional' : 'required') as 'required' | 'optional',
    responseStatus: att.responseStatus ?? undefined,
  })).filter((a: any) => a.email)

  const organizerEmail = ev.organizer?.email ?? ''
  const rsvpSelf = (ev.attendees as any[] | undefined)?.find((a: any) => a.self)?.responseStatus
  const rsvpStatus = rsvpSelf === 'accepted' ? 'accepted'
    : rsvpSelf === 'declined' ? 'declined'
    : rsvpSelf === 'tentative' ? 'tentativelyAccepted'
    : organizerEmail.toLowerCase() === sessionEmail.toLowerCase() ? 'organizer'
    : undefined

  const activity: Activity = {
    id: ev.id ?? '',
    source: 'google',
    personCode,
    description: ev.summary ?? '',
    date: startDate,
    timeFrom: startTime,
    timeTo: endTime,
    isOrganizer: organizerEmail.toLowerCase() === sessionEmail.toLowerCase() || (!!personEmail && organizerEmail.toLowerCase() === personEmail.toLowerCase()),
    isAllDay,
    attendees,
    location: ev.location ?? undefined,
    joinUrl: meetLink ?? undefined,
    webLink: ev.htmlLink ?? '',
    textInMatrix: ev.description ?? undefined,
    isOnlineMeeting: !!meetLink,
    videoProvider: meetLink ? 'meet' as const : undefined,
    rsvpStatus: rsvpStatus as Activity['rsvpStatus'],
  }

  if (extra?.icsColor) activity.icsColor = extra.icsColor
  // Extra fields for per-user OAuth events
  if (extra?.googleCalendarId) activity.googleCalendarId = extra.googleCalendarId
  if (extra?.googleCalendarName) activity.googleCalendarName = extra.googleCalendarName
  if (extra?.googleAccountEmail) activity.googleAccountEmail = extra.googleAccountEmail
  if (extra?.googleTokenId) activity.googleTokenId = extra.googleTokenId

  return activity
}

/**
 * Fetch Google Calendar events for a person via domain-wide delegation.
 * Returns null if Google is not configured for the account.
 * Returns an empty array if the person's calendar cannot be accessed.
 *
 * @param email      The user's Google Workspace email (to impersonate)
 * @param accountId  Account scope for config lookup
 * @param dateFrom   ISO date string (e.g. "2026-04-08")
 * @param dateTo     ISO date string (inclusive)
 * @param fields     Optional fields selector (googleapis format). Omit for all fields.
 */
export async function fetchGoogleEventsForPerson(
  email: string,
  accountId: string,
  dateFrom: string,
  dateTo: string,
  fields?: string,
): Promise<GoogleCalendarEvent[] | null> {
  const googleConfig = await getGoogleConfig(accountId)
  if (!googleConfig) return null

  try {
    const calendar = getCalendarClient(googleConfig, email)
    const params: calendar_v3.Params$Resource$Events$List = {
      calendarId: 'primary',
      timeMin: `${dateFrom}T00:00:00+03:00`,
      timeMax: `${dateTo}T23:59:59+03:00`,
      timeZone: 'Europe/Riga',
      singleEvents: true,
      maxResults: 200,
    }
    if (fields) params.fields = fields
    const res = await calendar.events.list(params)
    return res.data.items ?? []
  } catch (e) {
    console.warn(`[googleUtils] Calendar fetch failed for ${email}:`, String(e))
    return []
  }
}

export interface PerUserGoogleEvent {
  event: GoogleCalendarEvent
  calendarId: string
  calendarName: string
  accountEmail: string
  tokenId: string
  color?: string
}

/**
 * Fetch Google Calendar events from all per-user OAuth calendars for a given user.
 * Skips accounts with expired tokens (logs a warning for each).
 *
 * @param ownerEmail  The user whose connected Google accounts to query
 * @param accountId   Account scope
 * @param dateFrom    ISO date string
 * @param dateTo      ISO date string
 * @param fields      Optional fields selector (e.g. 'items(id,summary,start,end,...)')
 * @returns           Flat list of events annotated with calendar/account metadata,
 *                    plus a warnings array for any expired tokens or failed calendars.
 */
export async function fetchPerUserGoogleEvents(
  ownerEmail: string,
  accountId: string,
  dateFrom: string,
  dateTo: string,
  fields?: string,
): Promise<{ events: PerUserGoogleEvent[]; warnings: string[] }> {
  const userAccounts = await getUserGoogleAccounts(ownerEmail, accountId)
  const events: PerUserGoogleEvent[] = []
  const warnings: string[] = []

  for (const account of userAccounts) {
    const enabledCals = account.calendars.filter(c => c.enabled)
    if (enabledCals.length === 0) continue

    const accessToken = await getValidAccessToken(account.id)
    if (!accessToken) {
      warnings.push(`Google (${account.googleEmail}): token expired`)
      continue
    }

    const oauthCal = getOAuthCalendarClient(accessToken)
    for (const cal of enabledCals) {
      try {
        const params: calendar_v3.Params$Resource$Events$List = {
          calendarId: cal.calendarId,
          timeMin: `${dateFrom}T00:00:00Z`,
          timeMax: `${dateTo}T23:59:59Z`,
          singleEvents: true,
          maxResults: 250,
        }
        if (fields) params.fields = fields
        const res = await oauthCal.events.list(params)
        for (const ev of res.data.items ?? []) {
          events.push({
            event: ev,
            calendarId: cal.calendarId,
            calendarName: cal.name,
            accountEmail: account.googleEmail,
            tokenId: account.id,
            color: cal.color ?? undefined,
          })
        }
      } catch (e) {
        warnings.push(`Google (${account.googleEmail}) "${cal.name}": ${String(e).slice(0, 100)}`)
      }
    }
  }

  return { events, warnings }
}
