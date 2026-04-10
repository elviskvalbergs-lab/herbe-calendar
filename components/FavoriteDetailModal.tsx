'use client'
import { useState, useEffect } from 'react'
import type { Favorite, ShareLink, ShareVisibility, BookingTemplate } from '@/types'
import { loadShareLinks, createShareLink, removeShareLink, removeAllShareLinks, updateShareLink } from '@/lib/shareLinks'

interface Props {
  favorite: Favorite
  open: boolean
  onClose: () => void
  onLinksChange?: (favoriteId: string, count: number) => void
}

const visibilityLabel: Record<ShareVisibility, string> = {
  busy: 'Busy/Available',
  titles: 'Titles only',
  full: 'Full details',
}

function FieldLabel({ label, info }: { label: string; info: string }) {
  const [showInfo, setShowInfo] = useState(false)
  return (
    <label className="text-[10px] text-text-muted uppercase font-bold tracking-wide mb-1 flex items-center gap-1">
      {label}
      <span
        className="relative cursor-help text-text-muted/50 hover:text-text-muted normal-case font-normal"
        onMouseEnter={() => setShowInfo(true)}
        onMouseLeave={() => setShowInfo(false)}
        onClick={() => setShowInfo(s => !s)}
      >
        (i)
        {showInfo && (
          <span className="absolute left-0 bottom-full mb-1 z-50 bg-surface border border-border rounded-lg shadow-lg px-2.5 py-1.5 text-[10px] text-text normal-case font-normal tracking-normal w-48 whitespace-normal">
            {info}
          </span>
        )}
      </span>
    </label>
  )
}

export default function FavoriteDetailModal({ favorite, open, onClose, onLinksChange }: Props) {
  const [links, setLinks] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [newName, setNewName] = useState('')
  const [newVisibility, setNewVisibility] = useState<ShareVisibility>('busy')
  const [newExpiry, setNewExpiry] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editVisibility, setEditVisibility] = useState<ShareVisibility>('busy')
  const [editExpiry, setEditExpiry] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editRemovePassword, setEditRemovePassword] = useState(false)
  const [editBookingEnabled, setEditBookingEnabled] = useState(false)
  const [editTemplateIds, setEditTemplateIds] = useState<string[]>([])
  const [availableTemplates, setAvailableTemplates] = useState<BookingTemplate[]>([])

  useEffect(() => {
    if (!open) return
    fetch('/api/settings/templates').then(r => r.json()).then(data => {
      setAvailableTemplates(Array.isArray(data) ? data : [])
    }).catch(() => {})
  }, [open])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    loadShareLinks(favorite.id).then(data => {
      setLinks(data)
      setLoading(false)
      onLinksChange?.(favorite.id, data.length)
    })
  }, [open, favorite.id])

  if (!open) return null

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    const link = await createShareLink({
      favoriteId: favorite.id,
      name: newName.trim(),
      visibility: newVisibility,
      expiresAt: newExpiry || undefined,
      password: newPassword || undefined,
    })
    setLinks(prev => {
      const updated = [link, ...prev]
      onLinksChange?.(favorite.id, updated.length)
      return updated
    })
    setNewName('')
    setNewVisibility('busy')
    setNewExpiry('')
    setNewPassword('')
    setShowForm(false)
    setCreating(false)
  }

  async function handleDelete(id: string) {
    setLinks(prev => {
      const updated = prev.filter(l => l.id !== id)
      onLinksChange?.(favorite.id, updated.length)
      return updated
    })
    await removeShareLink(id)
  }

  async function handleDeleteAll() {
    if (!confirm('Remove all sharing links for this favorite?')) return
    setLinks([])
    onLinksChange?.(favorite.id, 0)
    await removeAllShareLinks(favorite.id)
  }

  function startEdit(link: ShareLink) {
    setEditingId(link.id)
    setEditName(link.name)
    setEditVisibility(link.visibility)
    setEditExpiry(link.expiresAt ? new Date(link.expiresAt).toISOString().slice(0, 10) : '')
    setEditPassword('')
    setEditRemovePassword(false)
    setEditBookingEnabled(link.bookingEnabled ?? false)
    setEditTemplateIds(link.templateIds ?? [])
  }

  function cancelEdit() {
    setEditingId(null)
    setEditPassword('')
    setEditRemovePassword(false)
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId) return
    const passwordPayload = editRemovePassword ? { password: '' } : (editPassword !== '' ? { password: editPassword } : {})
    const updated = await updateShareLink(editingId, {
      name: editName,
      visibility: editVisibility,
      expiresAt: editExpiry || null,
      ...passwordPayload,
      bookingEnabled: editBookingEnabled,
      templateIds: editTemplateIds,
    })
    setLinks(prev => prev.map(l => l.id === editingId ? updated : l))
    setEditingId(null)
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/share/${token}`)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  function openLink(token: string) {
    window.open(`/share/${token}`, '_blank')
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative mb-1">
          <h2 className="text-lg font-bold pr-8">{favorite.name}</h2>
          <p className="text-xs text-text-muted">
            {favorite.view === 'day' ? 'Day' : favorite.view === '3day' ? '3-day' : '5-day'} view
            {' · '}{favorite.personCodes.length} person{favorite.personCodes.length !== 1 ? 's' : ''}
            {' · '}{favorite.personCodes.join(', ')}
          </p>
          {favorite.hiddenCalendars && favorite.hiddenCalendars.length > 0 && (
            <p className="text-[10px] text-text-muted mt-0.5">
              Hidden: {favorite.hiddenCalendars.join(', ')}
            </p>
          )}
          <button
            onClick={onClose}
            className="absolute top-0 right-0 text-text-muted hover:text-primary text-sm leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="h-px bg-border my-3" />

        {/* Sharing links section */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">Sharing links</span>
          {links.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="text-[10px] text-red-400 hover:text-red-300"
            >
              Remove all
            </button>
          )}
        </div>

        {loading && <p className="text-xs text-text-muted py-2">Loading…</p>}

        {!loading && links.map(link => (
          <div key={link.id} className="relative border border-border rounded-lg p-3 mb-2">
            {editingId === link.id ? (
              <form onSubmit={handleUpdate}>
                <FieldLabel label="Link name" info="A label to help you remember who this link is shared with." />
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="e.g. Team lead, Client X"
                  className="w-full bg-transparent border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary mb-3"
                />
                <FieldLabel label="Visibility" info="Controls how much detail viewers can see. 'Busy' hides all info — viewers only see blocked time. 'Titles' shows event names. 'Full' shows all details including project, customer, and attendees." />
                <select
                  value={editVisibility}
                  onChange={e => setEditVisibility(e.target.value as ShareVisibility)}
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary mb-3"
                >
                  <option value="busy">Busy/Available only</option>
                  <option value="titles">Show titles</option>
                  <option value="full">Full details</option>
                </select>
                <FieldLabel label="Expiration" info="The link will stop working after this date. Leave empty for no expiration." />
                <input
                  type="date"
                  value={editExpiry}
                  onChange={e => setEditExpiry(e.target.value)}
                  className="w-full bg-transparent border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary mb-3"
                />
                <FieldLabel label="Password" info="If set, viewers must enter this password before seeing the calendar. Password-protected links cannot be used as ICS subscriptions or for booking." />
                {link.hasPassword && (
                  <label className="flex items-center gap-2 text-xs text-text-muted mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editRemovePassword}
                      onChange={e => { setEditRemovePassword(e.target.checked); if (e.target.checked) setEditPassword('') }}
                    />
                    Remove password
                  </label>
                )}
                {!editRemovePassword && (
                  <input
                    type="text"
                    value={editPassword}
                    onChange={e => setEditPassword(e.target.value)}
                    placeholder={link.hasPassword ? 'New password (leave empty to keep current)' : 'Set a password (optional)'}
                    className="w-full bg-transparent border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary mb-3"
                  />
                )}
                {/* Booking toggle */}
                {availableTemplates.length > 0 && (
                  <div className="mb-2 p-2 rounded border border-border bg-bg space-y-2">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editBookingEnabled}
                        onChange={e => setEditBookingEnabled(e.target.checked)}
                      />
                      <span className="font-bold">Enable booking</span>
                    </label>
                    {editBookingEnabled && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-text-muted">Select templates to offer:</p>
                        {availableTemplates.map(t => (
                          <label key={t.id} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editTemplateIds.includes(t.id)}
                              onChange={e => {
                                if (e.target.checked) setEditTemplateIds(prev => [...prev, t.id])
                                else setEditTemplateIds(prev => prev.filter(id => id !== t.id))
                              }}
                            />
                            {t.name} ({t.duration_minutes} min)
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!editName.trim()}
                    className="text-sm px-3 py-1.5 rounded bg-primary text-white hover:opacity-90 disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="text-sm px-3 py-1.5 rounded border border-border text-text-muted hover:text-primary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <button
                  onClick={() => handleDelete(link.id)}
                  className="absolute top-2 right-2 text-text-muted hover:text-red-400 text-xs leading-none"
                  aria-label="Delete link"
                >
                  ✕
                </button>
                <p className="text-sm font-semibold pr-5">{link.name}</p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  {visibilityLabel[link.visibility]}
                  {link.hasPassword && ' · 🔒'}
                  {link.bookingEnabled && ' · 📅 Booking'}
                  {link.expiresAt && ` · Expires ${new Date(link.expiresAt).toLocaleDateString()}`}
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => copyLink(link.token)}
                    className="text-xs px-2 py-1 rounded bg-primary text-white hover:opacity-90"
                  >
                    {copied === link.token ? 'Copied!' : 'Copy link'}
                  </button>
                  <button
                    onClick={() => openLink(link.token)}
                    className="text-xs px-2 py-1 rounded border border-border text-text-muted hover:text-primary"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => startEdit(link)}
                    className="text-xs px-2 py-1 rounded border border-border text-text-muted hover:text-primary"
                  >
                    Edit
                  </button>
                </div>
                <p className="text-[10px] text-text-muted mt-1.5">
                  {link.accessCount === 0
                    ? 'Never accessed'
                    : `Accessed ${link.accessCount} time${link.accessCount !== 1 ? 's' : ''} · Last: ${new Date(link.lastAccessedAt!).toLocaleDateString()}`
                  }
                </p>
              </>
            )}
          </div>
        ))}

        {/* New link form */}
        {showForm ? (
          <form onSubmit={handleCreate} className="border border-border rounded-lg p-3 mt-1">
            <FieldLabel label="Link name" info="A label to help you remember who this link is shared with." />
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Team lead, Client X"
              className="w-full bg-transparent border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary mb-3"
            />
            <FieldLabel label="Visibility" info="Controls how much detail viewers can see. 'Busy' hides all info — viewers only see blocked time. 'Titles' shows event names. 'Full' shows all details including project, customer, and attendees." />
            <select
              value={newVisibility}
              onChange={e => setNewVisibility(e.target.value as ShareVisibility)}
              className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary mb-3"
            >
              <option value="busy">Busy/Available only</option>
              <option value="titles">Show titles</option>
              <option value="full">Full details</option>
            </select>
            <FieldLabel label="Expiration" info="The link will stop working after this date. Leave empty for no expiration." />
            <input
              type="date"
              value={newExpiry}
              onChange={e => setNewExpiry(e.target.value)}
              className="w-full bg-transparent border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary mb-3"
            />
            <FieldLabel label="Password" info="If set, viewers must enter this password before seeing the calendar. Password-protected links cannot be used as ICS subscriptions or for booking." />
            <input
              type="text"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Leave empty for no password"
              className="w-full bg-transparent border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary mb-3"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!newName.trim() || creating}
                className="text-sm px-3 py-1.5 rounded bg-primary text-white hover:opacity-90 disabled:opacity-40"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setNewName(''); setNewVisibility('busy'); setNewExpiry(''); setNewPassword('') }}
                className="text-sm px-3 py-1.5 rounded border border-border text-text-muted hover:text-primary"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full text-left text-sm text-primary font-semibold hover:opacity-80 mt-1 py-1"
          >
            + Generate new link
          </button>
        )}
      </div>
    </div>
  )
}
