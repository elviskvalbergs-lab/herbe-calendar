import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { herbeFetchById } from '@/lib/herbe/client'
import { graphFetch, sendMail as sendMailGraph } from '@/lib/graph/client'
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
    `SELECT b.*, t.name AS template_name, t.duration_minutes, t.custom_fields, sl.token AS share_token
     FROM bookings b
     JOIN booking_templates t ON t.id = b.template_id
     JOIN favorite_share_links sl ON sl.id = b.share_link_id
     WHERE b.cancel_token = $1`,
    [cancelToken]
  )

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  return NextResponse.json(rows[0])
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ cancelToken: string }> }
) {
  const { cancelToken } = await params

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
    return NextResponse.json({ error: 'Booking not found or already cancelled' }, { status: 404 })
  }

  const booking = rows[0]
  const accountId: string = booking.accountId
  const ownerEmail: string = booking.ownerEmail

  // 1. ERP activities — convert to Task (TodoFlag=1) to keep CRM records but free the time slot
  const erpIds: { connectionId: string; serNr: string }[] = booking.created_erp_ids ?? []
  if (erpIds.length > 0) {
    try {
      const connections = await getErpConnections(accountId)
      for (const { connectionId, serNr } of erpIds) {
        const conn = connections.find(c => c.id === connectionId)
        if (!conn) {
          console.warn(`[booking-cancel] ERP connection ${connectionId} not found`)
          continue
        }
        try {
          // Update activity: set TodoFlag=1 (Task) to keep record but free calendar slot
          const res = await herbeFetchById('ActVc', serNr, {
            method: 'PATCH',
            body: `set_field.TodoFlag=1&set_field.Comment=${encodeURIComponent('[CANCELLED] ' + booking.template_name)}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          }, conn)
          console.log(`[booking-cancel] ERP PATCH ActVc/${serNr} → ${res.status}`)
        } catch (e) {
          console.warn(`[booking-cancel] Failed to update ERP activity ${serNr}:`, String(e))
        }
      }
    } catch (e) {
      console.warn('[booking-cancel] ERP connections lookup failed:', String(e))
    }
  }

  // 2. Outlook event — delete
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
      console.warn('[booking-cancel] Outlook delete failed:', String(e))
    }
  }

  // 3. Google event — delete
  if (booking.created_google_id) {
    try {
      const googleConfig = await getGoogleConfig(accountId)
      if (googleConfig) {
        const calendar = getCalendarClient(googleConfig, ownerEmail)
        await calendar.events.delete({ calendarId: 'primary', eventId: booking.created_google_id })
      }
    } catch (e) {
      console.warn('[booking-cancel] Google delete failed:', String(e))
    }
  }

  // 4. Update booking status
  await pool.query('UPDATE bookings SET status = $1 WHERE id = $2', ['cancelled', booking.id])

  // 5. Send cancellation emails
  try {
    const personCodes: string[] = booking.personCodes ?? []
    const participantEmails: string[] = []
    for (const code of personCodes) {
      const email = await emailForCode(code, accountId)
      if (email) participantEmails.push(email)
    }

    const bookedDate = typeof booking.booked_date === 'string'
      ? booking.booked_date.slice(0, 10)
      : new Date(booking.booked_date).toISOString().slice(0, 10)
    const bookedTime = typeof booking.booked_time === 'string'
      ? booking.booked_time.slice(0, 5)
      : ''

    const { subject, html } = buildBookingEmail({
      templateName: booking.template_name,
      date: bookedDate,
      time: bookedTime,
      duration: booking.duration_minutes,
      bookerEmail: booking.booker_email,
      participants: participantEmails,
      fieldValues: booking.field_values ?? {},
      cancelUrl: '',
      status: 'cancelled',
    })

    const allRecipients = [...new Set([booking.booker_email, ...participantEmails])].filter(Boolean)

    // Try SMTP first
    let emailSent = false
    const smtpConfig = await getSmtpConfig(accountId)
    if (smtpConfig) {
      try {
        await Promise.all(allRecipients.map(to => sendMailSmtp(smtpConfig, to, subject, html)))
        emailSent = true
      } catch (e) {
        console.warn('[booking-cancel] SMTP failed:', String(e))
      }
    }

    // Fallback to Azure Graph
    if (!emailSent) {
      try {
        const azureConfig = await getAzureConfig(accountId)
        if (azureConfig) {
          await Promise.all(allRecipients.map(to => sendMailGraph(to, subject, html, azureConfig)))
        }
      } catch (e) {
        console.warn('[booking-cancel] Graph sendMail failed:', String(e))
      }
    }
  } catch (e) {
    console.warn('[booking-cancel] Email sending failed:', String(e))
  }

  return NextResponse.json({ ok: true, status: 'cancelled' })
}
