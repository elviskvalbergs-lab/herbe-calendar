'use client'
import { useState, useEffect, useRef } from 'react'
import { ActivityClassGroup } from '@/types'
import type { BookingTemplate, UserGoogleAccount } from '@/types'
import { BRAND_PALETTE, OUTLOOK_COLOR, FALLBACK_COLOR } from '@/lib/activityColors'
import ColorOverridesPanel from './ColorOverridesPanel'
import type { ColorOverrideRow } from '@/lib/activityColors'
import BookingTemplateEditor from './BookingTemplateEditor'
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
}

type Tab = 'style' | 'colors' | 'integrations' | 'templates'


export default function SettingsModal({ classGroups, colorMap, persons, connections, colorOverrides, error, onClose, onColorChange, onColorOverridesChange }: Props) {
  const [theme, setTheme] = useState<Theme>('system')
  const [activeTab, setActiveTab] = useState<Tab>('style')
  interface CustomCalendar { id: string; personCode: string; name: string; icsUrl: string; color?: string }
  const [customCals, setCustomCals] = useState<CustomCalendar[]>([])
  const [calLoading, setCalLoading] = useState(false)
  const [googleAccounts, setGoogleAccounts] = useState<UserGoogleAccount[]>([])
  const [googleLoading, setGoogleLoading] = useState(false)
  const [newCal, setNewCal] = useState({ personCode: '', name: '', icsUrl: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', icsUrl: '', personCode: '', color: '' })
  const [templates, setTemplates] = useState<BookingTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<BookingTemplate | null | 'new'>(null)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const { confirmState, confirm: showConfirm, handleConfirm, handleCancel } = useConfirm()
  const [calError, setCalError] = useState<string | null>(null)
  const [stagedIcsColor, setStagedIcsColor] = useState<{ id: string; color: string } | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('theme')
      setTheme(stored === 'light' ? 'light' : stored === 'dark' ? 'dark' : 'system')
    } catch {}
  }, [])

  // ESC: close template editor first, then the whole modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editingTemplate) {
        e.stopPropagation()
        setEditingTemplate(null)
      }
    }
    window.addEventListener('keydown', handler, true) // capture phase to fire before CalendarShell
    return () => window.removeEventListener('keydown', handler, true)
  }, [editingTemplate])

  useEffect(() => {
    if (activeTab === 'integrations') {
      fetchCustomCals()
      setGoogleLoading(true)
      fetch('/api/google/calendars').then(r => r.ok ? r.json() : []).then(setGoogleAccounts).catch(() => {}).finally(() => setGoogleLoading(false))
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
    if (!newCal.personCode || !newCal.name || !newCal.icsUrl) return
    try {
      const res = await fetch('/api/settings/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCal)
      })
      if (res.ok) {
        setNewCal({ personCode: '', name: '', icsUrl: '' })
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
    setEditForm({ name: cal.name, icsUrl: cal.icsUrl, personCode: cal.personCode, color: cal.color || '' })
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative bg-surface border border-border shadow-2xl rounded-t-2xl sm:rounded-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden"
        onTouchStart={e => { swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
        onTouchEnd={e => {
          if (swipeStart.current !== null) {
            const dx = e.changedTouches[0].clientX - swipeStart.current.x
            const dy = e.changedTouches[0].clientY - swipeStart.current.y
            if (dy > 80 && dy > Math.abs(dx)) onClose()
            else if (dx < -80 && Math.abs(dx) > Math.abs(dy)) onClose()
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
            <button onClick={onClose} className="text-text-muted text-xl leading-none hover:text-text">✕</button>
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
            <div className="space-y-6">
              {/* Google Accounts */}
              <div className="mb-6">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-wide mb-3">Google Calendar</h3>
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

              <div className="h-px bg-border my-4" />

              {/* ICS Feeds */}
              <h3 className="text-xs font-bold text-text-muted uppercase tracking-wide mb-3">ICS Calendar Feeds</h3>

              {/* Add New Calendar */}
              <div className="space-y-3 p-4 bg-bg rounded-lg border border-border">
                <h4 className="text-xs font-bold flex items-center gap-2">
                  + Add External Calendar (ICS)
                </h4>
                <form onSubmit={handleAddCal} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="bg-surface border border-border text-xs rounded-lg p-2 outline-none focus:border-primary"
                      value={newCal.personCode}
                      onChange={e => setNewCal(p => ({ ...p, personCode: e.target.value }))}
                      required
                    >
                      <option value="" disabled>Select Person...</option>
                      {persons.map(p => (
                        <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                      ))}
                    </select>
                    <input
                      className="bg-surface border border-border text-xs rounded-lg p-2 outline-none focus:border-primary"
                      placeholder="Calendar Name (e.g. Work)"
                      value={newCal.name}
                      onChange={e => setNewCal(p => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </div>
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
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                className="bg-surface border border-border text-xs rounded-lg p-2 outline-none focus:border-primary"
                                value={editForm.personCode}
                                onChange={e => setEditForm(f => ({ ...f, personCode: e.target.value }))}
                              >
                                {persons.map(p => (
                                  <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                                ))}
                              </select>
                              <input
                                className="bg-surface border border-border text-xs rounded-lg p-2 outline-none focus:border-primary"
                                value={editForm.name}
                                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="Calendar Name"
                              />
                            </div>
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
                                </div>
                                <div className="text-[10px] text-text-muted mt-0.5">
                                  Assigned to: <span className="text-text font-bold">{persons.find(p => p.code === c.personCode)?.name || c.personCode}</span>
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
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'templates' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-text-muted uppercase font-bold tracking-wide">Booking Templates</p>
                <button onClick={() => setEditingTemplate('new')} className="text-xs font-bold px-2.5 py-1 rounded-lg bg-primary text-white hover:opacity-90">+ New</button>
              </div>
              {templatesLoading ? (
                <p className="text-xs text-text-muted text-center py-4 animate-pulse">Loading...</p>
              ) : templates.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-8 border border-dashed border-border rounded-lg">No templates yet. Create one to enable booking on shared links.</p>
              ) : (
                <div className="space-y-2">
                  {templates.map(t => (
                    <div key={t.id} className="p-3 bg-bg border border-border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold">{t.name}</p>
                          <p className="text-[10px] text-text-muted">{t.duration_minutes} min{t.linked_share_links?.length ? ` · Used in ${t.linked_share_links.length} link${t.linked_share_links.length > 1 ? 's' : ''}` : ''}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingTemplate(t)} className="text-[10px] text-text-muted hover:text-text px-1.5 py-0.5 rounded border border-border hover:bg-border/30">Edit</button>
                          <button onClick={async () => {
                            await fetch('/api/settings/templates', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id: t.id, duplicate: true }) })
                            const res = await fetch('/api/settings/templates'); setTemplates(await res.json())
                          }} className="text-[10px] text-text-muted hover:text-text px-1.5 py-0.5 rounded border border-border hover:bg-border/30">Copy</button>
                          <button onClick={() => {
                            showConfirm('Delete this template?', async () => {
                              await fetch('/api/settings/templates', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id: t.id }) })
                              setTemplates(prev => prev.filter(x => x.id !== t.id))
                            }, { confirmLabel: 'Delete', destructive: true })
                          }} className="text-[10px] text-text-muted hover:text-red-400 px-1.5 py-0.5 rounded border border-border hover:border-red-400/30">Del</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {editingTemplate && (
                <BookingTemplateEditor
                  template={editingTemplate === 'new' ? null : editingTemplate}
                  connections={connections}
                  onSave={async () => {
                    setEditingTemplate(null)
                    const res = await fetch('/api/settings/templates'); setTemplates(await res.json())
                  }}
                  onCancel={() => setEditingTemplate(null)}
                />
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

        <div className="p-4 border-t border-border">
          <button onClick={onClose} className="w-full bg-primary text-white font-bold py-2.5 rounded-lg">
            Done
          </button>
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
