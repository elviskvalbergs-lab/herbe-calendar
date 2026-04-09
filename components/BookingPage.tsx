'use client'
import { useState, useEffect, useMemo } from 'react'
import { format, addDays, parseISO } from 'date-fns'

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

type Step = 'template' | 'date' | 'slot' | 'form' | 'confirm'

interface Props {
  token: string
  templates: Template[]
  onBack: () => void
}

export default function BookingPage({ token, templates, onBack }: Props) {
  const [step, setStep] = useState<Step>(templates.length === 1 ? 'date' : 'template')
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(templates.length === 1 ? templates[0] : null)
  const [slots, setSlots] = useState<Record<string, TimeSlot[]>>({})
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [bookerEmail, setBookerEmail] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmData, setConfirmData] = useState<{ cancelToken: string } | null>(null)

  // Timezone
  const browserTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const [timezone] = useState(browserTz)

  // Date range for availability: next 30 days
  const dateRange = useMemo(() => {
    const today = new Date()
    const from = format(today, 'yyyy-MM-dd')
    const to = format(addDays(today, 30), 'yyyy-MM-dd')
    return { from, to }
  }, [])

  // Fetch availability when template is selected
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

  // Available dates (those with slots)
  const availableDates = useMemo(() => Object.keys(slots).sort(), [slots])

  function selectTemplate(t: Template) {
    setSelectedTemplate(t)
    setFieldValues({})
    setStep('date')
  }

  function selectDate(date: string) {
    setSelectedDate(date)
    setSelectedSlot(null)
    setStep('slot')
  }

  function selectSlot(slot: TimeSlot) {
    setSelectedSlot(slot)
    setStep('form')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTemplate || !selectedDate || !selectedSlot || !bookerEmail) return

    // Validate required fields
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
          // Slot no longer available — go back to slot selection
          setStep('slot')
          setSelectedSlot(null)
        }
        return
      }
      setConfirmData({ cancelToken: data.cancelToken ?? data.booking?.cancel_token })
      setStep('confirm')
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-border flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold">Book a Meeting</h1>
            {selectedTemplate && step !== 'template' && (
              <p className="text-xs text-text-muted mt-0.5">{selectedTemplate.name} ({selectedTemplate.duration_minutes} min)</p>
            )}
          </div>
          {step !== 'confirm' && (
            <button
              onClick={step === 'template' || (step === 'date' && templates.length === 1) ? onBack : () => {
                if (step === 'form') setStep('slot')
                else if (step === 'slot') setStep('date')
                else if (step === 'date') { setStep('template'); setSelectedTemplate(null) }
              }}
              className="text-text-muted text-xs hover:text-text"
            >
              {step === 'template' || (step === 'date' && templates.length === 1) ? 'Back to calendar' : 'Back'}
            </button>
          )}
        </div>

        {/* Step indicator */}
        {step !== 'confirm' && (
          <div className="flex px-5 pt-3 gap-1">
            {['template', 'date', 'slot', 'form'].map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full ${
                i <= ['template', 'date', 'slot', 'form'].indexOf(step) ? 'bg-primary' : 'bg-border'
              }`} />
            ))}
          </div>
        )}

        <div className="p-5">
          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 text-red-500 text-xs font-bold">
              {error}
              <button onClick={() => setError(null)} className="ml-2 text-red-400">x</button>
            </div>
          )}

          {/* Step 1: Template selection */}
          {step === 'template' && (
            <div className="space-y-2">
              <p className="text-xs text-text-muted mb-3">Select a meeting type:</p>
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
          )}

          {/* Step 2: Date selection */}
          {step === 'date' && (
            <div className="space-y-2">
              <p className="text-xs text-text-muted mb-3">Select a date:</p>
              {slotsLoading ? (
                <p className="text-center text-text-muted text-sm py-8 animate-pulse">Loading availability...</p>
              ) : availableDates.length === 0 ? (
                <p className="text-center text-text-muted text-sm py-8">No available dates in the next 30 days.</p>
              ) : (
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {availableDates.map(date => {
                    const daySlots = slots[date] ?? []
                    const parsed = parseISO(date)
                    return (
                      <button
                        key={date}
                        onClick={() => selectDate(date)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm font-bold">{format(parsed, 'EEEE, d MMMM')}</p>
                          <p className="text-[10px] text-text-muted">{daySlots.length} available slots</p>
                        </div>
                        <span className="text-text-muted text-xs">›</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Slot selection */}
          {step === 'slot' && selectedDate && (
            <div className="space-y-2">
              <p className="text-xs text-text-muted mb-3">
                {format(parseISO(selectedDate), 'EEEE, d MMMM yyyy')} — select a time:
              </p>
              <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                {(slots[selectedDate] ?? []).map(slot => (
                  <button
                    key={slot.start}
                    onClick={() => selectSlot(slot)}
                    className={`px-2 py-2 rounded-lg border text-sm font-bold transition-colors ${
                      selectedSlot?.start === slot.start
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border hover:border-primary/50 text-text-muted hover:text-text'
                    }`}
                  >
                    {slot.start}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Booking form */}
          {step === 'form' && selectedTemplate && selectedDate && selectedSlot && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="p-3 rounded-lg bg-bg border border-border text-xs space-y-1">
                <p><span className="text-text-muted">Date:</span> <span className="font-bold">{format(parseISO(selectedDate), 'EEEE, d MMMM yyyy')}</span></p>
                <p><span className="text-text-muted">Time:</span> <span className="font-bold">{selectedSlot.start} – {selectedSlot.end}</span></p>
              </div>

              <div>
                <label className="text-xs text-text-muted block mb-1">Your email *</label>
                <input
                  type="email"
                  value={bookerEmail}
                  onChange={e => setBookerEmail(e.target.value)}
                  required
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  placeholder="you@company.com"
                />
              </div>

              {selectedTemplate.custom_fields.map(field => (
                <div key={field.label}>
                  <label className="text-xs text-text-muted block mb-1">
                    {field.label} {field.required && '*'}
                  </label>
                  <input
                    type={field.type}
                    value={fieldValues[field.label] ?? ''}
                    onChange={e => setFieldValues(v => ({ ...v, [field.label]: e.target.value }))}
                    required={field.required}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              ))}

              <div className="text-[10px] text-text-muted">
                Timezone: {timezone}
              </div>

              <button
                type="submit"
                disabled={submitting || !bookerEmail}
                className="w-full py-2.5 rounded-lg bg-primary text-white font-bold text-sm hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Booking...' : 'Confirm Booking'}
              </button>
            </form>
          )}

          {/* Step 5: Confirmation */}
          {step === 'confirm' && selectedTemplate && selectedDate && selectedSlot && (
            <div className="text-center space-y-4 py-4">
              <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
                <span className="text-green-500 text-xl">✓</span>
              </div>
              <div>
                <p className="text-base font-bold">Booking Confirmed!</p>
                <p className="text-xs text-text-muted mt-1">A confirmation email has been sent to {bookerEmail}</p>
              </div>
              <div className="p-3 rounded-lg bg-bg border border-border text-xs space-y-1 text-left">
                <p><span className="text-text-muted">Meeting:</span> <span className="font-bold">{selectedTemplate.name}</span></p>
                <p><span className="text-text-muted">Date:</span> {format(parseISO(selectedDate), 'EEEE, d MMMM yyyy')}</p>
                <p><span className="text-text-muted">Time:</span> {selectedSlot.start} – {selectedSlot.end} ({selectedTemplate.duration_minutes} min)</p>
              </div>
              {confirmData?.cancelToken && (
                <p className="text-[10px] text-text-muted">
                  Need to cancel? Check your email for the cancellation link.
                </p>
              )}
              <button
                onClick={onBack}
                className="text-xs text-text-muted hover:text-text"
              >
                Back to calendar
              </button>
            </div>
          )}
        </div>

        <div className="px-5 pb-4 text-center">
          <span className="text-[10px] text-text-muted">
            herbe<span className="text-primary">.</span>calendar
          </span>
        </div>
      </div>
    </div>
  )
}
