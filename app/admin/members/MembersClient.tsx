'use client'
import { useState, useEffect } from 'react'

interface Member {
  email: string
  role: 'admin' | 'member'
  active: boolean
  last_login: string | null
  created_at: string
  person_code_id: number | null
  generated_code: string | null
  display_name: string | null
  source: string | null
  holiday_country: string | null
}

export default function MembersClient({ members: initial, accountId, isSuperAdmin }: { members: Member[]; accountId: string; isSuperAdmin?: boolean }) {
  const [members, setMembers] = useState(initial)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState<'member' | 'admin'>('member')
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [holidayCountries, setHolidayCountries] = useState<{ code: string; name: string }[]>([])

  useEffect(() => {
    fetch('/api/holidays/countries').then(r => r.json()).then(setHolidayCountries).catch(() => {})
  }, [])

  async function addMember() {
    if (!addEmail.includes('@')) return
    setSaving('add')
    const res = await fetch('/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
    })
    if (res.ok) {
      setMembers(prev => [...prev, { email: addEmail.trim(), role: addRole, active: true, last_login: null, created_at: new Date().toISOString(), person_code_id: null, generated_code: null, display_name: null, source: null, holiday_country: null }])
      setAddEmail('')
      setMessage('Member added')
    } else {
      const data = await res.json().catch(() => ({}))
      setMessage(`Failed: ${data.error || res.status}`)
    }
    setSaving(null)
  }

  async function syncUsers() {
    setSyncing(true)
    setMessage(null)
    const res = await fetch('/api/admin/members', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync' }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      const parts = [`Synced ${data.added ?? 0} new members`]
      if (data.deactivated) parts.push(`${data.deactivated} deactivated`)
      if (data.codesProvisioned) parts.push(`${data.codesProvisioned} codes generated`)
      setMessage(parts.join(', '))
      window.location.reload()
    } else {
      setMessage(`Sync failed: ${data.error || res.status}`)
    }
    setSyncing(false)
  }

  const filtered = members.filter(m =>
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    (m.display_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (m.generated_code ?? '').toLowerCase().includes(search.toLowerCase())
  )

  async function toggleRole(email: string, newRole: 'admin' | 'member') {
    setSaving(email)
    const res = await fetch('/api/admin/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role: newRole }),
    })
    if (res.ok) {
      setMembers(prev => prev.map(m => m.email === email ? { ...m, role: newRole } : m))
    }
    setSaving(null)
  }

  async function toggleActive(email: string, active: boolean) {
    setSaving(email)
    const res = await fetch('/api/admin/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, active }),
    })
    if (res.ok) {
      setMembers(prev => prev.map(m => m.email === email ? { ...m, active } : m))
    }
    setSaving(null)
  }

  return (
    <div>
      {message && (
        <div className={`px-4 py-2 rounded-lg text-sm font-bold mb-4 ${message.includes('fail') || message.includes('Failed') ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
          {message}
        </div>
      )}

      {/* Add member + sync */}
      <div className="flex flex-wrap items-end gap-3 mb-4 p-3 bg-surface border border-border rounded-xl">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] text-text-muted uppercase block mb-0.5">Add Member by Email</label>
          <input value={addEmail} onChange={e => setAddEmail(e.target.value)} autoComplete="off"
            onKeyDown={e => { if (e.key === 'Enter') addMember() }}
            placeholder="user@company.com" className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <select value={addRole} onChange={e => setAddRole(e.target.value as 'member' | 'admin')}
          className="bg-bg border border-border rounded-lg px-2 py-1.5 text-sm">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button onClick={addMember} disabled={saving === 'add' || !addEmail.includes('@')}
          className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold disabled:opacity-50">
          Add
        </button>
        <button onClick={syncUsers} disabled={syncing}
          className="px-3 py-1.5 border border-border text-text-muted rounded-lg text-xs font-bold hover:bg-border/30 disabled:opacity-50 ml-auto">
          {syncing ? 'Syncing...' : 'Sync from ERP/Azure'}
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search members..."
          className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
        <span className="text-xs text-text-muted shrink-0">{filtered.length} of {members.length}</span>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="border-b border-border text-left text-xs text-text-muted">
              <th className="px-3 py-2 whitespace-nowrap">Code</th>
              <th className="px-3 py-2 whitespace-nowrap">Name</th>
              <th className="px-3 py-2 whitespace-nowrap">Email</th>
              <th className="px-3 py-2 whitespace-nowrap">Source</th>
              <th className="px-3 py-2 whitespace-nowrap">Role</th>
              <th className="px-3 py-2 whitespace-nowrap">Login</th>
              <th className="px-3 py-2 whitespace-nowrap">Status</th>
              <th className="px-3 py-2 whitespace-nowrap">Holidays</th>
              {isSuperAdmin && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.email} className={`border-b border-border/30 transition-colors hover:bg-border/20 ${!m.active ? 'bg-border/10' : ''}`}>
                <td className="px-3 py-1.5 font-mono text-xs font-bold whitespace-nowrap">{m.generated_code ?? '—'}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{m.display_name ?? m.email.split('@')[0]}</td>
                <td className="px-3 py-1.5 text-text-muted text-xs whitespace-nowrap">{m.email}</td>
                <td className="px-3 py-1.5">
                  <div className="flex gap-1 flex-wrap">
                    {(m.source ?? 'erp').split('+').map(s => (
                      <span key={s} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        s === 'google' ? 'bg-emerald-500/10 text-emerald-500' :
                        s === 'azure' ? 'bg-blue-500/10 text-blue-500' :
                        'bg-amber-500/10 text-amber-500'
                      }`}>
                        {s === 'azure' ? 'microsoft' : s}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <button
                    onClick={() => toggleRole(m.email, m.role === 'admin' ? 'member' : 'admin')}
                    disabled={saving === m.email}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                      m.role === 'admin'
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-border/30 border-border text-text-muted hover:border-primary/30'
                    }`}
                  >
                    {m.role}
                  </button>
                </td>
                <td className="px-3 py-1.5 text-[10px] text-text-muted whitespace-nowrap">
                  {m.last_login
                    ? new Date(m.last_login).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                    : '—'}
                </td>
                <td className="px-3 py-1.5">
                  <button
                    onClick={() => toggleActive(m.email, !m.active)}
                    disabled={saving === m.email}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                      m.active
                        ? 'bg-green-500/10 border-green-500/30 text-green-500'
                        : 'bg-red-500/10 border-red-500/30 text-red-500'
                    }`}
                  >
                    {m.active ? 'active' : 'inactive'}
                  </button>
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={m.holiday_country ?? ''}
                    disabled={!m.person_code_id}
                    onChange={async (e) => {
                      const val = e.target.value
                      setMembers(prev => prev.map(p => p.email === m.email ? { ...p, holiday_country: val || null } : p))
                      await fetch('/api/admin/members', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: m.person_code_id, holidayCountry: val || null }),
                      })
                    }}
                    className="bg-bg border border-border rounded text-[10px] px-1 py-0.5 disabled:opacity-40"
                  >
                    <option value="">Default</option>
                    {holidayCountries.map(c => (
                      <option key={c.code} value={c.code}>{c.code}</option>
                    ))}
                  </select>
                </td>
                {isSuperAdmin && (
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => {
                        fetch('/api/admin/impersonate', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email: m.email, accountId }),
                        }).then(() => window.open('/cal', '_blank'))
                      }}
                      className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-500/30 text-amber-500 hover:bg-amber-500/10 transition-colors"
                    >
                      View as
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
