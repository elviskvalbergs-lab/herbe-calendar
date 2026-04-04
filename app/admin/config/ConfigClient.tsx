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
  const [erpConnections] = useState(initialErp)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

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
            <input value={azureTenantId} onChange={e => setAzureTenantId(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm font-mono" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Client ID</label>
            <input value={azureClientId} onChange={e => setAzureClientId(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm font-mono" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Client Secret {azure && <span className="text-text-muted">(leave blank to keep current)</span>}</label>
            <input type="password" value={azureClientSecret} onChange={e => setAzureClientSecret(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm" placeholder="Enter client secret..." />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Sender Email</label>
            <input value={azureSenderEmail} onChange={e => setAzureSenderEmail(e.target.value)}
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
        <h2 className="text-sm font-bold">Standard ERP Connections</h2>
        {erpConnections.length === 0 ? (
          <p className="text-xs text-text-muted">No ERP connections configured. Add one via environment variables or contact super admin.</p>
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
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${conn.active ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                  {conn.active ? 'active' : 'inactive'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
