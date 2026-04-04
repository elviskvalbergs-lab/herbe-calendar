'use client'
import { useState, useEffect } from 'react'

interface Account {
  id: string
  slug: string
  display_name: string
  created_at: string
  suspended_at: string | null
  member_count: number
}

export default function AccountsClient() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/accounts')
      .then(r => r.json())
      .then(setAccounts)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function createAccount() {
    if (!newName || !newSlug) return
    setSaving(true)
    setError(null)
    const res = await fetch('/api/admin/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, slug: newSlug }),
    })
    if (res.ok) {
      const account = await res.json()
      setAccounts(prev => [...prev, { ...account, member_count: 0 }])
      setNewName('')
      setNewSlug('')
      setShowCreate(false)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to create')
    }
    setSaving(false)
  }

  async function toggleSuspend(id: string, suspend: boolean) {
    await fetch('/api/admin/accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, suspended: suspend }),
    })
    setAccounts(prev => prev.map(a =>
      a.id === id ? { ...a, suspended_at: suspend ? new Date().toISOString() : null } : a
    ))
  }

  if (loading) return <p className="text-sm text-text-muted animate-pulse">Loading accounts...</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-xs text-text-muted">{accounts.length} accounts</span>
        <button
          onClick={() => setShowCreate(o => !o)}
          className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold"
        >
          {showCreate ? 'Cancel' : '+ New Account'}
        </button>
      </div>

      {showCreate && (
        <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold">Create Account</h3>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-text-muted uppercase block mb-0.5">Display Name</label>
              <input value={newName} onChange={e => {
                setNewName(e.target.value)
                if (!newSlug || newSlug === newName.toLowerCase().replace(/[^a-z0-9]+/g, '-')) {
                  setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
                }
              }}
                className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm" placeholder="Acme Corp" />
            </div>
            <div>
              <label className="text-[10px] text-text-muted uppercase block mb-0.5">Slug (URL-safe)</label>
              <input value={newSlug} onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm font-mono" placeholder="acme-corp" />
            </div>
          </div>
          <button onClick={createAccount} disabled={saving || !newName || !newSlug}
            className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold disabled:opacity-50">
            Create
          </button>
        </div>
      )}

      <div className="space-y-2">
        {accounts.map(a => (
          <div key={a.id} className={`bg-surface border border-border rounded-xl p-4 flex items-center justify-between ${a.suspended_at ? 'opacity-60' : ''}`}>
            <div>
              <p className="text-sm font-bold">{a.display_name}</p>
              <p className="text-[10px] text-text-muted font-mono">{a.slug}</p>
              <p className="text-[10px] text-text-muted">{a.member_count} members</p>
            </div>
            <div className="flex items-center gap-2">
              {a.suspended_at && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-500">suspended</span>
              )}
              <button
                onClick={() => toggleSuspend(a.id, !a.suspended_at)}
                className={`text-[10px] font-bold px-3 py-1 rounded-lg border transition-colors ${
                  a.suspended_at
                    ? 'border-green-500/30 text-green-500 hover:bg-green-500/10'
                    : 'border-amber-500/30 text-amber-500 hover:bg-amber-500/10'
                }`}
              >
                {a.suspended_at ? 'Activate' : 'Suspend'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
