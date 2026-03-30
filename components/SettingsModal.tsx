'use client'
import { useState, useEffect, useRef } from 'react'
import { ActivityClassGroup } from '@/types'
import { BRAND_PALETTE, OUTLOOK_COLOR, FALLBACK_COLOR, saveColorOverride } from '@/lib/activityColors'

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
  colorMap: Map<string, string>          // classGroupCode → current hex
  persons: { code: string; name: string }[] // For ICS assignment
  error?: string | null
  onClose: () => void
  onColorChange: (groupCode: string, color: string) => void
  onReload?: () => void
}

type Tab = 'style' | 'calendars'

export default function SettingsModal({ classGroups, colorMap, persons, error, onClose, onColorChange, onReload }: Props) {
  const [theme, setTheme] = useState<Theme>('system')
  const [activeTab, setActiveTab] = useState<Tab>('style')
  const [customCals, setCustomCals] = useState<any[]>([])
  const [calLoading, setCalLoading] = useState(false)
  const [newCal, setNewCal] = useState({ personCode: '', name: '', icsUrl: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', icsUrl: '', personCode: '', color: '' })
  const swipeStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('theme')
      setTheme(stored === 'light' ? 'light' : stored === 'dark' ? 'dark' : 'system')
    } catch {}
  }, [])

  useEffect(() => {
    if (activeTab === 'calendars') {
      fetchCustomCals()
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
      }
    } catch (e) {
      console.error('Failed to add calendar:', e)
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

  function startEdit(cal: any) {
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
              onClick={() => setActiveTab('calendars')}
              className={`pb-2 px-1 ${activeTab === 'calendars' ? 'border-b-2 border-primary text-primary font-bold' : 'text-text-muted hover:text-text'}`}
            >
              Calendars
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

              {/* Fixed sources */}
              <div className="space-y-2">
                <p className="text-[10px] text-text-muted uppercase font-bold tracking-wide">Source colors (fixed)</p>
                <div className="flex gap-4 p-3 bg-bg rounded-lg border border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: OUTLOOK_COLOR, background: OUTLOOK_COLOR + '33' }} />
                    <span className="text-xs">Outlook / Teams</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: FALLBACK_COLOR, background: FALLBACK_COLOR + '33' }} />
                    <span className="text-xs text-text-muted">Direct herbe entry</span>
                  </div>
                </div>
              </div>

              {/* Class groups */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-text-muted uppercase font-bold tracking-wide">Activity Group Palette</p>
                  {onReload && (
                    <button onClick={onReload} className="text-[10px] text-primary hover:underline" title="Reload types & groups from Herbe">
                      ↻ Sync Herbe
                    </button>
                  )}
                </div>
                {error && (
                  <p className="text-xs text-red-400 font-mono bg-red-900/20 rounded p-2 break-all">{error}</p>
                )}
                {!error && classGroups.length === 0 && (
                  <p className="text-sm text-text-muted">No class groups loaded yet.</p>
                )}
                <div className="space-y-3">
                  {classGroups.map(g => {
                    const current = colorMap.get(g.code) ?? FALLBACK_COLOR
                    return (
                      <div key={g.code} className="p-3 bg-bg rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: current }} />
                          <span className="text-xs font-bold">{g.name || g.code}</span>
                          <span className="text-[10px] text-text-muted font-mono">{g.code}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {BRAND_PALETTE.map(hex => (
                            <button
                              key={hex}
                              title={hex}
                              onClick={() => {
                                saveColorOverride(g.code, hex)
                                onColorChange(g.code, hex)
                              }}
                              className="w-5 h-5 rounded-md hover:scale-110"
                              style={{
                                background: hex,
                                border: current === hex ? `2px solid white` : 'none',
                                opacity: current === hex ? 1 : 0.8,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {activeTab === 'calendars' && (
            <div className="space-y-6">
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
                  <button
                    type="submit"
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
                            <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50">
                              {BRAND_PALETTE.slice(0, 12).map(hex => (
                                <button
                                  key={hex}
                                  title={hex}
                                  onClick={() => handleColorChange(c.id, hex)}
                                  className="w-4 h-4 rounded hover:scale-125"
                                  style={{
                                    background: hex,
                                    border: (c.color || '') === hex ? '2px solid white' : 'none',
                                    opacity: (c.color || '') === hex ? 1 : 0.7,
                                  }}
                                />
                              ))}
                              {c.color && (
                                <button
                                  onClick={() => handleColorChange(c.id, '')}
                                  className="text-[9px] text-text-muted hover:text-text px-1"
                                  title="Reset to default"
                                >reset</button>
                              )}
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

        <div className="p-4 border-t border-border">
          <button onClick={onClose} className="w-full bg-primary text-white font-bold py-2.5 rounded-lg">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
