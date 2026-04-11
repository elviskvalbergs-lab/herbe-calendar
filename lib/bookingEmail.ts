export interface BookingEmailData {
  templateName: string
  date: string           // "2026-04-15"
  time: string           // "14:00"
  duration: number       // minutes
  bookerEmail: string
  participants: string[] // person emails
  fieldValues: Record<string, string>
  cancelUrl: string
  status: 'confirmed' | 'cancelled' | 'rescheduled'
  zoomJoinUrl?: string
}

export function buildBookingEmail(data: BookingEmailData): { subject: string; html: string } {
  const statusLabel = data.status === 'confirmed' ? 'Booking Confirmed'
    : data.status === 'cancelled' ? 'Booking Cancelled'
    : 'Booking Rescheduled'

  const fieldRows = Object.entries(data.fieldValues)
    .map(([label, value]) => `<tr><td style="padding:4px 8px;color:#888;">${escapeHtml(label)}</td><td style="padding:4px 8px;">${escapeHtml(value) || '—'}</td></tr>`)
    .join('')

  const subject = `${statusLabel}: ${data.templateName} — ${data.date} ${data.time}`

  const html = `
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
  <h2 style="margin:0 0 16px;">${statusLabel}</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:4px 8px;color:#888;">Meeting</td><td style="padding:4px 8px;font-weight:bold;">${escapeHtml(data.templateName)}</td></tr>
    <tr><td style="padding:4px 8px;color:#888;">Date</td><td style="padding:4px 8px;">${escapeHtml(data.date)}</td></tr>
    <tr><td style="padding:4px 8px;color:#888;">Time</td><td style="padding:4px 8px;">${escapeHtml(data.time)} (${data.duration} min)</td></tr>
    <tr><td style="padding:4px 8px;color:#888;">Booked by</td><td style="padding:4px 8px;">${escapeHtml(data.bookerEmail)}</td></tr>
    <tr><td style="padding:4px 8px;color:#888;">Participants</td><td style="padding:4px 8px;">${data.participants.map(escapeHtml).join(', ')}</td></tr>
    ${fieldRows}
  </table>
  ${data.zoomJoinUrl ? `
  <div style="margin-top:20px;padding-top:16px;border-top:1px solid #eee;">
    <a href="${escapeHtml(data.zoomJoinUrl)}" style="display:inline-block;padding:8px 16px;background:#2D8CFF;color:white;text-decoration:none;border-radius:6px;font-size:13px;font-weight:bold;">Join Zoom Meeting</a>
  </div>` : ''}
  ${data.status !== 'cancelled' ? `
  <div style="margin-top:${data.zoomJoinUrl ? '8' : '20'}px;${data.zoomJoinUrl ? '' : 'padding-top:16px;border-top:1px solid #eee;'}">
    <a href="${escapeHtml(data.cancelUrl)}" style="display:inline-block;padding:8px 16px;background:#dc2626;color:white;text-decoration:none;border-radius:6px;font-size:13px;font-weight:bold;">Cancel / Reschedule</a>
  </div>` : ''}
  <p style="margin-top:20px;font-size:11px;color:#999;">Sent by herbe.calendar</p>
</div>`

  return { subject, html }
}

/** Build structured text for ERP Text field and Outlook/Google description */
export function buildActivityText(
  bookerEmail: string,
  fieldValues: Record<string, string>,
  cancelUrl: string,
  zoomJoinUrl?: string
): string {
  const lines = [`Booked by: ${bookerEmail}`]
  for (const [label, value] of Object.entries(fieldValues)) {
    lines.push(`${label}: ${value || '—'}`)
  }
  if (zoomJoinUrl) {
    lines.push('', `Zoom meeting: ${zoomJoinUrl}`)
  }
  lines.push('', `Cancel/reschedule: ${cancelUrl}`)
  return lines.join('\n')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
