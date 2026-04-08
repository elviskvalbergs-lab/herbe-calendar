'use client'
import { useState } from 'react'

interface Token {
  id: string
  name: string
  scope: 'account' | 'super'
  created_by: string
  created_at: string
  last_used: string | null
  expires_at: string | null
  revoked_at: string | null
}

export default function TokensClient({ tokens: initial, isSuperAdmin }: { tokens: Token[]; isSuperAdmin?: boolean }) {
  const [tokens, setTokens] = useState(initial)
  const [showCreate, setShowCreate] = useState(false)
  const [revealedToken, setRevealedToken] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', scope: 'account' as 'account' | 'super', expiresAt: '' })
  const [saving, setSaving] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function createToken() {
    if (!form.name.trim()) return
    setSaving(true)
    const res = await fetch('/api/admin/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        scope: form.scope,
        expiresAt: form.expiresAt || undefined,
      }),
    })
    if (res.ok) {
      const { id, token } = await res.json()
      setRevealedToken(token)
      setTokens(prev => [{
        id,
        name: form.name.trim(),
        scope: form.scope,
        created_by: '',
        created_at: new Date().toISOString(),
        last_used: null,
        expires_at: form.expiresAt || null,
        revoked_at: null,
      }, ...prev])
      setForm({ name: '', scope: 'account', expiresAt: '' })
      setShowCreate(false)
    }
    setSaving(false)
  }

  async function revokeToken(id: string) {
    setRevoking(id)
    const res = await fetch('/api/admin/tokens', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      setTokens(prev => prev.map(t => t.id === id ? { ...t, revoked_at: new Date().toISOString() } : t))
    }
    setRevoking(null)
  }

  function tokenStatus(t: Token): 'active' | 'expired' | 'revoked' {
    if (t.revoked_at) return 'revoked'
    if (t.expires_at && new Date(t.expires_at) < new Date()) return 'expired'
    return 'active'
  }

  function statusBadge(status: 'active' | 'expired' | 'revoked') {
    const cls = status === 'active'
      ? 'bg-green-500/10 text-green-500'
      : status === 'expired'
        ? 'bg-red-500/10 text-red-500'
        : 'bg-border/30 text-text-muted'
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cls}`}>{status}</span>
  }

  function scopeBadge(scope: string) {
    const cls = scope === 'super'
      ? 'bg-amber-500/10 text-amber-500'
      : 'bg-blue-500/10 text-blue-500'
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cls}`}>{scope}</span>
  }

  function formatDate(d: string | null) {
    if (!d) return '—'
    const date = new Date(d)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    if (diffMs > 0 && diffMs < 86400000) {
      const hrs = Math.floor(diffMs / 3600000)
      if (hrs === 0) return `${Math.floor(diffMs / 60000)}m ago`
      return `${hrs}h ago`
    }
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
  }

  return (
    <div>
      {/* Token reveal modal */}
      {revealedToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setRevealedToken(null)} />
          <div className="relative bg-surface border border-border rounded-2xl p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="font-bold text-sm">Token Created</h3>
            <p className="text-xs text-text-muted">Copy this token now. It won&apos;t be shown again.</p>
            <div className="flex items-center gap-2 bg-bg border border-border rounded-lg p-3">
              <code className="text-xs font-mono flex-1 break-all select-all">{revealedToken}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(revealedToken); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                className="shrink-0 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button onClick={() => setRevealedToken(null)} className="w-full py-2 text-xs text-text-muted hover:text-text">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      <div className="flex justify-between items-center mb-4">
        <p className="text-xs text-text-muted">Tokens for external BI tools and REST API access</p>
        <button
          onClick={() => setShowCreate(o => !o)}
          className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold"
        >
          {showCreate ? 'Cancel' : '+ Create Token'}
        </button>
      </div>

      {showCreate && (
        <div className="bg-surface border border-border rounded-xl p-4 space-y-3 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-[10px] text-text-muted uppercase block mb-0.5">Name</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') createToken() }}
                placeholder="e.g. Power BI Import"
                className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm"
                autoFocus
              />
            </div>
            {isSuperAdmin && (
              <div>
                <label className="text-[10px] text-text-muted uppercase block mb-0.5">Scope</label>
                <select
                  value={form.scope}
                  onChange={e => setForm(f => ({ ...f, scope: e.target.value as 'account' | 'super' }))}
                  className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="account">Account</option>
                  <option value="super">Super (all accounts)</option>
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <label className="text-[10px] text-text-muted uppercase block mb-0.5">Expires (optional)</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
            <button
              onClick={createToken}
              disabled={saving || !form.name.trim()}
              className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-bold disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Token'}
            </button>
          </div>
        </div>
      )}

      {/* Tokens table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-muted">
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Scope</th>
              <th className="px-4 py-2 hidden md:table-cell">Created</th>
              <th className="px-4 py-2 hidden md:table-cell">Last Used</th>
              <th className="px-4 py-2 hidden sm:table-cell">Expires</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-text-muted">No API tokens yet</td></tr>
            )}
            {tokens.map(t => {
              const status = tokenStatus(t)
              return (
                <tr
                  key={t.id}
                  className={`border-b border-border/30 transition-colors hover:bg-border/20 ${status !== 'active' ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-2 font-medium">{t.name}</td>
                  <td className="px-4 py-2">{scopeBadge(t.scope)}</td>
                  <td className="px-4 py-2 hidden md:table-cell text-xs text-text-muted">
                    {t.created_by.split('@')[0]} · {formatDate(t.created_at)}
                  </td>
                  <td className="px-4 py-2 hidden md:table-cell text-xs text-text-muted">{t.last_used ? formatDate(t.last_used) : 'Never'}</td>
                  <td className="px-4 py-2 hidden sm:table-cell text-xs text-text-muted">
                    {t.expires_at ? formatDate(t.expires_at) : '—'}
                  </td>
                  <td className="px-4 py-2">{statusBadge(status)}</td>
                  <td className="px-4 py-2">
                    {status === 'active' && (
                      <button
                        onClick={() => revokeToken(t.id)}
                        disabled={revoking === t.id}
                        className="text-[10px] font-bold px-2 py-0.5 rounded border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
