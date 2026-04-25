/**
 * Temporary debug log for ERP activity saves. Receives a JSON blob describing
 * the request/response and appends it to /tmp/herbe-debug.log so the local
 * dev session can be inspected by an outside reader (e.g. the assistant).
 *
 * Remove this route once the multi-person save bug is identified.
 */
import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

const LOG_PATH = path.join(os.tmpdir(), 'herbe-debug.log')

export async function POST(req: Request) {
  try {
    const body = await req.text()
    const stamp = new Date().toISOString()
    const entry = `\n===== ${stamp} =====\n${body}\n`
    await fs.appendFile(LOG_PATH, entry, 'utf8')
    return NextResponse.json({ ok: true, path: LOG_PATH })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
