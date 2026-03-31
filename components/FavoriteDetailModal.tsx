'use client'
import { useState, useEffect } from 'react'
import type { Favorite, ShareLink, ShareVisibility } from '@/types'
import { loadShareLinks, createShareLink, removeShareLink, removeAllShareLinks } from '@/lib/shareLinks'

interface Props {
  favorite: Favorite
  open: boolean
  onClose: () => void
}

const visibilityLabel: Record<ShareVisibility, string> = {
  busy: 'Busy/Available',
  titles: 'Titles only',
  full: 'Full details',
}

export default function FavoriteDetailModal({ favorite, open, onClose }: Props) {
  const [links, setLinks] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [newName, setNewName] = useState('')
  const [newVisibility, setNewVisibility] = useState<ShareVisibility>('busy')
  const [newExpiry, setNewExpiry] = useState('')
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    loadShareLinks(favorite.id).then(data => {
      setLinks(data)
      setLoading(false)
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
    setLinks(prev => [link, ...prev])
    setNewName('')
    setNewVisibility('busy')
    setNewExpiry('')
    setNewPassword('')
    setShowForm(false)
    setCreating(false)
  }

  async function handleDelete(id: string) {
    setLinks(prev => prev.filter(l => l.id !== id))
    await removeShareLink(id)
  }

  async function handleDeleteAll() {
    if (!confirm('Remove all sharing links for this favorite?')) return
    setLinks([])
    await removeAllShareLinks(favorite.id)
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
            </div>
            <p className="text-[10px] text-text-muted mt-1.5">
              {link.accessCount === 0
                ? 'Never accessed'
                : `Accessed ${link.accessCount} time${link.accessCount !== 1 ? 's' : ''} · Last: ${new Date(link.lastAccessedAt!).toLocaleDateString()}`
              }
            </p>
          </div>
        ))}

        {/* New link form */}
        {showForm ? (
          <form onSubmit={handleCreate} className="border border-border rounded-lg p-3 mt-1">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Who is this for?"
              className="w-full bg-transparent border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary mb-2"
            />
            <select
              value={newVisibility}
              onChange={e => setNewVisibility(e.target.value as ShareVisibility)}
              className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary mb-2"
            >
              <option value="busy">Busy/Available only</option>
              <option value="titles">Show titles</option>
              <option value="full">Full details</option>
            </select>
            <input
              type="date"
              value={newExpiry}
              onChange={e => setNewExpiry(e.target.value)}
              className="w-full bg-transparent border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary mb-2"
              placeholder="Expiration date (optional)"
            />
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
