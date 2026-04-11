import { pool } from '@/lib/db'
import { herbeFetch } from '@/lib/herbe/client'
import { graphFetch, sendMail } from '@/lib/graph/client'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { getGoogleConfig, getCalendarClient, buildGoogleMeetConferenceData } from '@/lib/google/client'
import { getSmtpConfig, sendMailSmtp } from '@/lib/smtp'
import { REGISTERS } from '@/lib/herbe/constants'
import { emailForCode } from '@/lib/emailForCode'
import { toMinutes, fromMinutes } from '@/lib/availability'
import { buildBookingEmail, buildActivityText } from '@/lib/bookingEmail'
import type { TemplateTargets } from '@/types'

export interface BookingParams {
  template: {
    id: string
    name: string
    duration_minutes: number
    targets: TemplateTargets
    allow_holidays?: boolean
  }
  date: string
  time: string
  bookerEmail: string
  bookerName?: string
  fieldValues: Record<string, string>
  personCodes: string[]
  ownerEmail: string
  accountId: string
  shareLinkId?: string
}

export interface BookingResult {
  booking: Record<string, unknown>
  cancelUrl: string
  notificationSent: boolean
  notificationFailed?: boolean
}

export async function executeBooking(params: BookingParams): Promise<BookingResult> {
  const {
    template,
    date,
    time,
    bookerEmail,
    fieldValues,
    personCodes,
    ownerEmail,
    accountId,
    shareLinkId,
  } = params

  const templateId = template.id
  const templateName = template.name
  const durationMinutes = template.duration_minutes
  const targets: TemplateTargets = template.targets ?? {}

  // Calculate end time
  const endTime = fromMinutes(toMinutes(time) + durationMinutes)

  // --- 1. Resolve participant emails ---
  const participantEmails: string[] = []
  for (const code of personCodes) {
    const email = await emailForCode(code, accountId)
    if (email) participantEmails.push(email)
  }

  // --- 2. Generate cancel token and cancel URL ---
  const crypto = await import('crypto')
  const cancelToken = crypto.randomBytes(32).toString('hex')

  const origin = (process.env.NEXTAUTH_URL ?? 'https://herbe-calendar.vercel.app').replace(/\/$/, '')
  const cancelUrl = `${origin}/booking/cancel/${cancelToken}`

  // --- 3. Zoom meeting (created before other targets so its URL can appear in activity text) ---
  let zoomJoinUrl: string | undefined
  if (targets.zoom?.enabled) {
    try {
      const { getZoomConfig, createZoomMeeting } = await import('@/lib/zoom/client')
      const zoomConfig = await getZoomConfig(accountId)
      if (zoomConfig) {
        const startIso = `${date}T${time}:00`
        const result = await createZoomMeeting(zoomConfig, templateName, startIso, durationMinutes)
        zoomJoinUrl = result.joinUrl
      }
    } catch (e) {
      console.warn('[book] Zoom meeting creation failed:', String(e))
    }
  }

  const activityText = buildActivityText(bookerEmail, fieldValues ?? {}, cancelUrl, zoomJoinUrl)

  // --- 4. Create activities in configured targets ---
  const createdErpIds: { connectionId: string; serNr: string }[] = []
  let createdOutlookId: string | null = null
  let createdGoogleId: string | null = null

  // ERP targets
  if (targets.erp?.length) {
    const allConns = await getErpConnections(accountId)
    for (const erpTarget of targets.erp) {
      const conn = allConns.find(c => c.id === erpTarget.connectionId)
      if (!conn) {
        console.error(`[book] ERP connection ${erpTarget.connectionId} not found, skipping`)
        continue
      }

      try {
        const formParts: string[] = [
          `set_field.TransDate=${date}`,
          `set_field.StartTime=${time}:00`,
          `set_field.EndTime=${endTime}:00`,
          `set_field.Comment=${encodeURIComponent(templateName + ' - ' + bookerEmail)}`,
          `set_field.MainPersons=${personCodes.join(',')}`,
        ]

        if (erpTarget.fields) {
          for (const [field, value] of Object.entries(erpTarget.fields)) {
            formParts.push(`set_field.${field}=${encodeURIComponent(value)}`)
          }
        }

        // Sanitize control characters and split into 100-char rows for ERP
        const sanitized = activityText.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim()
        const textRows: string[] = []
        for (let i = 0; i < sanitized.length; i += 100) {
          textRows.push(sanitized.slice(i, i + 100))
        }
        for (let r = 0; r < textRows.length; r++) {
          formParts.push(`set_row_field.${r}.Text=${encodeURIComponent(textRows[r])}`)
        }

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
        // Use the first participant's email for domain-wide delegation (not login email which may differ)
      const calendarUserEmail = participantEmails[0] ?? ownerEmail
      const calendar = getCalendarClient(googleConfig, calendarUserEmail)
        const allEmails = [...participantEmails, bookerEmail]

        const requestBody: Record<string, unknown> = {
          summary: `${templateName} - ${bookerEmail}`,
          description: activityText,
          start: { dateTime: `${date}T${time}:00`, timeZone: 'Europe/Riga' },
          end: { dateTime: `${date}T${endTime}:00`, timeZone: 'Europe/Riga' },
          attendees: allEmails.map(e => ({ email: e })),
        }

        if (targets.google.onlineMeeting) {
          requestBody.conferenceData = buildGoogleMeetConferenceData(cancelToken)
        }

        const res = await calendar.events.insert({
          calendarId: 'primary',
          conferenceDataVersion: targets.google.onlineMeeting ? 1 : 0,
          requestBody,
        })

        createdGoogleId = res.data.id ?? null
      }
    } catch (e) {
      console.error('[book] Google event create error:', String(e))
    }
  }

  // --- 5. Insert booking record ---
  const { rows: bookingRows } = await pool.query(
    `INSERT INTO bookings
       (account_id, template_id, share_link_id, booker_email, booked_date, booked_time,
        duration_minutes, field_values, cancel_token, created_erp_ids, created_outlook_id, created_google_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      accountId,
      templateId,
      shareLinkId ?? null,
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

  // --- 6. Send notification emails ---
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
    ...(zoomJoinUrl ? { zoomJoinUrl } : {}),
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

  return {
    booking,
    cancelUrl,
    notificationSent,
    ...(emailError ? { notificationFailed: true } : {}),
  }
}
