'use client'
import { useState, useEffect, useMemo } from 'react'
import { format, addDays, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths, isAfter, isBefore } from 'date-fns'

interface Template {
  id: string
  name: string
  duration_minutes: number
  custom_fields: { label: string; type: string; required: boolean }[]
}

interface TimeSlot {
  start: string
  end: string
}

type Step = 'template' | 'pick' | 'form' | 'done'

interface Props {
  token: string
  templates: Template[]
  title?: string
  maxDays?: number
  onBack: () => void
}

export default function BookingPage({ token, templates, title, maxDays = 60, onBack }: Props) {
  const [step, setStep] = useState<Step>(templates.length === 1 ? 'pick' : 'template')
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(templates.length === 1 ? templates[0] : null)
  const [slots, setSlots] = useState<Record<string, TimeSlot[]>>({})
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [bookerEmail, setBookerEmail] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [error, setError] = useState<string | null>(null)
  const [confirmData, setConfirmData] = useState<{ cancelToken: string; emailError?: string | null } | null>(null)

  const browserTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const [timezone] = useState(browserTz)

  const dateRange = useMemo(() => {
    const today = new Date()
    const from = format(today, 'yyyy-MM-dd')
    const to = format(addDays(today, maxDays), 'yyyy-MM-dd')
    return { from, to }
  }, [maxDays])

  useEffect(() => {
    if (!selectedTemplate) return
    setSlotsLoading(true)
    setSlots({})
    fetch(`/api/share/${token}/availability?templateId=${selectedTemplate.id}&dateFrom=${dateRange.from}&dateTo=${dateRange.to}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setSlots(data.slots ?? {})
      })
      .catch(e => setError(String(e)))
      .finally(() => setSlotsLoading(false))
  }, [selectedTemplate, token, dateRange])

  const availableDates = useMemo(() => Object.keys(slots).sort(), [slots])

  useEffect(() => {
    if (availableDates.length > 0) {
      const firstDate = parseISO(availableDates[0])
      if (!isSameMonth(firstDate, calendarMonth)) {
        setCalendarMonth(startOfMonth(firstDate))
      }
    }
  }, [availableDates]) // eslint-disable-line react-hooks/exhaustive-deps

  function selectTemplate(t: Template) {
    setSelectedTemplate(t)
    setFieldValues({})
    setStep('pick')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTemplate || !selectedDate || !selectedSlot || !bookerEmail) return

    for (const field of selectedTemplate.custom_fields) {
      if (field.required && !fieldValues[field.label]?.trim()) {
        setError(`"${field.label}" is required`)
        return
      }
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/share/${token}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          date: selectedDate,
          time: selectedSlot.start,
          bookerEmail,
          fieldValues,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`)
        if (res.status === 409) {
          setSelectedSlot(null)
        }
        return
      }
      setConfirmData({ cancelToken: data.cancelToken ?? data.booking?.cancel_token, emailError: data.emailError ?? null })
      setStep('done')
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = title || 'Book a meeting'
  const durationLabel = selectedTemplate ? `${selectedTemplate.duration_minutes} min` : ''
  const currentStepLabel = step === 'template' ? 'Choose meeting type'
    : step === 'pick' ? 'Step 1 of 2'
    : step === 'form' ? 'Step 2 of 2'
    : 'Booked'

  return (
    <div className="booking-shell" data-theme="dark">
      <aside className="booking-side">
        <div className="bracket" />
        <div className="bracket cyan" />
        <div className="b-brand">
          <span className="b-brand-b">herbe<span className="dot-r">.</span></span>
          <span style={{ fontSize: 10, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: 10 }}>calendar</span>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <div className="b-eyebrow">{selectedTemplate ? `Book a meeting · ${durationLabel}` : 'Book a meeting'}</div>
          <h1>{pageTitle}</h1>
          {selectedTemplate && (
            <p className="b-desc">
              Pick a date and time that works for you. You'll get a calendar invitation with the meeting link once confirmed.
            </p>
          )}

          <div className="b-meta-list">
            {selectedTemplate && (
              <div className="ml-row">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {selectedTemplate.duration_minutes} minutes
              </div>
            )}
            <div className="ml-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {timezone}
            </div>
          </div>

          <div className="b-foot">Powered by herbe.calendar</div>
        </div>
      </aside>

      <main className="booking-main">
        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 text-red-500 text-xs font-bold">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-400">×</button>
          </div>
        )}

        {step === 'template' && (
          <div>
            <div className="step-head">{currentStepLabel}</div>
            <h2>Select a meeting type</h2>
            <div className="space-y-2">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t)}
                  className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  <p className="text-sm font-bold">{t.name}</p>
                  <p className="text-xs text-text-muted">{t.duration_minutes} minutes</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'pick' && selectedTemplate && (
          <div>
            <div className="step-head">{currentStepLabel}</div>
            <h2>Pick a date &amp; time</h2>
            {slotsLoading ? (
              <p className="text-center text-text-muted text-sm py-8 animate-pulse">Loading availability…</p>
            ) : (
              <div className="b-dates">
                <div className="b-month">
                  <div className="b-month-nav">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setCalendarMonth(m => subMonths(m, 1))}
                      disabled={isSameMonth(calendarMonth, new Date())}
                      aria-label="Previous month"
                    >‹</button>
                    <span>{format(calendarMonth, 'MMMM yyyy')}</span>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setCalendarMonth(m => addMonths(m, 1))}
                      disabled={isAfter(startOfMonth(addMonths(calendarMonth, 1)), parseISO(dateRange.to))}
                      aria-label="Next month"
                    >›</button>
                  </div>
                  <div className="b-month-grid">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                      <div key={i} className="d-h">{d}</div>
                    ))}
                    {(() => {
                      const monthStart = startOfMonth(calendarMonth)
                      const monthEnd = endOfMonth(calendarMonth)
                      const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
                      const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
                      const today = new Date()
                      const cells: React.ReactElement[] = []
                      let day = gridStart
                      while (day <= gridEnd) {
                        const dateStr = format(day, 'yyyy-MM-dd')
                        const inMonth = isSameMonth(day, calendarMonth)
                        const isPast = isBefore(day, today) && !isSameDay(day, today)
                        const hasSlots = availableDates.includes(dateStr)
                        const isToday = isSameDay(day, today)
                        const isSel = selectedDate === dateStr
                        const avail = hasSlots && !isPast && inMonth
                        const cls = [
                          'd-c',
                          avail ? 'avail' : 'dis',
                          isSel && 'sel',
                          isToday && 'today',
                        ].filter(Boolean).join(' ')
                        const d = day
                        cells.push(
                          <div
                            key={dateStr}
                            role="button"
                            tabIndex={avail ? 0 : -1}
                            aria-disabled={!avail}
                            className={cls}
                            onClick={() => { if (avail) { setSelectedDate(dateStr); setSelectedSlot(null) } }}
                            onKeyDown={e => {
                              if (!avail) return
                              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDate(dateStr); setSelectedSlot(null) }
                            }}
                          >
                            {format(d, 'd')}
                          </div>
                        )
                        day = addDays(day, 1)
                      }
                      return cells
                    })()}
                  </div>
                  {availableDates.length === 0 && !slotsLoading && (
                    <p className="text-center text-text-muted text-xs mt-4">No available dates in the next {maxDays} days.</p>
                  )}
                </div>

                <div className="b-slots">
                  <div className="b-slots-head">
                    {selectedDate
                      ? format(parseISO(selectedDate), 'EEEE, d MMMM')
                      : 'Select a date first'}
                  </div>
                  {selectedDate && (
                    <div className="b-slot-grid">
                      {(slots[selectedDate] ?? []).map(slot => (
                        <button
                          key={slot.start}
                          className={`b-slot ${selectedSlot?.start === slot.start ? 'sel' : ''}`}
                          onClick={() => setSelectedSlot(slot)}
                        >
                          {slot.start}
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedDate && selectedSlot && (
                    <div style={{ marginTop: 24 }}>
                      <button
                        className="btn btn-primary btn-lg"
                        onClick={() => setStep('form')}
                      >
                        Continue →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'form' && selectedTemplate && selectedDate && selectedSlot && (
          <div>
            <div className="step-head">{currentStepLabel}</div>
            <h2>Your details</h2>

            <div className="b-conf-box">
              <div className="conf-time">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                {format(parseISO(selectedDate), 'EEE, d MMM')} · {selectedSlot.start}–{selectedSlot.end}
              </div>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('pick')}>Change</button>
            </div>

            <form className="b-form" onSubmit={handleSubmit}>
              <div className="frow">
                <label>Your email *</label>
                <input
                  type="email"
                  className="input"
                  placeholder="you@company.com"
                  value={bookerEmail}
                  onChange={e => setBookerEmail(e.target.value)}
                  required
                />
              </div>
              {selectedTemplate.custom_fields.map(field => (
                <div key={field.label} className="frow">
                  <label>{field.label} {field.required && '*'}</label>
                  <input
                    type={field.type}
                    className="input"
                    value={fieldValues[field.label] ?? ''}
                    onChange={e => setFieldValues(v => ({ ...v, [field.label]: e.target.value }))}
                    required={field.required}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button type="button" className="btn btn-outline btn-lg" onClick={() => setStep('pick')}>Back</button>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={submitting || !bookerEmail}
                >
                  {submitting ? 'Booking…' : 'Confirm booking'}
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 'done' && selectedTemplate && selectedDate && selectedSlot && (
          <div className="b-confirmed">
            <div className="big-check">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div className="step-head">Booked</div>
            <h2>Your meeting is confirmed</h2>
            <p className="conf-desc">
              A confirmation has been sent to <strong style={{ color: 'var(--app-fg)' }}>{bookerEmail}</strong>.
            </p>

            <div className="b-conf-card">
              <div className="row"><div className="k">Meeting</div><div className="v">{selectedTemplate.name}</div></div>
              <div className="row"><div className="k">When</div><div className="v">{format(parseISO(selectedDate), 'EEEE, d MMMM yyyy')} · {selectedSlot.start}–{selectedSlot.end}</div></div>
              <div className="row"><div className="k">Duration</div><div className="v">{selectedTemplate.duration_minutes} minutes</div></div>
              <div className="row"><div className="k">Timezone</div><div className="v">{timezone}</div></div>
            </div>

            {confirmData?.emailError && (
              <p className="text-[11px] text-amber-500">
                Note: confirmation email could not be sent. Save this page for your records.
              </p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-lg" onClick={onBack}>Book another</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
