import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import {
  verifyPat,
  fetchEventTypes,
  createWebhook,
  saveCalendlyConnection,
  disconnectCalendly,
  getCalendlyConnection,
} from '@/lib/calendly/client'

/** GET: Get current Calendly connection status */
export async function GET() {
  let session
  try { session = await requireSession() } catch { return unauthorized() }
  const connection = await getCalendlyConnection(session.email, session.accountId)
  return NextResponse.json(connection)
}

/** POST: Connect Calendly */
export async function POST(req: NextRequest) {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const { pat, defaultTemplateId } = await req.json()
  if (!pat || typeof pat !== 'string' || !defaultTemplateId) {
    return NextResponse.json({ error: 'pat and defaultTemplateId required' }, { status: 400 })
  }

  try {
    const userInfo = await verifyPat(pat)
    const eventTypes = await fetchEventTypes(pat, userInfo.uri)

    const callbackUrl = `${(process.env.NEXTAUTH_URL ?? 'https://herbe-calendar.vercel.app').replace(/\/$/, '')}/api/calendly/webhook`
    const { webhookUri, signingKey } = await createWebhook(pat, userInfo.orgUri, userInfo.uri, callbackUrl)

    await saveCalendlyConnection({
      userEmail: session.email,
      accountId: session.accountId,
      personCode: session.userCode,
      pat,
      userInfo,
      webhookUri,
      signingKey,
      defaultTemplateId,
      eventTypes,
    })

    const connection = await getCalendlyConnection(session.email, session.accountId)
    return NextResponse.json(connection, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
}

/** DELETE: Disconnect Calendly */
export async function DELETE() {
  let session
  try { session = await requireSession() } catch { return unauthorized() }
  await disconnectCalendly(session.email, session.accountId)
  return NextResponse.json({ ok: true })
}
