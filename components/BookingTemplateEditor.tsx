'use client'
import { useState } from 'react'
import type { BookingTemplate, AvailabilityWindow, CustomField } from '@/types'

interface Props {
  template: BookingTemplate | null
  connections: { id: string; name: string }[]
  onSave: () => void
  onCancel: () => void
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120]
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function BookingTemplateEditor({ template, connections, onSave, onCancel }: Props) {
  const isEdit = !!template

  // Basic info
  const [name, setName] = useState(template?.name ?? '')
  const [duration, setDuration] = useState(template?.duration_minutes ?? 30)
  const [buffer, setBuffer] = useState(template?.buffer_minutes ?? 0)

  // Availability windows
  const [windows, setWindows] = useState<AvailabilityWindow[]>(
    template?.availability_windows?.length
      ? template.availability_windows
      : [{ days: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00' }]
  )

  // Targets — ERP
  const [erpTargets, setErpTargets] = useState<{ connectionId: string; enabled: boolean; fields: Record<string, string> }[]>(
    connections.map(c => {
      const existing = template?.targets?.erp?.find(e => e.connectionId === c.id)
      return {
        connectionId: c.id,
        enabled: !!existing,
        fields: existing?.fields ?? { ActType: '', PRCode: '', CUCode: '' },
      }
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

  function removeWindow(idx: number) {
    setWindows(prev => prev.filter((_, i) => i !== idx))
  }

  function addWindow() {
    setWindows(prev => [...prev, { days: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00' }])
  }

  // ERP target helpers
  function updateErpTarget(connId: string, patch: Partial<{ enabled: boolean; fields: Record<string, string> }>) {
    setErpTargets(prev => prev.map(t => {
      if (t.connectionId !== connId) return t
      return { ...t, ...patch, fields: patch.fields ? { ...t.fields, ...patch.fields } : t.fields }
    }))
  }

  // Custom field helpers
  function updateCustomField(idx: number, patch: Partial<CustomField>) {
    setCustomFields(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }

  function removeCustomField(idx: number) {
    setCustomFields(prev => prev.filter((_, i) => i !== idx))
  }

  function addCustomField() {
    setCustomFields(prev => [...prev, { label: '', type: 'text', required: false }])
  }

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
              {DURATION_OPTIONS.map(d => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-text-muted block mb-1">Buffer (min)</label>
            <input
              type="number"
              min={0}
              className={`${inputClass} w-full`}
              value={buffer}
              onChange={e => setBuffer(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Availability Windows */}
      <div className="space-y-2">
        <p className={labelClass}>Availability Windows</p>
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
              {windows.length > 1 && (
                <button onClick={() => removeWindow(wi)} className="text-text-muted hover:text-red-400 text-xs px-1">✕</button>
              )}
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
        <button type="button" onClick={addWindow} className="text-xs text-primary hover:underline">+ Add window</button>
      </div>

      {/* Targets */}
      <div className="space-y-2">
        <p className={labelClass}>Targets</p>

        {/* ERP connections */}
        {erpTargets.map(t => {
          const conn = connections.find(c => c.id === t.connectionId)
          return (
            <div key={t.connectionId} className="p-3 border border-border rounded-lg space-y-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={t.enabled}
                  onChange={e => updateErpTarget(t.connectionId, { enabled: e.target.checked })}
                  className="accent-primary"
                />
                <span className="font-bold">{conn?.name || t.connectionId}</span>
                <span className="text-[10px] text-text-muted">ERP</span>
              </label>
              {t.enabled && (
                <div className="grid grid-cols-3 gap-2 pl-5">
                  <div>
                    <label className="text-[10px] text-text-muted block mb-0.5">ActType</label>
                    <input className={`${inputClass} w-full`} value={t.fields.ActType || ''} onChange={e => updateErpTarget(t.connectionId, { fields: { ActType: e.target.value } })} placeholder="e.g. MEETING" />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted block mb-0.5">PRCode</label>
                    <input className={`${inputClass} w-full`} value={t.fields.PRCode || ''} onChange={e => updateErpTarget(t.connectionId, { fields: { PRCode: e.target.value } })} placeholder="e.g. PR001" />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted block mb-0.5">CUCode</label>
                    <input className={`${inputClass} w-full`} value={t.fields.CUCode || ''} onChange={e => updateErpTarget(t.connectionId, { fields: { CUCode: e.target.value } })} placeholder="e.g. CU001" />
                  </div>
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
        <p className={labelClass}>Custom Fields</p>
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
