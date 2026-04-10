'use client'
import { useState, useEffect } from 'react'
import type { BookingTemplate, AvailabilityWindow, CustomField, ActivityType } from '@/types'

interface Props {
  template: BookingTemplate | null
  connections: { id: string; name: string }[]
  onSave: () => void
  onCancel: () => void
}

interface SearchResult { code: string; name: string }

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120]
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function BookingTemplateEditor({ template, connections, onSave, onCancel }: Props) {
  const isEdit = !!template

  // Basic info
  const [name, setName] = useState(template?.name ?? '')
  const [duration, setDuration] = useState(template?.duration_minutes ?? 30)
  const [buffer, setBuffer] = useState(template?.buffer_minutes ?? 0)

  // Availability windows — empty by default
  const [windows, setWindows] = useState<AvailabilityWindow[]>(
    template?.availability_windows?.length ? template.availability_windows : []
  )

  // Searchable data — fetched per connection
  const [allActivityTypes, setAllActivityTypes] = useState<ActivityType[]>([])
  const [allProjects, setAllProjects] = useState<SearchResult[]>([])
  const [allCustomers, setAllCustomers] = useState<SearchResult[]>([])

  useEffect(() => {
    fetch('/api/activity-types').then(r => r.json()).then(d => setAllActivityTypes(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/projects?all=1').then(r => r.json()).then(d => {
      const items = Array.isArray(d) ? d : []
      setAllProjects(items.map((p: Record<string, unknown>) => ({ code: String(p.Code ?? p.code ?? ''), name: String(p.Name ?? p.name ?? '') })))
    }).catch(() => {})
    fetch('/api/customers?all=1').then(r => r.json()).then(d => {
      const items = Array.isArray(d) ? d : []
      setAllCustomers(items.map((c: Record<string, unknown>) => ({ code: String(c.Code ?? c.code ?? ''), name: String(c.Name ?? c.name ?? '') })))
    }).catch(() => {})
  }, [])

  // Targets — ERP
  const [erpTargets, setErpTargets] = useState<{ connectionId: string; enabled: boolean; fields: Record<string, string> }[]>(
    connections.map(c => {
      const existing = template?.targets?.erp?.find(e => e.connectionId === c.id)
      return { connectionId: c.id, enabled: !!existing, fields: existing?.fields ?? {} }
    })
  )

  // Targets — Outlook
  const [outlookEnabled, setOutlookEnabled] = useState(template?.targets?.outlook?.enabled ?? false)
  const [outlookOnlineMeeting, setOutlookOnlineMeeting] = useState(template?.targets?.outlook?.onlineMeeting ?? false)
  const [outlookLocation, setOutlookLocation] = useState(template?.targets?.outlook?.location ?? '')

  // Targets — Google
  const [googleEnabled, setGoogleEnabled] = useState(template?.targets?.google?.enabled ?? false)
  const [googleOnlineMeeting, setGoogleOnlineMeeting] = useState(template?.targets?.google?.onlineMeeting ?? false)
  const [googleLocation, setGoogleLocation] = useState(template?.targets?.google?.location ?? '')

  // Custom fields
  const [customFields, setCustomFields] = useState<CustomField[]>(
    template?.custom_fields?.length ? template.custom_fields : []
  )

  const [saving, setSaving] = useState(false)

  // Window helpers
  function updateWindow(idx: number, patch: Partial<AvailabilityWindow>) {
    setWindows(prev => prev.map((w, i) => i === idx ? { ...w, ...patch } : w))
  }
  function toggleDay(windowIdx: number, day: number) {
    setWindows(prev => prev.map((w, i) => {
      if (i !== windowIdx) return w
      const days = w.days.includes(day) ? w.days.filter(d => d !== day) : [...w.days, day].sort()
      return { ...w, days }
    }))
  }
  function removeWindow(idx: number) { setWindows(prev => prev.filter((_, i) => i !== idx)) }
  function addWindow() { setWindows(prev => [...prev, { days: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00' }]) }

  // ERP target helpers
  function updateErpField(connId: string, field: string, value: string) {
    setErpTargets(prev => prev.map(t =>
      t.connectionId === connId ? { ...t, fields: { ...t.fields, [field]: value } } : t
    ))
  }
  function toggleErp(connId: string, enabled: boolean) {
    setErpTargets(prev => prev.map(t => t.connectionId === connId ? { ...t, enabled } : t))
  }

  // Custom field helpers
  function updateCustomField(idx: number, patch: Partial<CustomField>) {
    setCustomFields(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }
  function removeCustomField(idx: number) { setCustomFields(prev => prev.filter((_, i) => i !== idx)) }
  function addCustomField() { setCustomFields(prev => [...prev, { label: '', type: 'text', required: false }]) }

  // Save
  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const body = {
        ...(isEdit ? { id: template.id } : {}),
        name: name.trim(),
        duration_minutes: duration,
        buffer_minutes: buffer,
        availability_windows: windows,
        targets: {
          erp: erpTargets.filter(t => t.enabled).map(t => ({ connectionId: t.connectionId, fields: t.fields })),
          outlook: outlookEnabled ? { enabled: true, onlineMeeting: outlookOnlineMeeting, location: outlookLocation || undefined } : undefined,
          google: googleEnabled ? { enabled: true, onlineMeeting: googleOnlineMeeting, location: googleLocation || undefined } : undefined,
        },
        custom_fields: customFields.filter(f => f.label.trim()),
        active: true,
      }
      await fetch('/api/settings/templates', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      onSave()
    } catch (e) {
      console.error('Failed to save template:', e)
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'bg-surface border border-border text-xs rounded-lg p-2 outline-none focus:border-primary'
  const labelClass = 'text-[10px] text-text-muted uppercase font-bold tracking-wide'

  return (
    <div className="border border-primary/30 rounded-lg bg-bg p-4 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold">{isEdit ? 'Edit Template' : 'New Template'}</p>
        <button onClick={onCancel} className="text-text-muted text-sm hover:text-text">✕</button>
      </div>

      {/* Basic Info */}
      <div className="space-y-2">
        <p className={labelClass}>Basic Info</p>
        <input
          className={`${inputClass} w-full`}
          placeholder="Template name (e.g. 30min Consultation)"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-text-muted block mb-1">Duration</label>
            <select className={`${inputClass} w-full`} value={duration} onChange={e => setDuration(Number(e.target.value))}>
              {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-text-muted block mb-1">Buffer (min)</label>
            <input type="number" min={0} className={`${inputClass} w-full`} value={buffer} onChange={e => setBuffer(Number(e.target.value))} />
          </div>
        </div>
      </div>

      {/* Availability Windows */}
      <div className="space-y-2">
        <p className={labelClass}>Availability Windows <span className="font-normal normal-case">(for booking page)</span></p>
        {windows.length === 0 && (
          <p className="text-[10px] text-text-muted">No availability windows defined. Add one to enable time slot restrictions for bookings.</p>
        )}
        {windows.map((w, wi) => (
          <div key={wi} className="p-3 border border-border rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {DAY_LABELS.map((label, di) => (
                  <button
                    key={di}
                    type="button"
                    onClick={() => toggleDay(wi, di)}
                    className={`w-7 h-7 text-[10px] rounded ${w.days.includes(di) ? 'bg-primary text-white font-bold' : 'bg-surface border border-border text-text-muted hover:border-primary/50'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={() => removeWindow(wi)} className="text-text-muted hover:text-red-400 text-xs px-1">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-text-muted block mb-0.5">Start</label>
                <input type="time" className={`${inputClass} w-full`} value={w.startTime} onChange={e => updateWindow(wi, { startTime: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-text-muted block mb-0.5">End</label>
                <input type="time" className={`${inputClass} w-full`} value={w.endTime} onChange={e => updateWindow(wi, { endTime: e.target.value })} />
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={addWindow} className="text-xs text-primary hover:underline">+ Add availability window</button>
      </div>

      {/* Targets */}
      <div className="space-y-2">
        <p className={labelClass}>Create activity in</p>

        {/* ERP connections */}
        {erpTargets.map(t => {
          const conn = connections.find(c => c.id === t.connectionId)
          return (
            <div key={t.connectionId} className="p-3 border border-border rounded-lg space-y-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={t.enabled} onChange={e => toggleErp(t.connectionId, e.target.checked)} className="accent-primary" />
                <span className="font-bold">{conn?.name || t.connectionId}</span>
                <span className="text-[10px] text-text-muted">ERP</span>
              </label>
              {t.enabled && (
                <div className="space-y-2 pl-5">
                  <SearchField
                    label="Activity Type"
                    value={t.fields.ActType || ''}
                    onChange={v => updateErpField(t.connectionId, 'ActType', v)}
                    items={allActivityTypes.map(at => ({ code: at.code, name: at.name }))}
                    inputClass={inputClass}
                  />
                  <SearchField
                    label="Project"
                    value={t.fields.PRCode || ''}
                    onChange={v => updateErpField(t.connectionId, 'PRCode', v)}
                    items={allProjects}
                    inputClass={inputClass}
                  />
                  <SearchField
                    label="Customer"
                    value={t.fields.CUCode || ''}
                    onChange={v => updateErpField(t.connectionId, 'CUCode', v)}
                    items={allCustomers}
                    inputClass={inputClass}
                  />
                </div>
              )}
            </div>
          )
        })}

        {/* Outlook */}
        <div className="p-3 border border-border rounded-lg space-y-2">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={outlookEnabled} onChange={e => setOutlookEnabled(e.target.checked)} className="accent-primary" />
            <span className="font-bold">Outlook</span>
          </label>
          {outlookEnabled && (
            <div className="pl-5 space-y-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={outlookOnlineMeeting} onChange={e => setOutlookOnlineMeeting(e.target.checked)} className="accent-primary" />
                <span>Teams meeting</span>
              </label>
              <div>
                <label className="text-[10px] text-text-muted block mb-0.5">Location</label>
                <input className={`${inputClass} w-full`} value={outlookLocation} onChange={e => setOutlookLocation(e.target.value)} placeholder="Optional location" />
              </div>
            </div>
          )}
        </div>

        {/* Google */}
        <div className="p-3 border border-border rounded-lg space-y-2">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={googleEnabled} onChange={e => setGoogleEnabled(e.target.checked)} className="accent-primary" />
            <span className="font-bold">Google</span>
          </label>
          {googleEnabled && (
            <div className="pl-5 space-y-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={googleOnlineMeeting} onChange={e => setGoogleOnlineMeeting(e.target.checked)} className="accent-primary" />
                <span>Google Meet</span>
              </label>
              <div>
                <label className="text-[10px] text-text-muted block mb-0.5">Location</label>
                <input className={`${inputClass} w-full`} value={googleLocation} onChange={e => setGoogleLocation(e.target.value)} placeholder="Optional location" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom Fields */}
      <div className="space-y-2">
        <p className={labelClass}>Custom Fields <span className="font-normal normal-case">(booker fills these in)</span></p>
        {customFields.length === 0 && (
          <p className="text-[10px] text-text-muted">No custom fields. Booker email is always collected.</p>
        )}
        {customFields.map((f, fi) => (
          <div key={fi} className="flex items-center gap-2">
            <input className={`${inputClass} flex-1`} placeholder="Label" value={f.label} onChange={e => updateCustomField(fi, { label: e.target.value })} />
            <select className={inputClass} value={f.type} onChange={e => updateCustomField(fi, { type: e.target.value as 'text' | 'email' })}>
              <option value="text">Text</option>
              <option value="email">Email</option>
            </select>
            <label className="flex items-center gap-1 text-[10px] text-text-muted cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={f.required} onChange={e => updateCustomField(fi, { required: e.target.checked })} className="accent-primary" />
              Req
            </label>
            <button onClick={() => removeCustomField(fi)} className="text-text-muted hover:text-red-400 text-xs px-1">✕</button>
          </div>
        ))}
        <button type="button" onClick={addCustomField} className="text-xs text-primary hover:underline">+ Add field</button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-border">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex-1 bg-primary text-white text-xs font-bold py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : isEdit ? 'Update Template' : 'Create Template'}
        </button>
        <button onClick={onCancel} className="text-text-muted text-xs px-4 py-2 rounded-lg hover:bg-border">Cancel</button>
      </div>
    </div>
  )
}

/** Searchable dropdown field for codes (activity types, projects, customers) */
function SearchField({ label, value, onChange, items, inputClass }: {
  label: string
  value: string
  onChange: (code: string) => void
  items: SearchResult[]
  inputClass: string
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)

  // Sync external value
  useEffect(() => { setQuery(value) }, [value])

  const filtered = query
    ? items.filter(i => (i.code ?? '').toLowerCase().includes(query.toLowerCase()) || (i.name ?? '').toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : items.slice(0, 8)

  return (
    <div className="relative">
      <label className="text-[10px] text-text-muted block mb-0.5">{label}</label>
      <input
        className={`${inputClass} w-full`}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); setFocusedIdx(-1) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, filtered.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, -1)) }
          else if (e.key === 'Enter' && focusedIdx >= 0) {
            e.preventDefault()
            const item = filtered[focusedIdx]
            setQuery(item.code)
            onChange(item.code)
            setOpen(false)
          }
          else if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={`Search ${label.toLowerCase()}...`}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-0.5 z-50 bg-surface border border-border rounded-lg shadow-lg max-h-32 overflow-y-auto">
          {filtered.map((item, idx) => (
            <button
              key={item.code}
              type="button"
              className={`w-full text-left px-2 py-1.5 text-xs flex items-center gap-2 ${idx === focusedIdx ? 'bg-primary/15' : 'hover:bg-border/30'}`}
              onMouseDown={e => {
                e.preventDefault()
                setQuery(item.code)
                onChange(item.code)
                setOpen(false)
              }}
            >
              <span className="font-mono text-[10px] text-primary w-10 shrink-0">{item.code}</span>
              <span className="truncate">{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
