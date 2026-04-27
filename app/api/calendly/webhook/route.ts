import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { pool } from '@/lib/db'
import { findConnectionByUserUri, getTemplateForEventType, claimWebhookEvent, updateWebhookStatus } from '@/lib/calendly/client'
import { executeBooking } from '@/lib/bookingExecutor'
import { bucketDateInTz, formatInTz } from '@/lib/timezone'
import { getMemberTimezone } from '@/lib/accountTimezone'
import type { TemplateTargets } from '@/types'

function verifySignature(body: string, signature: string, key: string): boolean {
  // Calendly sends: t=timestamp,v1=signature
  const parts = signature.split(',')
  const tPart = parts.find(p => p.startsWith('t='))
  const vPart = parts.find(p => p.startsWith('v1='))
  if (!tPart || !vPart) return false
  const timestamp = tPart.slice(2)
  const sig = vPart.slice(3)
  const payload = `${timestamp}.${body}`
  const expected = createHmac('sha256', key).update(payload).digest('hex')
  if (sig.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('Calendly-Webhook-Signature') ?? ''

  let payload: any
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Log top-level structure for debugging
  console.log('[calendly/webhook] event:', payload.event, 'top keys:', Object.keys(payload), 'payload keys:', Object.keys(payload.payload ?? {}))

  // Only handle invitee.created
  if (payload.event !== 'invitee.created') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  // Extract only the minimum fields needed to look up the connection.
  // No further payload data is processed until AFTER signature verification.
  const inner = payload.payload ?? {}
  const scheduledEvent = inner.scheduled_event
  const userUri = scheduledEvent?.event_memberships?.[0]?.user

  if (!userUri) {
    console.warn('[calendly/webhook] No user URI in event memberships')
    return NextResponse.json({ ok: true })
  }

  // Find connection (needed for signing key)
  const connection = await findConnectionByUserUri(userUri)
  if (!connection) {
    // Silent ignore — not our user
    return NextResponse.json({ ok: true })
  }

  // IMMEDIATELY verify signature before any further payload processing
  if (!verifySignature(body, signature, connection.signingKey)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // NOW safe to extract the rest of the payload
  // The invitee info may be at payload level (email, name) or in a nested invitee object
  const invitee = inner.invitee ?? { email: inner.email, name: inner.name, questions_and_answers: inner.questions_and_answers }
  const eventTypeUri = inner.event_type ?? scheduledEvent?.event_type
  const eventUri = inner.uri ?? scheduledEvent?.uri

  if (!scheduledEvent || !eventUri) {
    console.warn('[calendly/webhook] Missing payload fields:', JSON.stringify({ hasScheduledEvent: !!scheduledEvent, hasEventUri: !!eventUri, innerKeys: Object.keys(inner), scheduledEventKeys: Object.keys(scheduledEvent ?? {}) }))
    return NextResponse.json({ error: 'Missing payload fields' }, { status: 400 })
  }

  // Find template
  const templateId = await getTemplateForEventType(connection.id, eventTypeUri ?? '', connection.defaultTemplateId)

  // Atomic dedup — claim this event (fails if already claimed by another request)
  const claimed = await claimWebhookEvent(eventUri, connection.id, templateId)
  if (!claimed) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // Load template
  const { rows: templateRows } = await pool.query(
    'SELECT id, name, duration_minutes, targets, allow_holidays FROM booking_templates WHERE id = $1',
    [templateId]
  )
  if (templateRows.length === 0) {
    await updateWebhookStatus(eventUri, 'failed', 'Template not found')
    return NextResponse.json({ ok: true })
  }
  const template = templateRows[0]

  // Extract booking info — convert booker's wall clock (start_time has offset)
  // to the host's TZ so the entry lands at the correct local time on the host's calendar.
  const startInstant = new Date(scheduledEvent.start_time)
  const hostTz = await getMemberTimezone(connection.accountId, connection.userEmail)
  const date = bucketDateInTz(startInstant, hostTz)
  const time = formatInTz(startInstant, hostTz, { hour: '2-digit', minute: '2-digit', hour12: false })
  const bookerEmail = invitee.email ?? ''
  const bookerName = invitee.name ?? ''

  // Map Calendly answers to field values (best-effort by question name)
  const fieldValues: Record<string, string> = {}
  const answers = invitee.questions_and_answers ?? []
  for (const qa of answers) {
    fieldValues[qa.question ?? ''] = qa.answer ?? ''
  }

  // Build description with all invitee info
  const descParts = [`Calendly booking by ${bookerName} (${bookerEmail})`]
  descParts.push(`Event: ${scheduledEvent.name ?? template.name}`)
  for (const qa of answers) {
    descParts.push(`${qa.question}: ${qa.answer}`)
  }
  fieldValues['_calendly_description'] = descParts.join('\n')

  // Person code stored at connection time from the user's session
  const personCodes = connection.personCode ? [connection.personCode] : []
  if (personCodes.length === 0) {
    console.warn(`[calendly/webhook] No person code for connection ${connection.id}`)
  }

  try {
    await executeBooking({
      template: {
        id: template.id,
        name: template.name,
        duration_minutes: template.duration_minutes,
        targets: template.targets as TemplateTargets,
        allow_holidays: template.allow_holidays,
      },
      date,
      time,
      bookerEmail,
      bookerName,
      fieldValues,
      personCodes,
      ownerEmail: connection.userEmail,
      accountId: connection.accountId,
    })

    await updateWebhookStatus(eventUri, 'processed')
    return NextResponse.json({ ok: true })
  } catch (e) {
    await updateWebhookStatus(eventUri, 'failed', String(e))
    console.error('[calendly/webhook] Booking execution failed:', String(e))
    return NextResponse.json({ ok: true }) // Return 200 to prevent Calendly retries
  }
}
