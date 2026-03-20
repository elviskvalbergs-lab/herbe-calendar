import { NextRequest, NextResponse } from 'next/server'
import { herbeFetch, herbeFetchById } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

// Debug endpoint: shows raw Herbe POST error response and raw record fields
// GET /api/debug-herbe-post?id=887988  — shows raw fields for a specific activity
// POST /api/debug-herbe-post  — attempts a POST with a minimal bad payload and returns raw Herbe response
export async function GET(req: NextRequest) {
  try { await requireSession() } catch { return unauthorized() }

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id param required' }, { status: 400 })

  const res = await herbeFetchById(REGISTERS.activities, id)
  const json = await res.json().catch(() => null)
  const record = json?.data?.[REGISTERS.activities]?.[0] ?? json
  return NextResponse.json({ status: res.status, raw: record }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  try { await requireSession() } catch { return unauthorized() }

  // Read optional body; default to a minimal payload that should trigger a validation error
  const body = await req.json().catch(() => ({}))
  const formBody = Object.entries(body)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `set_field.${k}=${encodeURIComponent(String(v))}`)
    .join('&')

  const res = await herbeFetch(REGISTERS.activities, undefined, {
    method: 'POST',
    body: formBody,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
  })
  const text = await res.text()
  let parsed: unknown = null
  try { parsed = JSON.parse(text) } catch {}
  return NextResponse.json({
    herbeStatus: res.status,
    rawText: text.slice(0, 2000),
    parsed,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
