'use client'
import { useState } from 'react'

interface AzureConfig {
  tenant_id: string
  client_id: string
  sender_email: string
}

interface ErpConnection {
  id: string
  name: string
  api_base_url: string
  company_code: string
  client_id: string
  username: string | null
  active: boolean
  created_at: string
}

export default function ConfigClient({ azure, erpConnections: initialErp }: { azure: AzureConfig | null; erpConnections: ErpConnection[] }) {
  const [erpConnections, setErpConnections] = useState(initialErp)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'herbe_connected') return 'Standard ERP OAuth connected successfully'
    if (params.get('error')) return `OAuth error: ${params.get('error')}`
    return null
  })
  const [showAddErp, setShowAddErp] = useState(false)
  const [erpForm, setErpForm] = useState({ name: '', apiBaseUrl: '', companyCode: '', clientId: '', clientSecret: '', username: '', password: '' })
  const [editingErpId, setEditingErpId] = useState<string | null>(null)
  const [editErpForm, setEditErpForm] = useState({ name: '', apiBaseUrl: '', companyCode: '', clientId: '', clientSecret: '', username: '', password: '' })
  const [testResult, setTestResult] = useState<Record<string, string | null>>({})

  // Azure config form
  const [azureTenantId, setAzureTenantId] = useState(azure?.tenant_id ?? '')
  const [azureClientId, setAzureClientId] = useState(azure?.client_id ?? '')
  const [azureClientSecret, setAzureClientSecret] = useState('')
  const [azureSenderEmail, setAzureSenderEmail] = useState(azure?.sender_email ?? '')

  async function saveAzure() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'azure',
          tenantId: azureTenantId.trim(),
          clientId: azureClientId.trim(),
          clientSecret: azureClientSecret.trim() || undefined,
          senderEmail: azureSenderEmail.trim(),
        }),
      })
      if (res.ok) {
        setMessage('Azure config saved')
        setAzureClientSecret('')
      } else {
        const data = await res.json().catch(() => null)
        setMessage(`Failed to save: ${data?.error || res.status}`)
      }
    } catch (e) {
      setMessage(`Failed to save: ${String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  async function testAzure() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test-azure' }),
      })
      const data = await res.json()
      setMessage(data.ok ? `Azure connection OK (${data.userCount} users found)` : `Azure test failed: ${data.error}`)
    } catch (e) {
      setMessage(`Azure test failed: ${String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      {message && (
        <div className={`px-4 py-2 rounded-lg text-sm font-bold ${message.includes('fail') || message.includes('Failed') ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
          {message}
        </div>
      )}

      {/* Azure AD */}
      <section className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-bold flex items-center gap-2">
          Azure AD / Microsoft 365
          {azure && <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-green-500/10 text-green-500">configured</span>}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Tenant ID</label>
            <input value={azureTenantId} onChange={e => setAzureTenantId(e.target.value)} autoComplete="off"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm font-mono" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Client ID</label>
            <input value={azureClientId} onChange={e => setAzureClientId(e.target.value)} autoComplete="off"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm font-mono" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Client Secret {azure && <span className="text-text-muted">(leave blank to keep current)</span>}</label>
            <input type="password" value={azureClientSecret} onChange={e => setAzureClientSecret(e.target.value)} autoComplete="new-password"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm" placeholder="Enter client secret..." />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Sender Email</label>
            <input value={azureSenderEmail} onChange={e => setAzureSenderEmail(e.target.value)} autoComplete="off"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm" placeholder="calendar@company.com" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={saveAzure} disabled={saving}
            className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold disabled:opacity-50">
            Save Azure Config
          </button>
          <button onClick={testAzure} disabled={saving}
            className="px-4 py-2 border border-border text-text-muted rounded-lg text-xs font-bold hover:bg-border/30 disabled:opacity-50">
            Test Connection
          </button>
        </div>
      </section>

      {/* ERP Connections */}
      <section className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-bold">Standard ERP Connections</h2>
          <button
            onClick={() => setShowAddErp(o => !o)}
            className="px-3 py-1 bg-primary text-white rounded-lg text-[10px] font-bold"
          >
            {showAddErp ? 'Cancel' : '+ Add Connection'}
          </button>
        </div>

        {showAddErp && (
          <div className="p-3 rounded-lg bg-bg border border-border/50 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-text-muted uppercase block mb-0.5">Connection Name</label>
                <input value={erpForm.name} onChange={e => setErpForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm" placeholder="My ERP" />
              </div>
              <div>
                <label className="text-[10px] text-text-muted uppercase block mb-0.5">Company Code</label>
                <input value={erpForm.companyCode} onChange={e => setErpForm(f => ({ ...f, companyCode: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm font-mono" placeholder="3" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-text-muted uppercase block mb-0.5">API Base URL</label>
                <input value={erpForm.apiBaseUrl} onChange={e => setErpForm(f => ({ ...f, apiBaseUrl: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm font-mono" placeholder="https://erp.example.com/api" />
              </div>
            </div>
            <p className="text-[10px] text-text-muted font-bold pt-1">Authentication (choose one)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-text-muted uppercase block mb-0.5">OAuth Client ID</label>
                <input value={erpForm.clientId} onChange={e => setErpForm(f => ({ ...f, clientId: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm font-mono" />
              </div>
              <div>
                <label className="text-[10px] text-text-muted uppercase block mb-0.5">OAuth Client Secret</label>
                <input type="password" value={erpForm.clientSecret} onChange={e => setErpForm(f => ({ ...f, clientSecret: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-text-muted uppercase block mb-0.5">Basic Auth Username</label>
                <input value={erpForm.username} onChange={e => setErpForm(f => ({ ...f, username: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-text-muted uppercase block mb-0.5">Basic Auth Password</label>
                <input type="password" value={erpForm.password} onChange={e => setErpForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm" />
              </div>
            </div>
            <button
              onClick={async () => {
                setSaving(true); setMessage(null)
                const res = await fetch('/api/admin/erp-connections', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(erpForm),
                })
                if (res.ok) {
                  const conn = await res.json()
                  setErpConnections(prev => [...prev, conn])
                  setErpForm({ name: '', apiBaseUrl: '', companyCode: '', clientId: '', clientSecret: '', username: '', password: '' })
                  setShowAddErp(false)
                  setMessage('ERP connection added')
                } else {
                  const data = await res.json().catch(() => ({}))
                  setMessage(`Failed: ${data.error || res.status}`)
                }
                setSaving(false)
              }}
              disabled={saving || !erpForm.name || !erpForm.apiBaseUrl || !erpForm.companyCode}
              className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold disabled:opacity-50"
            >
              Add Connection
            </button>
          </div>
        )}

        {erpConnections.length === 0 && !showAddErp ? (
          <p className="text-xs text-text-muted">No ERP connections configured.</p>
        ) : (
          <div className="space-y-2">
            {erpConnections.map(conn => (
              <div key={conn.id} className="p-3 rounded-lg bg-bg border border-border/50 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">{conn.name}</p>
                    <p className="text-[10px] text-text-muted font-mono">{conn.api_base_url} / {conn.company_code}</p>
                    {conn.username && <p className="text-[10px] text-text-muted">Auth: Basic ({conn.username})</p>}
                    {conn.client_id && !conn.username && <p className="text-[10px] text-text-muted">Auth: OAuth ({conn.client_id.slice(0, 8)}...)</p>}
                  </div>
                  <button
                    onClick={async () => {
                      const newActive = !conn.active
                      await fetch('/api/admin/erp-connections', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: conn.id, active: newActive }),
                      })
                      setErpConnections(prev => prev.map(c => c.id === conn.id ? { ...c, active: newActive } : c))
                    }}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                      conn.active ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'
                    }`}
                  >
                    {conn.active ? 'active' : 'inactive'}
                  </button>
                </div>
                {testResult[conn.id] && (
                  <p className={`text-[10px] font-bold ${testResult[conn.id]!.startsWith('OK') ? 'text-green-500' : 'text-red-500'}`}>
                    {testResult[conn.id]}
                  </p>
                )}
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={async () => {
                      setTestResult(prev => ({ ...prev, [conn.id]: 'Testing...' }))
                      const res = await fetch('/api/admin/erp-connections', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'test', id: conn.id }),
                      })
                      const data = await res.json()
                      setTestResult(prev => ({ ...prev, [conn.id]: data.ok ? `OK (${data.userCount} users)` : `Failed: ${data.error}` }))
                    }}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-border text-text-muted hover:bg-border/30"
                  >
                    Test
                  </button>
                  <button
                    onClick={() => {
                      if (editingErpId === conn.id) { setEditingErpId(null); return }
                      setEditingErpId(conn.id)
                      setEditErpForm({
                        name: conn.name, apiBaseUrl: conn.api_base_url, companyCode: conn.company_code,
                        clientId: conn.client_id, clientSecret: '', username: conn.username || '', password: '',
                      })
                    }}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-border text-text-muted hover:bg-border/30"
                  >
                    {editingErpId === conn.id ? 'Cancel' : 'Edit'}
                  </button>
                  {conn.client_id && (
                    <button
                      onClick={() => {
                        const callbackUrl = `${window.location.origin}/api/herbe/callback`
                        const state = conn.id // pass connection ID as state
                        const authorizeUrl = `https://standard-id.hansaworld.com/oauth-authorize?client_id=${encodeURIComponent(conn.client_id)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&state=${encodeURIComponent(state)}`
                        window.open(authorizeUrl, '_blank')
                      }}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-primary/30 text-primary hover:bg-primary/10"
                    >
                      Connect OAuth
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const callbackUrl = `${window.location.origin}/api/herbe/callback`
                      navigator.clipboard.writeText(callbackUrl)
                      setTestResult(prev => ({ ...prev, [conn.id]: `Callback URL copied: ${callbackUrl}` }))
                    }}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-border text-text-muted hover:bg-border/30"
                  >
                    Copy Callback URL
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete connection "${conn.name}"?`)) return
                      await fetch('/api/admin/erp-connections', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: conn.id }),
                      })
                      setErpConnections(prev => prev.filter(c => c.id !== conn.id))
                    }}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
                {editingErpId === conn.id && (
                  <div className="space-y-2 pt-1 border-t border-border/30">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-text-muted uppercase block mb-0.5">Name</label>
                        <input value={editErpForm.name} onChange={e => setEditErpForm(f => ({ ...f, name: e.target.value }))}
                          className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm" autoComplete="off" />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-muted uppercase block mb-0.5">Company Code</label>
                        <input value={editErpForm.companyCode} onChange={e => setEditErpForm(f => ({ ...f, companyCode: e.target.value }))}
                          className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm font-mono" autoComplete="off" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-text-muted uppercase block mb-0.5">API Base URL</label>
                        <input value={editErpForm.apiBaseUrl} onChange={e => setEditErpForm(f => ({ ...f, apiBaseUrl: e.target.value }))}
                          className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm font-mono" autoComplete="off" />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-muted uppercase block mb-0.5">Username <span className="text-text-muted">(blank to keep)</span></label>
                        <input value={editErpForm.username} onChange={e => setEditErpForm(f => ({ ...f, username: e.target.value }))}
                          className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm" autoComplete="off" />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-muted uppercase block mb-0.5">Password <span className="text-text-muted">(blank to keep)</span></label>
                        <input type="password" value={editErpForm.password} onChange={e => setEditErpForm(f => ({ ...f, password: e.target.value }))}
                          className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm" autoComplete="new-password" />
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        setSaving(true)
                        const payload: Record<string, unknown> = { id: conn.id }
                        if (editErpForm.name !== conn.name) payload.name = editErpForm.name
                        if (editErpForm.apiBaseUrl !== conn.api_base_url) payload.apiBaseUrl = editErpForm.apiBaseUrl
                        if (editErpForm.companyCode !== conn.company_code) payload.companyCode = editErpForm.companyCode
                        if (editErpForm.username) payload.username = editErpForm.username
                        if (editErpForm.password) payload.password = editErpForm.password
                        await fetch('/api/admin/erp-connections', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(payload),
                        })
                        setErpConnections(prev => prev.map(c => c.id === conn.id ? {
                          ...c,
                          name: editErpForm.name || c.name,
                          api_base_url: editErpForm.apiBaseUrl || c.api_base_url,
                          company_code: editErpForm.companyCode || c.company_code,
                          username: editErpForm.username || c.username,
                        } : c))
                        setEditingErpId(null)
                        setSaving(false)
                        setMessage('Connection updated')
                      }}
                      disabled={saving}
                      className="px-3 py-1.5 bg-primary text-white rounded-lg text-[10px] font-bold disabled:opacity-50"
                    >
                      Save Changes
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
