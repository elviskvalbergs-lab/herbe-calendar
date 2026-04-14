'use client'
import { useState, useEffect, useRef } from 'react'
import { ActivityClassGroup } from '@/types'
import type { BookingTemplate, UserGoogleAccount } from '@/types'
import { BRAND_PALETTE, OUTLOOK_COLOR, FALLBACK_COLOR } from '@/lib/activityColors'
import ColorOverridesPanel from './ColorOverridesPanel'
import type { ColorOverrideRow } from '@/lib/activityColors'
import BookingTemplateEditor, { type TemplateEditorHandle } from './BookingTemplateEditor'
import ConfirmDialog from './ConfirmDialog'
import { useConfirm } from '@/lib/useConfirm'

type Theme = 'dark' | 'light' | 'system'

function applyTheme(t: Theme) {
  try {
    if (t === 'system') {
      localStorage.removeItem('theme')
      if (window.matchMedia('(prefers-color-scheme: light)').matches) {
        document.documentElement.setAttribute('data-theme', 'light')
      } else {
        document.documentElement.removeAttribute('data-theme')
      }
    } else {
      localStorage.setItem('theme', t)
      document.documentElement.setAttribute('data-theme', t)
    }
  } catch {}
}

interface Props {
  classGroups: ActivityClassGroup[]
  colorMap: Map<string, string>
  persons: { code: string; name: string }[]
  connections: { id: string; name: string }[]
  colorOverrides: ColorOverrideRow[]
  error?: string | null
  onClose: () => void
  onColorChange: (groupCode: string, color: string) => void
  onColorOverridesChange: () => void
  azureConfigured?: boolean
  googleConfigured?: boolean
  zoomConfigured?: boolean
}

type Tab = 'style' | 'colors' | 'integrations' | 'templates'


export default function SettingsModal({ classGroups, colorMap, persons, connections, colorOverrides, error, onClose, onColorChange, onColorOverridesChange, azureConfigured, googleConfigured, zoomConfigured }: Props) {
  const [theme, setTheme] = useState<Theme>('system')
  const [activeTab, setActiveTab] = useState<Tab>('style')
  interface CustomCalendar { id: string; personCode: string; name: string; icsUrl: string; color?: string; sharing?: string }
  const [customCals, setCustomCals] = useState<CustomCalendar[]>([])
  const [calLoading, setCalLoading] = useState(false)
  const [googleAccounts, setGoogleAccounts] = useState<UserGoogleAccount[]>([])
  const [googleLoading, setGoogleLoading] = useState(false)
  const [newCal, setNewCal] = useState({ name: '', icsUrl: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', icsUrl: '', color: '' })
  const [templates, setTemplates] = useState<BookingTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<BookingTemplate | null | 'new'>(null)
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | 'new' | null>(null)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const templateEditorRef = useRef<TemplateEditorHandle>(null)
  const { confirmState, confirm: showConfirm, handleConfirm, handleCancel } = useConfirm()

  /** Guard close actions — shows styled confirm dialog if template editor has unsaved changes */
  function guardedClose(action: () => void) {
    if (templateEditorRef.current?.isDirty()) {
      showConfirm('You have unsaved changes. Discard them?', action, { confirmLabel: 'Discard', destructive: true })
    } else {
      action()
    }
  }
  const [calError, setCalError] = useState<string | null>(null)
  const [stagedIcsColor, setStagedIcsColor] = useState<{ id: string; color: string } | null>(null)
  const [calendlyConnection, setCalendlyConnection] = useState<any>(null)
  const [calendlyPat, setCalendlyPat] = useState('')
  const [calendlyDefaultTemplate, setCalendlyDefaultTemplate] = useState('')
  const [calendlyLoading, setCalendlyLoading] = useState(false)
  const [calendlyError, setCalendlyError] = useState('')
  const [userTemplates, setUserTemplates] = useState<{ id: string; name: string }[]>([])
  const [openIntegrationSections, setOpenIntegrationSections] = useState<Record<string, boolean>>({})
  function toggleIntegration(key: string) {
    setOpenIntegrationSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem('theme')
      setTheme(stored === 'light' ? 'light' : stored === 'dark' ? 'dark' : 'system')
    } catch {}
  }, [])

  // ESC: close template editor first, then the whole modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (editingTemplate || expandedTemplateId)) {
        e.stopPropagation()
        guardedClose(() => { setEditingTemplate(null); setExpandedTemplateId(null) })
        return
      }
    }
    window.addEventListener('keydown', handler, true) // capture phase to fire before CalendarShell
    return () => window.removeEventListener('keydown', handler, true)
  }, [editingTemplate, expandedTemplateId])

  useEffect(() => {
    if (activeTab === 'integrations') {
      fetchCustomCals()
      setGoogleLoading(true)
      fetch('/api/google/calendars').then(r => r.ok ? r.json() : []).then(setGoogleAccounts).catch(() => {}).finally(() => setGoogleLoading(false))
      fetch('/api/calendly/connect').then(r => r.ok ? r.json() : null).then(setCalendlyConnection).catch(() => {})
      fetch('/api/settings/templates').then(r => r.ok ? r.json() : []).then(setUserTemplates).catch(() => {})
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'templates') {
      setTemplatesLoading(true)
      fetch('/api/settings/templates').then(r => r.json()).then(data => {
        setTemplates(Array.isArray(data) ? data : [])
      }).catch(() => {}).finally(() => setTemplatesLoading(false))
    }
  }, [activeTab])

  async function fetchCustomCals() {
    setCalLoading(true)
    try {
      const res = await fetch('/api/settings/calendars')
      const data = await res.json()
      setCustomCals(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to fetch custom calendars:', e)
    } finally {
      setCalLoading(false)
    }
  }

  async function handleAddCal(e: React.FormEvent) {
    e.preventDefault()
    if (!newCal.name || !newCal.icsUrl) return
    try {
      const res = await fetch('/api/settings/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCal)
      })
      if (res.ok) {
        setNewCal({ name: '', icsUrl: '' })
        fetchCustomCals()
      } else {
        const data = await res.json().catch(() => null)
        setCalError(data?.error || `Failed to add calendar (HTTP ${res.status})`)
      }
    } catch (e) {
      setCalError('Failed to add calendar: ' + e)
    }
  }

  async function handleDeleteCal(id: string) {
    try {
      const res = await fetch('/api/settings/calendars', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (res.ok) fetchCustomCals()
    } catch (e) {
      console.error('Failed to delete calendar:', e)
    }
  }

  function startEdit(cal: CustomCalendar) {
    setEditingId(cal.id)
    setEditForm({ name: cal.name, icsUrl: cal.icsUrl, color: cal.color || '' })
  }

  async function handleSaveEdit() {
    if (!editingId) return
    try {
      const res = await fetch('/api/settings/calendars', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...editForm })
      })
      if (res.ok) {
        setEditingId(null)
        fetchCustomCals()
      }
    } catch (e) {
      console.error('Failed to update calendar:', e)
    }
  }

  async function handleColorChange(id: string, color: string) {
    try {
      await fetch('/api/settings/calendars', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, color })
      })
      fetchCustomCals()
    } catch (e) {
      console.error('Failed to update color:', e)
    }
  }

  function handleTheme(t: Theme) {
    setTheme(t)
    applyTheme(t)
  }

  async function connectCalendly() {
    setCalendlyLoading(true); setCalendlyError('')
    try {
      const res = await fetch('/api/calendly/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pat: calendlyPat, defaultTemplateId: calendlyDefaultTemplate }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
      setCalendlyConnection(await res.json())
      setCalendlyPat('')
    } catch (e) { setCalendlyError(String(e)) }
    finally { setCalendlyLoading(false) }
  }

  async function updateCalendlyMapping(eventTypeUri: string, templateId: string) {
    await fetch('/api/calendly/mappings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventTypeUri, templateId: templateId || null }),
    })
    // Optimistic update
    setCalendlyConnection((prev: any) => ({
      ...prev,
      eventTypes: prev.eventTypes.map((et: any) =>
        et.uri === eventTypeUri ? { ...et, templateId: templateId || null } : et
      ),
    }))
  }

  async function refreshCalendly() {
    const res = await fetch('/api/calendly/refresh', { method: 'POST' })
    if (res.ok) setCalendlyConnection(await res.json())
  }

  async function disconnectCalendly() {
    await fetch('/api/calendly/connect', { method: 'DELETE' })
    setCalendlyConnection(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={() => guardedClose(onClose)} />
      <div
        className="relative bg-surface border border-border shadow-2xl rounded-t-2xl sm:rounded-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden"
        onTouchStart={e => {
          // Only track swipe if started near the top (drag handle area, first 60px)
          const rect = e.currentTarget.getBoundingClientRect()
          const touchY = e.touches[0].clientY - rect.top
          swipeStart.current = touchY < 60 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null
        }}
        onTouchEnd={e => {
          if (swipeStart.current !== null) {
            const dx = e.changedTouches[0].clientX - swipeStart.current.x
            const dy = e.changedTouches[0].clientY - swipeStart.current.y
            if ((dy > 80 && dy > Math.abs(dx)) || (dx < -80 && Math.abs(dx) > Math.abs(dy))) {
              guardedClose(onClose)
            }
          }
          swipeStart.current = null
        }}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header with Tabs */}
        <div className="px-4 pt-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold">Settings</h2>
            <button onClick={() => guardedClose(onClose)} className="text-text-muted text-xl leading-none hover:text-text">✕</button>
          </div>
          <div className="flex gap-4 text-sm">
            <button
              onClick={() => setActiveTab('style')}
              className={`pb-2 px-1 ${activeTab === 'style' ? 'border-b-2 border-primary text-primary font-bold' : 'text-text-muted hover:text-text'}`}
            >
              Look & Feel
            </button>
            <button
              onClick={() => setActiveTab('colors')}
              className={`pb-2 px-1 ${activeTab === 'colors' ? 'border-b-2 border-primary text-primary font-bold' : 'text-text-muted hover:text-text'}`}
            >
              Colors
            </button>
            <button
              onClick={() => setActiveTab('integrations')}
              className={`pb-2 px-1 ${activeTab === 'integrations' ? 'border-b-2 border-primary text-primary font-bold' : 'text-text-muted hover:text-text'}`}
            >
              Integrations
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`pb-2 px-1 ${activeTab === 'templates' ? 'border-b-2 border-primary text-primary font-bold' : 'text-text-muted hover:text-text'}`}
            >
              Templates
            </button>
            {activeTab === 'integrations' && (
              <a
                href="/docs/integrations"
                target="_blank"
                rel="noopener"
                className="ml-auto mb-2 inline-flex items-center justify-center w-4 h-4 rounded-full border border-text-muted/30 text-text-muted hover:text-primary hover:border-primary text-[9px] font-bold shrink-0"
                title="Help: Integrations"
              >?</a>
            )}
            {activeTab === 'templates' && (
              <a
                href="/docs/booking"
                target="_blank"
                rel="noopener"
                className="ml-auto mb-2 inline-flex items-center justify-center w-4 h-4 rounded-full border border-text-muted/30 text-text-muted hover:text-primary hover:border-primary text-[9px] font-bold shrink-0"
                title="Help: Booking templates"
              >?</a>
            )}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-6">
          {activeTab === 'style' && (
            <>
              {/* Theme */}
              <div className="space-y-2">
                <p className="text-[10px] text-text-muted uppercase font-bold tracking-wide">Theme</p>
                <div className="flex rounded-lg overflow-hidden border border-border divide-x divide-border">
                  {(['dark', 'system', 'light'] as Theme[]).map(t => (
                    <button
                      key={t}
                      onClick={() => handleTheme(t)}
                      className={`flex-1 py-1.5 capitalize text-xs ${theme === t ? 'bg-primary text-white' : 'text-text-muted hover:bg-border'}`}
                    >
                      {t === 'system' ? '⚙ System' : t === 'dark' ? '☾ Dark' : '☀ Light'}
                    </button>
                  ))}
                </div>
              </div>

            </>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-3">

              {/* Google Calendar */}
              <div className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleIntegration('google')}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-border/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span className="text-sm font-bold">Google Calendar</span>
                    <a
                      href="/docs/integrations#google"
                      target="_blank"
                      rel="noopener"
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-text-muted/30 text-text-muted hover:text-primary hover:border-primary text-[9px] font-bold shrink-0"
                      title="Help: Google Calendar integration"
                    >?</a>
                  </div>
                  <div className="flex items-center gap-2">
                    {googleAccounts.length > 0
                      ? <span className="text-[10px] text-green-400 font-bold">{googleAccounts.length} account{googleAccounts.length !== 1 ? 's' : ''}</span>
                      : <span className="text-[10px] text-text-muted font-bold">Not connected</span>
                    }
                    <span className="text-text-muted text-xs">{openIntegrationSections['google'] ? '▼' : '▶'}</span>
                  </div>
                </button>
                {openIntegrationSections['google'] && (
                  <div className="p-4 border-t border-border">
                    {googleAccounts.map(account => (
                      <div key={account.id} className="mb-3 border border-border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold">{account.googleEmail}</span>
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                await fetch('/api/google/calendars', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ tokenId: account.id }),
                                }).then(r => r.json()).then(setGoogleAccounts)
                              }}
                              className="text-[10px] text-text-muted hover:text-text px-1.5 py-0.5 rounded border border-border hover:bg-border/30"
                            >
                              Refresh
                            </button>
                            <button
                              onClick={async () => {
                                await fetch('/api/google/auth', {
                                  method: 'DELETE',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ googleEmail: account.googleEmail }),
                                })
                                setGoogleAccounts(prev => prev.filter(a => a.id !== account.id))
                              }}
                              className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded border border-border hover:border-red-400/30"
                            >
                              Disconnect
                            </button>
                          </div>
                        </div>
                        {account.calendars.map(cal => (
                          <div key={cal.id} className="py-1.5 px-1">
                            <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={cal.enabled}
                              onChange={async () => {
                                // Optimistic update
                                setGoogleAccounts(prev => prev.map(a => a.id === account.id ? {
                                  ...a,
                                  calendars: a.calendars.map(c => c.id === cal.id ? { ...c, enabled: !c.enabled } : c)
                                } : a))
                                await fetch('/api/google/calendars', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ calendarDbId: cal.id, enabled: !cal.enabled }),
                                })
                              }}
                              className="accent-primary"
                            />
                            <div
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ background: cal.color || '#4285f4' }}
                            />
                            <span className="text-sm flex-1 truncate">{cal.name}</span>
                            {cal.sharing && cal.sharing !== 'private' && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${cal.sharing === 'full' ? 'border-amber-500/30 text-amber-400' : cal.sharing === 'titles' ? 'border-blue-500/30 text-blue-400' : 'border-green-500/30 text-green-400'}`}>
                                {cal.sharing === 'busy' ? 'Shared busy' : cal.sharing === 'titles' ? 'Shared titles' : 'Shared fully'}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1 pl-5 items-center">
                            {BRAND_PALETTE.slice(0, 12).map(hex => (
                              <button
                                key={hex}
                                title={hex}
                                onClick={async () => {
                                  setGoogleAccounts(prev => prev.map(a => a.id === account.id ? {
                                    ...a,
                                    calendars: a.calendars.map(c => c.id === cal.id ? { ...c, color: hex } : c)
                                  } : a))
                                  await fetch('/api/google/calendars', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ calendarDbId: cal.id, color: hex }),
                                  })
                                }}
                                className="w-4 h-4 rounded hover:scale-125"
                                style={{
                                  background: hex,
                                  border: (cal.color || '') === hex ? '2px solid white' : 'none',
                                  opacity: (cal.color || '') === hex ? 1 : 0.7,
                                }}
                              />
                            ))}
                            <label
                              className="w-4 h-4 rounded border border-dashed border-text-muted/40 hover:border-text-muted cursor-pointer flex items-center justify-center text-[8px] text-text-muted hover:scale-125"
                              title="Custom color"
                            >
                              +
                              <input
                                type="color"
                                value={cal.color || '#4285f4'}
                                onChange={async (e) => {
                                  const hex = e.target.value
                                  setGoogleAccounts(prev => prev.map(a => a.id === account.id ? {
                                    ...a,
                                    calendars: a.calendars.map(c => c.id === cal.id ? { ...c, color: hex } : c)
                                  } : a))
                                  await fetch('/api/google/calendars', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ calendarDbId: cal.id, color: hex }),
                                  })
                                }}
                                className="sr-only"
                              />
                            </label>
                            {cal.color && (
                              <button
                                onClick={async () => {
                                  setGoogleAccounts(prev => prev.map(a => a.id === account.id ? {
                                    ...a,
                                    calendars: a.calendars.map(c => c.id === cal.id ? { ...c, color: null } : c)
                                  } : a))
                                  await fetch('/api/google/calendars', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ calendarDbId: cal.id, color: '' }),
                                  })
                                }}
                                className="text-[9px] text-text-muted hover:text-text px-1"
                                title="Reset to default"
                              >reset</button>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 pl-5">
                            <span className="text-[9px] text-text-muted">Sharing:</span>
                            <select
                              value={cal.sharing ?? 'private'}
                              onChange={async (e) => {
                                setGoogleAccounts(prev => prev.map(a => a.id === account.id ? {
                                  ...a,
                                  calendars: a.calendars.map(c => c.id === cal.id ? { ...c, sharing: e.target.value as any } : c)
                                } : a))
                                await fetch('/api/google/calendars', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ calendarDbId: cal.id, sharing: e.target.value }),
                                })
                              }}
                              className="bg-bg border border-border rounded text-[10px] px-1.5 py-0.5 outline-none"
                            >
                              <option value="private">Private</option>
                              <option value="busy">Busy only</option>
                              <option value="titles">Titles</option>
                              <option value="full">Full details</option>
                            </select>
                          </div>
                          </div>
                        ))}
                      </div>
                    ))}
                    {googleAccounts.length === 0 && !googleLoading && (
                      <p className="text-xs text-text-muted mb-2">No Google accounts connected.</p>
                    )}
                    <button
                      onClick={() => { window.location.href = '/api/google/auth' }}
                      className="text-sm text-primary font-semibold hover:underline"
                    >
                      + Connect Google Account
                    </button>
                  </div>
                )}
              </div>

              {/* Calendly */}
              <div className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleIntegration('calendly')}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-border/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    <span className="text-sm font-bold">Calendly</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {calendlyConnection
                      ? <span className="text-[10px] text-green-400 font-bold">Connected as {calendlyConnection.userName}</span>
                      : <span className="text-[10px] text-text-muted font-bold">Not connected</span>
                    }
                    <span className="text-text-muted text-xs">{openIntegrationSections['calendly'] ? '▼' : '▶'}</span>
                  </div>
                </button>
                {openIntegrationSections['calendly'] && (
                  <div className="p-4 border-t border-border">
                    {calendlyConnection ? (
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-text-muted block mb-1">Default Template</label>
                          <select
                            value={calendlyConnection.defaultTemplateId}
                            onChange={async e => {
                              const templateId = e.target.value
                              const res = await fetch('/api/calendly/connect', {
                                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ defaultTemplateId: templateId }),
                              })
                              if (res.ok) setCalendlyConnection((prev: any) => ({ ...prev, defaultTemplateId: templateId }))
                            }}
                            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
                          >
                            {userTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                        <p className="text-xs text-text-muted font-bold">Event Types</p>
                        {calendlyConnection.eventTypes.map((et: any) => (
                          <div key={et.uri} className="flex items-center gap-2 text-xs">
                            <span className="flex-1 truncate">{et.name} ({et.duration}min)</span>
                            <select
                              value={et.templateId ?? ''}
                              onChange={e => updateCalendlyMapping(et.uri, e.target.value)}
                              className="bg-bg border border-border rounded px-2 py-1 text-xs max-w-[150px]"
                            >
                              <option value="">Use default</option>
                              {userTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          </div>
                        ))}
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={refreshCalendly}
                            className="text-[10px] text-text-muted hover:text-text px-2 py-1 rounded border border-border"
                          >Refresh</button>
                          <button
                            onClick={disconnectCalendly}
                            className="text-[10px] text-red-400 hover:text-red-300 px-2 py-1 rounded border border-border"
                          >Disconnect</button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-text-muted block mb-1">Personal Access Token</label>
                          <input
                            type="password"
                            value={calendlyPat}
                            onChange={e => setCalendlyPat(e.target.value)}
                            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
                            placeholder="Paste your Calendly PAT"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-text-muted block mb-1">Default Template (required)</label>
                          <select
                            value={calendlyDefaultTemplate}
                            onChange={e => setCalendlyDefaultTemplate(e.target.value)}
                            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
                          >
                            <option value="">Select template...</option>
                            {userTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                        {calendlyError && <p className="text-xs text-red-400">{calendlyError}</p>}
                        <button
                          onClick={connectCalendly}
                          disabled={!calendlyPat || !calendlyDefaultTemplate || calendlyLoading}
                          className="bg-primary text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-30"
                        >
                          {calendlyLoading ? 'Connecting...' : 'Connect Calendly'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ICS Calendar Feeds */}
              <div className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleIntegration('ics')}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-border/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
                    <span className="text-sm font-bold">ICS Calendar Feeds</span>
                    <a
                      href="/docs/integrations#ics"
                      target="_blank"
                      rel="noopener"
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-text-muted/30 text-text-muted hover:text-primary hover:border-primary text-[9px] font-bold shrink-0"
                      title="Help: ICS Calendar Feeds"
                    >?</a>
                  </div>
                  <div className="flex items-center gap-2">
                    {customCals.length > 0
                      ? <span className="text-[10px] text-green-400 font-bold">{customCals.length} feed{customCals.length !== 1 ? 's' : ''}</span>
                      : <span className="text-[10px] text-text-muted font-bold">No feeds</span>
                    }
                    <span className="text-text-muted text-xs">{openIntegrationSections['ics'] ? '▼' : '▶'}</span>
                  </div>
                </button>
                {openIntegrationSections['ics'] && (
                  <div className="p-4 border-t border-border space-y-3">
                    {/* Add New Calendar */}
                    <div className="space-y-3 p-4 bg-bg rounded-lg border border-border">
                      <h4 className="text-xs font-bold flex items-center gap-2">
                        + Add External Calendar (ICS)
                      </h4>
                      <form onSubmit={handleAddCal} className="space-y-2">
                        <input
                          className="w-full bg-surface border border-border text-xs rounded-lg p-2 outline-none focus:border-primary"
                          placeholder="Calendar Name (e.g. Work)"
                          value={newCal.name}
                          onChange={e => setNewCal(p => ({ ...p, name: e.target.value }))}
                          required
                        />
                        <input
                          className="w-full bg-surface border border-border text-xs rounded-lg p-2 outline-none focus:border-primary"
                          placeholder="Public ICS URL (https://...)"
                          value={newCal.icsUrl}
                          onChange={e => setNewCal(p => ({ ...p, icsUrl: e.target.value }))}
                          required
                        />
                        {calError && (
                          <p className="text-red-400 text-xs">{calError}</p>
                        )}
                        <button
                          type="submit"
                          onClick={() => setCalError(null)}
                          className="w-full bg-primary text-white text-xs font-bold py-2 rounded-lg hover:opacity-90"
                        >
                          Attach Calendar
                        </button>
                      </form>
                      <p className="text-[11px] text-text-muted mt-2">
                        Apple Calendar users: share your calendar as a public ICS link from iCloud settings, then paste the URL above.{' '}
                        <a
                          href="/docs/integrations#apple"
                          className="text-primary hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          How?
                        </a>
                      </p>
                    </div>

                    {/* Existing calendars list */}
                    <div className="space-y-3">
                      <p className="text-[10px] text-text-muted uppercase font-bold tracking-wide">Active External Feed Mappings</p>
                      {calLoading ? (
                        <div className="text-xs text-text-muted p-4 text-center animate-pulse">Loading calendars...</div>
                      ) : customCals.length === 0 ? (
                        <div className="text-xs text-center p-8 border border-dashed border-border rounded-lg text-text-muted">
                          No external calendars added yet.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {customCals.map(c => (
                            <div key={c.id} className="p-3 bg-bg border border-border rounded-lg">
                              {editingId === c.id ? (
                                <div className="space-y-2">
                                  <input
                                    className="w-full bg-surface border border-border text-xs rounded-lg p-2 outline-none focus:border-primary"
                                    value={editForm.name}
                                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="Calendar Name"
                                  />
                                  <input
                                    className="w-full bg-surface border border-border text-xs rounded-lg p-2 outline-none focus:border-primary"
                                    value={editForm.icsUrl}
                                    onChange={e => setEditForm(f => ({ ...f, icsUrl: e.target.value }))}
                                    placeholder="ICS URL"
                                  />
                                  <div className="flex gap-2">
                                    <button onClick={handleSaveEdit} className="bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:opacity-90">Save</button>
                                    <button onClick={() => setEditingId(null)} className="text-text-muted text-xs px-3 py-1.5 rounded-lg hover:bg-border">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="text-xs font-bold flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full border" style={{ background: c.color || OUTLOOK_COLOR, borderColor: (c.color || OUTLOOK_COLOR) + '88' }} />
                                        <span>{c.name}</span>
                                        <span className="text-[10px] text-primary">ICS</span>
                                        {c.sharing && c.sharing !== 'private' && (
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${c.sharing === 'full' ? 'border-amber-500/30 text-amber-400' : c.sharing === 'titles' ? 'border-blue-500/30 text-blue-400' : 'border-green-500/30 text-green-400'}`}>
                                            {c.sharing === 'busy' ? 'Shared busy' : c.sharing === 'titles' ? 'Shared titles' : 'Shared fully'}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => startEdit(c)}
                                        className="text-text-muted hover:text-text p-1.5 text-xs"
                                        title="Edit"
                                      >✎</button>
                                      <button
                                        onClick={() => handleDeleteCal(c.id)}
                                        className="text-text-muted hover:text-red-400 p-1.5 text-xs"
                                        title="Remove"
                                      >✕</button>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50 items-center">
                                    {(() => {
                                      const isStaging = stagedIcsColor?.id === c.id
                                      const displayColor = isStaging ? stagedIcsColor.color : (c.color || '')
                                      return <>
                                        {BRAND_PALETTE.slice(0, 12).map(hex => (
                                          <button
                                            key={hex}
                                            title={hex}
                                            onClick={() => setStagedIcsColor({ id: c.id, color: hex })}
                                            className="w-4 h-4 rounded hover:scale-125"
                                            style={{
                                              background: hex,
                                              border: displayColor === hex ? '2px solid white' : 'none',
                                              opacity: displayColor === hex ? 1 : 0.7,
                                            }}
                                          />
                                        ))}
                                        <label
                                          className="w-4 h-4 rounded border border-dashed border-text-muted/40 hover:border-text-muted cursor-pointer flex items-center justify-center text-[8px] text-text-muted hover:scale-125"
                                          title="Custom color"
                                        >
                                          +
                                          <input
                                            type="color"
                                            value={displayColor || OUTLOOK_COLOR}
                                            onChange={e => setStagedIcsColor({ id: c.id, color: e.target.value })}
                                            className="sr-only"
                                          />
                                        </label>
                                        {(displayColor || isStaging) && (
                                          <button
                                            onClick={() => setStagedIcsColor({ id: c.id, color: '' })}
                                            className="text-[9px] text-text-muted hover:text-text px-1"
                                            title="Reset to default"
                                          >reset</button>
                                        )}
                                        {isStaging && (
                                          <div className="flex gap-1 ml-auto">
                                            <button
                                              onClick={() => setStagedIcsColor(null)}
                                              className="text-[9px] px-2 py-0.5 rounded border border-border text-text-muted hover:bg-border/30"
                                            >Cancel</button>
                                            <button
                                              onClick={() => { handleColorChange(c.id, stagedIcsColor.color); setStagedIcsColor(null) }}
                                              className="text-[9px] px-2 py-0.5 rounded bg-primary text-white font-bold hover:opacity-90"
                                            >Apply</button>
                                          </div>
                                        )}
                                      </>
                                    })()}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span className="text-[9px] text-text-muted">Sharing:</span>
                                    <select
                                      value={c.sharing ?? 'private'}
                                      onChange={async (e) => {
                                        setCustomCals(prev => prev.map(cal => cal.id === c.id ? { ...cal, sharing: e.target.value } : cal))
                                        await fetch('/api/settings/calendars', {
                                          method: 'PUT',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ id: c.id, sharing: e.target.value }),
                                        })
                                      }}
                                      className="bg-bg border border-border rounded text-[10px] px-1.5 py-0.5 outline-none"
                                    >
                                      <option value="private">Private</option>
                                      <option value="busy">Busy only</option>
                                      <option value="titles">Titles</option>
                                      <option value="full">Full details</option>
                                    </select>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {activeTab === 'templates' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-text-muted uppercase font-bold tracking-wide">Booking Templates</p>
                <button
                  onClick={() => {
                    setEditingTemplate('new')
                    setExpandedTemplateId('new')
                  }}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg bg-primary text-white hover:opacity-90"
                >+ New</button>
              </div>

              {templatesLoading ? (
                <p className="text-xs text-text-muted text-center py-4 animate-pulse">Loading...</p>
              ) : (
                <>
                  {/* New template card */}
                  {editingTemplate === 'new' && expandedTemplateId === 'new' && (
                    <div className="border border-border rounded-xl overflow-hidden mb-2">
                      <button
                        onClick={() => guardedClose(() => { setEditingTemplate(null); setExpandedTemplateId(null) })}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-border/20 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">New Template</span>
                        </div>
                        <span className="text-text-muted text-xs">▼</span>
                      </button>
                      <div className="border-t border-border">
                        <div className="p-4">
                          <BookingTemplateEditor
                            ref={templateEditorRef}
                            template={null}
                            connections={connections}
                            onSave={async () => {
                              setEditingTemplate(null)
                              setExpandedTemplateId(null)
                              const res = await fetch('/api/settings/templates')
                              setTemplates(await res.json())
                            }}
                            onCancel={() => guardedClose(() => { setEditingTemplate(null); setExpandedTemplateId(null) })}
                            azureConfigured={azureConfigured}
                            googleConfigured={googleConfigured}
                            zoomConfigured={zoomConfigured}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {templates.length === 0 && editingTemplate !== 'new' ? (
                    <p className="text-xs text-text-muted text-center py-8 border border-dashed border-border rounded-lg">No templates yet. Create one to enable booking on shared links.</p>
                  ) : (
                    <div className="space-y-2">
                      {templates.map(t => {
                        const isExpanded = expandedTemplateId === t.id
                        return (
                          <div key={t.id} className="border border-border rounded-xl overflow-hidden">
                            <button
                              onClick={() => {
                                if (isExpanded) {
                                  guardedClose(() => setExpandedTemplateId(null))
                                } else {
                                  setExpandedTemplateId(t.id)
                                }
                              }}
                              className="w-full flex items-center justify-between px-4 py-3 hover:bg-border/20 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold">{t.name}</span>
                                <span className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5">{t.duration_minutes} min{t.buffer_minutes ? ` + ${t.buffer_minutes} buffer` : ''}</span>
                                <span className={`text-[10px] font-bold ${t.active !== false ? 'text-green-400' : 'text-red-400'}`}>
                                  {t.active !== false ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              <span className="text-text-muted text-xs">{isExpanded ? '▼' : '▶'}</span>
                            </button>
                            {isExpanded && (
                              <div className="border-t border-border">
                                <div className="p-4">
                                  <BookingTemplateEditor
                                    ref={templateEditorRef}
                                    template={t}
                                    connections={connections}
                                    onSave={async () => {
                                      setExpandedTemplateId(null)
                                      const res = await fetch('/api/settings/templates')
                                      setTemplates(await res.json())
                                    }}
                                    onCancel={() => guardedClose(() => setExpandedTemplateId(null))}
                                    onCopy={async () => {
                                      await fetch('/api/settings/templates', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, duplicate: true }) })
                                      const res = await fetch('/api/settings/templates')
                                      const updated = await res.json()
                                      setTemplates(updated)
                                      // Open the new copy (last template with "(copy)" in name)
                                      const copy = [...updated].reverse().find((x: { name: string }) => x.name.includes('(copy)'))
                                      setExpandedTemplateId(copy?.id ?? null)
                                    }}
                                    onDelete={() => {
                                      showConfirm('Delete this template?', async () => {
                                        await fetch('/api/settings/templates', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id }) })
                                        setTemplates(prev => prev.filter(x => x.id !== t.id))
                                        setExpandedTemplateId(null)
                                      }, { confirmLabel: 'Delete', destructive: true })
                                    }}
                                    azureConfigured={azureConfigured}
                                    googleConfigured={googleConfigured}
                                    zoomConfigured={zoomConfigured}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'colors' && (
            <div className="space-y-4">
              <p className="text-[10px] text-text-muted uppercase font-bold tracking-wide">Activity Group Colors</p>
              <p className="text-xs text-text-muted">Click a row to change its color. Colors sync across all your devices.</p>
              <ColorOverridesPanel
                classGroups={classGroups}
                connections={connections}
                overrides={colorOverrides}
                mode="user"
                onSave={async (code, color, connId) => {
                  await fetch('/api/settings/colors', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ classGroupCode: code, color, connectionId: connId }),
                  })
                  onColorOverridesChange()
                }}
                onDelete={async (code, connId) => {
                  await fetch('/api/settings/colors', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ classGroupCode: code, connectionId: connId }),
                  })
                  onColorOverridesChange()
                }}
              />
            </div>
          )}
        </div>

      </div>
      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          destructive={confirmState.destructive}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}
