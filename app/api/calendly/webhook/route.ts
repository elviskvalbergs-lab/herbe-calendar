import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { pool } from '@/lib/db'
import { findConnectionByUserUri, getTemplateForEventType, isWebhookProcessed, logWebhook } from '@/lib/calendly/client'
import { executeBooking } from '@/lib/bookingExecutor'
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
  return sig === expected
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

  const inner = payload.payload ?? {}
  // Calendly v2 webhook: payload contains the invitee data directly
  // scheduled_event is nested inside payload
  const scheduledEvent = inner.scheduled_event
  // The invitee info may be at payload level (email, name) or in a nested invitee object
  const invitee = inner.invitee ?? { email: inner.email, name: inner.name, questions_and_answers: inner.questions_and_answers }
  const eventTypeUri = inner.event_type ?? scheduledEvent?.event_type
  const eventUri = inner.uri ?? scheduledEvent?.uri

  if (!scheduledEvent || !eventUri) {
    console.warn('[calendly/webhook] Missing payload fields:', JSON.stringify({ hasScheduledEvent: !!scheduledEvent, hasEventUri: !!eventUri, innerKeys: Object.keys(inner), scheduledEventKeys: Object.keys(scheduledEvent ?? {}) }))
    return NextResponse.json({ error: 'Missing payload fields' }, { status: 400 })
  }

  // Find user by event membership
  const userUri = scheduledEvent.event_memberships?.[0]?.user
  if (!userUri) {
    console.warn('[calendly/webhook] No user URI in event memberships')
    return NextResponse.json({ ok: true })
  }

  const connection = await findConnectionByUserUri(userUri)
  if (!connection) {
    console.warn(`[calendly/webhook] No connection found for user ${userUri}`)
    return NextResponse.json({ ok: true })
  }

  // Verify HMAC signature
  if (!verifySignature(body, signature, connection.signingKey)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Dedup check
  if (await isWebhookProcessed(eventUri)) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // Find template
  const templateId = await getTemplateForEventType(connection.id, eventTypeUri ?? '', connection.defaultTemplateId)

  // Load template
  const { rows: templateRows } = await pool.query(
    'SELECT id, name, duration_minutes, targets, allow_holidays FROM booking_templates WHERE id = $1',
    [templateId]
  )
  if (templateRows.length === 0) {
    await logWebhook(eventUri, connection.id, templateId, 'failed', 'Template not found')
    return NextResponse.json({ ok: true })
  }
  const template = templateRows[0]

  // Extract booking info
  const startTime = scheduledEvent.start_time // ISO 8601
  const date = startTime.slice(0, 10)
  const time = startTime.slice(11, 16)
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

  // Resolve person code for the connection owner.
  // Try direct email match first, then try matching any person code in the account
  // whose email domain matches, or fall back to the first person code for this account.
  let personCodes: string[] = []
  const { rows: directMatch } = await pool.query(
    'SELECT generated_code FROM person_codes WHERE LOWER(email) = LOWER($1) AND account_id = $2 LIMIT 1',
    [connection.userEmail, connection.accountId]
  )
  if (directMatch.length > 0) {
    personCodes = [directMatch[0].generated_code]
  } else {
    // Login email may differ from person_codes email — try matching by name prefix
    const loginPrefix = connection.userEmail.split('@')[0].toLowerCase()
    const { rows: fuzzyMatch } = await pool.query(
      `SELECT generated_code FROM person_codes
       WHERE account_id = $1 AND LOWER(email) LIKE $2 || '%'
       LIMIT 1`,
      [connection.accountId, loginPrefix]
    )
    if (fuzzyMatch.length > 0) {
      personCodes = [fuzzyMatch[0].generated_code]
    }
  }
  if (personCodes.length === 0) {
    console.warn(`[calendly/webhook] No person code found for ${connection.userEmail} in account ${connection.accountId}`)
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

    await logWebhook(eventUri, connection.id, templateId, 'processed')
    return NextResponse.json({ ok: true })
  } catch (e) {
    await logWebhook(eventUri, connection.id, templateId, 'failed', String(e))
    console.error('[calendly/webhook] Booking execution failed:', String(e))
    return NextResponse.json({ ok: true }) // Return 200 to prevent Calendly retries
  }
}
