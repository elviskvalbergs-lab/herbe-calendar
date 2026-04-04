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
  const [message, setMessage] = useState<string | null>(null)
  const [showAddErp, setShowAddErp] = useState(false)
  const [erpForm, setErpForm] = useState({ name: '', apiBaseUrl: '', companyCode: '', clientId: '', clientSecret: '', username: '', password: '' })

  // Azure config form
  const [azureTenantId, setAzureTenantId] = useState(azure?.tenant_id ?? '')
  const [azureClientId, setAzureClientId] = useState(azure?.client_id ?? '')
  const [azureClientSecret, setAzureClientSecret] = useState('')
  const [azureSenderEmail, setAzureSenderEmail] = useState(azure?.sender_email ?? '')

  async function saveAzure() {
    setSaving(true)
    setMessage(null)
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'azure',
        tenantId: azureTenantId,
        clientId: azureClientId,
        clientSecret: azureClientSecret || undefined,
        senderEmail: azureSenderEmail,
      }),
    })
    setSaving(false)
    setMessage(res.ok ? 'Azure config saved' : 'Failed to save')
    if (res.ok) setAzureClientSecret('')
  }

  async function testAzure() {
    setSaving(true)
    setMessage(null)
    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test-azure' }),
    })
    const data = await res.json()
    setSaving(false)
    setMessage(data.ok ? `Azure connection OK (${data.userCount} users found)` : `Azure test failed: ${data.error}`)
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
              <div key={conn.id} className="flex items-center justify-between p-3 rounded-lg bg-bg border border-border/50">
                <div>
                  <p className="text-sm font-bold">{conn.name}</p>
                  <p className="text-[10px] text-text-muted font-mono">{conn.api_base_url} / {conn.company_code}</p>
                  {conn.username && <p className="text-[10px] text-text-muted">Auth: Basic ({conn.username})</p>}
                  {conn.client_id && <p className="text-[10px] text-text-muted">Auth: OAuth ({conn.client_id.slice(0, 8)}...)</p>}
                </div>
                <div className="flex items-center gap-2">
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
                    className="text-[10px] font-bold px-2 py-0.5 rounded border border-red-500/30 text-red-500 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
