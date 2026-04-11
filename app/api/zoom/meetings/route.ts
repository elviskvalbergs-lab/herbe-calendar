import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getZoomConfig, createZoomMeeting } from '@/lib/zoom/client'

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const zoomConfig = await getZoomConfig(session.accountId)
  if (!zoomConfig) {
    return NextResponse.json({ error: 'Zoom not configured' }, { status: 400 })
  }

  const { topic, startTime, duration } = await req.json()
  if (!topic || !startTime || !duration) {
    return NextResponse.json({ error: 'topic, startTime, and duration required' }, { status: 400 })
  }

  try {
    const result = await createZoomMeeting(zoomConfig, topic, startTime, duration)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[zoom/meetings] creation failed:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
