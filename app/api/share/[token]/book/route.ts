import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { herbeFetch } from '@/lib/herbe/client'
import { herbeFetchAll } from '@/lib/herbe/client'
import { graphFetch, sendMail } from '@/lib/graph/client'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { getGoogleConfig, getCalendarClient } from '@/lib/google/client'
import { getSmtpConfig, sendMailSmtp } from '@/lib/smtp'
import { REGISTERS } from '@/lib/herbe/constants'
import { emailForCode } from '@/lib/emailForCode'
import { computeAvailableSlots, type BusyBlock } from '@/lib/availability'
import { buildBookingEmail, buildActivityText } from '@/lib/bookingEmail'
import { fetchIcsEvents } from '@/lib/icsParser'
import type { AvailabilityWindow, TemplateTargets } from '@/types'

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'

/** Convert "HH:mm" to total minutes since midnight */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Convert total minutes since midnight to "HH:mm" */
function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Collect busy blocks for all person codes on a given date */
async function collectBusyBlocks(
  personCodes: string[],
  ownerEmail: string,
  accountId: string,
  date: string
): Promise<BusyBlock[]> {
  const busy: BusyBlock[] = []

  // Fetch ERP activities for the date from all connections
  try {
    const connections = await getErpConnections(accountId)
    const personSet = new Set(personCodes)
    for (const conn of connections) {
      try {
        const raw = await herbeFetchAll(REGISTERS.activities, {
          sort: 'TransDate',
          range: `${date}:${date}`,
        }, 100, conn)
        for (const record of raw) {
          const r = record as Record<string, unknown>
          const todoFlag = String(r['TodoFlag'] ?? '0')
          if (todoFlag !== '0' && todoFlag !== '') continue
          const mainPersons = String(r['MainPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
          const ccPersons = String(r['CCPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
          const allPersons = [...mainPersons, ...ccPersons]
          if (allPersons.some(p => personSet.has(p))) {
            const start = String(r['StartTime'] ?? '').slice(0, 5)
            const end = String(r['EndTime'] ?? '').slice(0, 5)
            if (start && end) {
              busy.push({ start, end })
            }
          }
        }
      } catch (e) {
        console.warn(`[book] ERP "${conn.name}" busy fetch failed:`, String(e))
      }
    }
  } catch (e) {
    console.warn('[book] ERP connections lookup failed:', String(e))
  }

  // Fetch Outlook + ICS events per person
  for (const code of personCodes) {
    try {
      const email = await emailForCode(code, accountId)
      if (!email) continue

      // Graph calendar view
      try {
        const azureConfig = await getAzureConfig(accountId)
        if (azureConfig) {
          const startDt = `${date}T00:00:00`
          const endDt = `${date}T23:59:59`
          const res = await graphFetch(
            `/users/${email}/calendarView?startDateTime=${startDt}&endDateTime=${endDt}&$top=100`,
            { headers: { Prefer: 'outlook.timezone="Europe/Riga"' } },
            azureConfig
          )
          if (res.ok) {
            const data = await res.json()
            for (const ev of data.value ?? []) {
              const start = (ev.start as Record<string, string> | undefined)?.dateTime ?? ''
              const end = (ev.end as Record<string, string> | undefined)?.dateTime ?? ''
              const startTime = start.slice(11, 16)
              const endTime = end.slice(11, 16)
              if (startTime && endTime) {
                busy.push({ start: startTime, end: endTime })
              }
            }
          }
        }
      } catch (e) {
        console.warn(`[book] Graph busy fetch failed for ${code}:`, String(e))
      }

      // ICS feeds
      try {
        const { rows: icsRows } = await pool.query(
          'SELECT ics_url FROM user_calendars WHERE user_email = $1 AND target_person_code = $2',
          [ownerEmail, code]
        )
        for (const row of icsRows) {
          try {
            const events = await fetchIcsEvents(row.ics_url as string, code, date, date)
            for (const ev of events) {
              const start = String(ev.timeFrom ?? '')
              const end = String(ev.timeTo ?? '')
              if (start && end) {
                busy.push({ start, end })
              }
            }
          } catch {
            // ICS error swallowing — known issue
          }
        }
      } catch (e) {
        console.warn(`[book] ICS busy fetch failed for ${code}:`, String(e))
      }

      // Google Calendar
      try {
        const googleConfig = await getGoogleConfig(accountId)
        if (googleConfig) {
          const calendar = getCalendarClient(googleConfig, email)
          const res = await calendar.events.list({
            calendarId: 'primary',
            timeMin: `${date}T00:00:00+03:00`,
            timeMax: `${date}T23:59:59+03:00`,
            singleEvents: true,
            maxResults: 100,
          })
          for (const ev of res.data.items ?? []) {
            const startTime = (ev.start?.dateTime ?? '').slice(11, 16)
            const endTime = (ev.end?.dateTime ?? '').slice(11, 16)
            if (startTime && endTime) {
              busy.push({ start: startTime, end: endTime })
            }
          }
        }
      } catch (e) {
        console.warn(`[book] Google busy fetch failed for ${code}:`, String(e))
      }
    } catch (e) {
      console.warn(`[book] Busy fetch failed for ${code}:`, String(e))
    }
  }

  return busy
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Parse request body
  let body: {
    templateId: string
    date: string
    time: string
    bookerEmail: string
    fieldValues: Record<string, string>
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { templateId, date, time, bookerEmail, fieldValues } = body
  if (!templateId || !date || !time || !bookerEmail) {
    return NextResponse.json(
      { error: 'templateId, date, time, and bookerEmail are required' },
      { status: 400 }
    )
  }

  // --- 1. Validate share link ---
  const { rows: linkRows } = await pool.query(
    `SELECT
      sl.id AS share_link_id,
      sl.booking_enabled,
      sl.expires_at,
      sl.password_hash IS NOT NULL AS "hasPassword",
      f.person_codes AS "personCodes",
      f.user_email AS "ownerEmail",
      f.account_id AS "accountId"
    FROM favorite_share_links sl
    JOIN user_favorites f ON f.id = sl.favorite_id
    WHERE sl.token = $1`,
    [token]
  )

  if (linkRows.length === 0) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  const link = linkRows[0]

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  }

  if (!link.booking_enabled) {
    return NextResponse.json({ error: 'Booking not enabled on this link' }, { status: 403 })
  }

  if (link.hasPassword) {
    return NextResponse.json({ error: 'Password-protected links cannot be used for booking' }, { status: 403 })
  }

  const shareLinkId: string = link.share_link_id
  const personCodes: string[] = link.personCodes ?? []
  const ownerEmail: string = link.ownerEmail
  const accountId: string = link.accountId ?? DEFAULT_ACCOUNT_ID

  // --- 2. Verify template is linked to share link ---
  const { rows: templateRows } = await pool.query(
    `SELECT bt.*
     FROM booking_templates bt
     JOIN share_link_templates slt ON slt.template_id = bt.id
     WHERE bt.id = $1 AND slt.share_link_id = $2 AND bt.active = true`,
    [templateId, shareLinkId]
  )

  if (templateRows.length === 0) {
    return NextResponse.json({ error: 'Template not found or not linked to this share link' }, { status: 404 })
  }

  const template = templateRows[0]
  const durationMinutes: number = template.duration_minutes
  const availabilityWindows: AvailabilityWindow[] = template.availability_windows ?? []
  const bufferMinutes: number = template.buffer_minutes ?? 0
  const targets: TemplateTargets = template.targets ?? {}
  const templateName: string = template.name

  // --- 3. Re-check availability ---
  const busy = await collectBusyBlocks(personCodes, ownerEmail, accountId, date)
  const availableSlots = computeAvailableSlots(date, availabilityWindows, busy, durationMinutes, bufferMinutes)

  const slotExists = availableSlots.some(s => s.start === time)
  if (!slotExists) {
    return NextResponse.json(
      { error: 'Requested time slot is no longer available' },
      { status: 409 }
    )
  }

  // Calculate end time
  const endTime = fromMinutes(toMinutes(time) + durationMinutes)

  // --- 4. Resolve participant emails ---
  const participantEmails: string[] = []
  for (const code of personCodes) {
    const email = await emailForCode(code, accountId)
    if (email) participantEmails.push(email)
  }

  // --- 5. Build activity text ---
  // Generate a cancel token early so we can include the cancel URL in activity text
  // We'll use the one generated by the DB, but we need a placeholder bookingId first.
  // Instead, pre-generate a cancel token
  const crypto = await import('crypto')
  const cancelToken = crypto.randomBytes(32).toString('hex')

  const origin = req.headers.get('origin')
    || (req.headers.get('x-forwarded-host')
      ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}`
      : `https://${req.headers.get('host') || 'localhost'}`)
  const cancelUrl = `${origin}/booking/cancel/${cancelToken}`

  const activityText = buildActivityText(bookerEmail, fieldValues ?? {}, cancelUrl)

  // --- 6. Create activities in configured targets ---
  const createdErpIds: { connectionId: string; serNr: string }[] = []
  let createdOutlookId: string | null = null
  let createdGoogleId: string | null = null

  // ERP targets
  if (targets.erp?.length) {
    const allConns = await getErpConnections(accountId)
    for (const erpTarget of targets.erp) {
      const conn = allConns.find(c => c.id === erpTarget.connectionId)
      if (!conn) {
        console.warn(`[book] ERP connection ${erpTarget.connectionId} not found, skipping`)
        continue
      }

      try {
        // Build form body
        const formParts: string[] = [
          `set_field.TransDate=${date}`,
          `set_field.StartTime=${time}:00`,
          `set_field.EndTime=${endTime}:00`,
          `set_field.Comment=${encodeURIComponent(templateName + ' - ' + bookerEmail)}`,
          `set_field.MainPersons=${personCodes.join(',')}`,
        ]

        // Add pre-filled fields from target config
        if (erpTarget.fields) {
          for (const [field, value] of Object.entries(erpTarget.fields)) {
            formParts.push(`set_field.${field}=${encodeURIComponent(value)}`)
          }
        }

        // Add activity text as row text
        formParts.push(`set_row_field.0.Text=${encodeURIComponent(activityText)}`)

        const formBody = formParts.join('&')

        const res = await herbeFetch(REGISTERS.activities, undefined, {
          method: 'POST',
          body: formBody,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
        }, conn)

        if (res.ok) {
          try {
            const data = await res.json()
            console.log('[book] ERP create response:', JSON.stringify(data).slice(0, 500))
            // Response: { data: { ActVc: [{ SerNr: "..." }] } }
            const records = (data?.data?.[REGISTERS.activities] as Record<string, unknown>[] | undefined) ?? []
            const serNr = String(records[0]?.SerNr ?? data?.SerNr ?? '')
            if (serNr) {
              createdErpIds.push({ connectionId: erpTarget.connectionId, serNr })
              console.log(`[book] ERP activity created: SerNr=${serNr}`)
            } else {
              console.warn('[book] ERP activity created but no SerNr in response')
            }
          } catch (parseErr) {
            console.warn('[book] Failed to parse ERP create response:', String(parseErr))
          }
        } else {
          const errText = await res.text().catch(() => '')
          console.warn(`[book] ERP activity create failed: ${res.status} ${errText.slice(0, 200)}`)
        }
      } catch (e) {
        console.warn(`[book] ERP activity create error for ${erpTarget.connectionId}:`, String(e))
      }
    }
  }

  // Outlook target
  if (targets.outlook?.enabled) {
    try {
      const azureConfig = await getAzureConfig(accountId)
      if (azureConfig) {
        const attendees = [...participantEmails, bookerEmail].map(email => ({
          emailAddress: { address: email },
          type: 'required' as const,
        }))

        const eventBody: Record<string, unknown> = {
          subject: `${templateName} - ${bookerEmail}`,
          body: { contentType: 'Text', content: activityText },
          start: { dateTime: `${date}T${time}:00`, timeZone: 'Europe/Riga' },
          end: { dateTime: `${date}T${endTime}:00`, timeZone: 'Europe/Riga' },
          attendees,
        }

        if (targets.outlook.onlineMeeting) {
          eventBody.isOnlineMeeting = true
          eventBody.onlineMeetingProvider = 'teamsForBusiness'
        }

        if (targets.outlook.location) {
          eventBody.location = { displayName: targets.outlook.location }
        }

        const res = await graphFetch(`/users/${ownerEmail}/events`, {
          method: 'POST',
          body: JSON.stringify(eventBody),
        }, azureConfig)

        if (res.ok) {
          const data = await res.json()
          createdOutlookId = data.id ?? null
        } else {
          console.warn(`[book] Outlook event create failed: ${res.status}`)
        }
      }
    } catch (e) {
      console.warn('[book] Outlook event create error:', String(e))
    }
  }

  // Google target
  if (targets.google?.enabled) {
    try {
      const googleConfig = await getGoogleConfig(accountId)
      if (googleConfig) {
        const calendar = getCalendarClient(googleConfig, ownerEmail)
        const allEmails = [...participantEmails, bookerEmail]

        const requestBody: Record<string, unknown> = {
          summary: `${templateName} - ${bookerEmail}`,
          description: activityText,
          start: { dateTime: `${date}T${time}:00`, timeZone: 'Europe/Riga' },
          end: { dateTime: `${date}T${endTime}:00`, timeZone: 'Europe/Riga' },
          attendees: allEmails.map(e => ({ email: e })),
        }

        if (targets.google.onlineMeeting) {
          requestBody.conferenceData = {
            createRequest: { requestId: cancelToken },
          }
        }

        const res = await calendar.events.insert({
          calendarId: 'primary',
          conferenceDataVersion: targets.google.onlineMeeting ? 1 : 0,
          requestBody,
        })

        createdGoogleId = res.data.id ?? null
      }
    } catch (e) {
      console.warn('[book] Google event create error:', String(e))
    }
  }

  // --- 7. Insert booking record ---
  const { rows: bookingRows } = await pool.query(
    `INSERT INTO bookings
       (account_id, template_id, share_link_id, booker_email, booked_date, booked_time,
        duration_minutes, field_values, cancel_token, created_erp_ids, created_outlook_id, created_google_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      accountId,
      templateId,
      shareLinkId,
      bookerEmail,
      date,
      time,
      durationMinutes,
      JSON.stringify(fieldValues ?? {}),
      cancelToken,
      JSON.stringify(createdErpIds),
      createdOutlookId,
      createdGoogleId,
    ]
  )

  const booking = bookingRows[0]

  // --- 8. Send notification emails ---
  const allRecipients = [...new Set([bookerEmail, ...participantEmails])]
  const emailData = {
    templateName,
    date,
    time,
    duration: durationMinutes,
    bookerEmail,
    participants: participantEmails,
    fieldValues: fieldValues ?? {},
    cancelUrl,
    status: 'confirmed' as const,
  }
  const { subject, html } = buildBookingEmail(emailData)

  let notificationSent = false
  let emailError: string | null = null

  // Try SMTP first
  const smtpConfig = await getSmtpConfig(accountId)
  if (smtpConfig) {
    try {
      await Promise.all(
        allRecipients.map(to => sendMailSmtp(smtpConfig, to, subject, html))
      )
      notificationSent = true
    } catch (e) {
      emailError = `SMTP: ${String(e)}`
      console.warn('[book] SMTP send failed:', String(e))
    }
  }

  // Fallback to Azure Graph sendMail
  if (!notificationSent) {
    try {
      const azureConfig = await getAzureConfig(accountId)
      if (azureConfig) {
        await Promise.all(
          allRecipients.map(to => sendMail(to, subject, html, azureConfig))
        )
        notificationSent = true
        emailError = null
      } else if (!smtpConfig) {
        emailError = 'No email transport configured (neither SMTP nor Azure)'
      }
    } catch (e) {
      emailError = `Graph: ${String(e)}`
      console.warn('[book] Graph sendMail failed:', String(e))
    }
  }

  if (notificationSent) {
    await pool.query(
      'UPDATE bookings SET notification_sent = true WHERE id = $1',
      [booking.id]
    )
  }

  // --- 9. Return booking ---
  return NextResponse.json(
    { booking, cancelUrl, notificationSent, ...(emailError ? { emailError } : {}) },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  )
}
