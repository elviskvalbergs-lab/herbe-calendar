import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { herbeWebExcellentDelete } from '@/lib/herbe/client'
import { graphFetch } from '@/lib/graph/client'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { getGoogleConfig, getCalendarClient } from '@/lib/google/client'
import { emailForCode } from '@/lib/emailForCode'
import { getSmtpConfig, sendMailSmtp } from '@/lib/smtp'
import { buildBookingEmail } from '@/lib/bookingEmail'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cancelToken: string }> }
) {
  const { cancelToken } = await params

  const { rows } = await pool.query(
    `SELECT b.*, t.name AS template_name, t.duration_minutes, t.custom_fields
     FROM bookings b
     JOIN booking_templates t ON t.id = b.template_id
     WHERE b.cancel_token = $1`,
    [cancelToken]
  )

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  return NextResponse.json(rows[0])
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ cancelToken: string }> }
) {
  const { cancelToken } = await params

  // Fetch booking with all related data
  const { rows } = await pool.query(
    `SELECT b.*, t.name AS template_name, t.duration_minutes,
            f.person_codes AS "personCodes", f.user_email AS "ownerEmail", f.account_id AS "accountId"
     FROM bookings b
     JOIN booking_templates t ON t.id = b.template_id
     JOIN favorite_share_links sl ON sl.id = b.share_link_id
     JOIN user_favorites f ON f.id = sl.favorite_id
     WHERE b.cancel_token = $1 AND b.status = 'confirmed'`,
    [cancelToken]
  )

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'Booking not found or already cancelled' },
      { status: 404 }
    )
  }

  const booking = rows[0]
  const { accountId, ownerEmail } = booking

  // 1. Cancel ERP activities
  const erpIds: { connectionId: string; activityId: string }[] =
    booking.created_erp_ids ?? []
  if (erpIds.length > 0) {
    try {
      const connections = await getErpConnections(accountId)
      for (const { connectionId, activityId } of erpIds) {
        const conn = connections.find((c) => c.id === connectionId)
        if (!conn) {
          console.warn(
            `[booking-cancel] ERP connection ${connectionId} not found, skipping`
          )
          continue
        }
        try {
          await herbeWebExcellentDelete('ActVc', activityId, '', conn)
        } catch (e) {
          console.warn(
            `[booking-cancel] Failed to delete ERP activity ${activityId}:`,
            String(e)
          )
        }
      }
    } catch (e) {
      console.warn(
        '[booking-cancel] Failed to fetch ERP connections:',
        String(e)
      )
    }
  }

  // 2. Cancel Outlook event
  if (booking.created_outlook_id) {
    try {
      const azureConfig = await getAzureConfig(accountId)
      if (azureConfig) {
        await graphFetch(
          `/users/${ownerEmail}/events/${booking.created_outlook_id}`,
          { method: 'DELETE' },
          azureConfig
        )
      }
    } catch (e) {
      console.warn(
        '[booking-cancel] Failed to delete Outlook event:',
        String(e)
      )
    }
  }

  // 3. Cancel Google event
  if (booking.created_google_id) {
    try {
      const googleConfig = await getGoogleConfig(accountId)
      if (googleConfig) {
        const calendar = getCalendarClient(googleConfig, ownerEmail)
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: booking.created_google_id,
        })
      }
    } catch (e) {
      console.warn(
        '[booking-cancel] Failed to delete Google event:',
        String(e)
      )
    }
  }

  // 4. Update booking status
  await pool.query(
    `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
    [booking.id]
  )

  // 5. Send cancellation email
  try {
    const personCodes: string[] = booking.personCodes ?? []
    const participantEmails: string[] = []
    for (const code of personCodes) {
      const email = await emailForCode(code, accountId)
      if (email) participantEmails.push(email)
    }

    const startTime = new Date(booking.start_time)
    const emailData = buildBookingEmail({
      templateName: booking.template_name,
      date: startTime.toISOString().slice(0, 10),
      time: startTime.toISOString().slice(11, 16),
      duration: booking.duration_minutes,
      bookerEmail: booking.booker_email,
      participants: participantEmails,
      fieldValues: booking.field_values ?? {},
      cancelUrl: '',
      status: 'cancelled',
    })

    const smtpConfig = await getSmtpConfig(accountId)
    if (smtpConfig) {
      const allRecipients = [
        booking.booker_email,
        ...participantEmails,
      ].filter(Boolean)
      for (const to of allRecipients) {
        try {
          await sendMailSmtp(smtpConfig, to, emailData.subject, emailData.html)
        } catch (e) {
          console.warn(
            `[booking-cancel] Failed to send cancellation email to ${to}:`,
            String(e)
          )
        }
      }
    }
  } catch (e) {
    console.warn(
      '[booking-cancel] Failed to send cancellation emails:',
      String(e)
    )
  }

  return NextResponse.json({ ok: true, status: 'cancelled' })
}
