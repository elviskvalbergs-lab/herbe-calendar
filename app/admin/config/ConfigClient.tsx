'use client'
import { useState, useEffect } from 'react'
import ColorOverridesPanel from '@/components/ColorOverridesPanel'
import type { ColorOverrideRow } from '@/lib/activityColors'

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

interface SmtpConfig {
  host: string
  port: number
  username: string
  sender_email: string
  sender_name: string
  use_tls: boolean
}

interface GoogleConfig {
  service_account_email: string
  admin_email: string
  domain: string
}

interface ZoomConfigProp {
  zoomAccountId: string
  clientId: string
}

export default function ConfigClient({ azure, erpConnections: initialErp, smtp: initialSmtp, google: initialGoogle, zoom: initialZoom, holidayCountry }: { azure: AzureConfig | null; erpConnections: ErpConnection[]; smtp: SmtpConfig | null; google: GoogleConfig | null; zoom?: ZoomConfigProp | null; holidayCountry?: string | null }) {
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
  const [erpForm, setErpForm] = useState({ name: '', apiBaseUrl: '', companyCode: '', clientId: '', clientSecret: '', username: '', password: '', serpUuid: '' })
  const [editingErpId, setEditingErpId] = useState<string | null>(null)
  const [editErpForm, setEditErpForm] = useState({ name: '', apiBaseUrl: '', companyCode: '', clientId: '', clientSecret: '', username: '', password: '', serpUuid: '' })
  const [testResult, setTestResult] = useState<Record<string, string | null>>({})
  const [adminColorOverrides, setAdminColorOverrides] = useState<ColorOverrideRow[]>([])
  const [adminClassGroups, setAdminClassGroups] = useState<{ code: string; name: string; calColNr?: string | number }[]>([])
  const [colorSectionOpen, setColorSectionOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  function toggleSection(key: string) { setOpenSections(prev => ({ ...prev, [key]: !prev[key] })) }
  function isSectionOpen(key: string) { return !!openSections[key] }

  useEffect(() => {
    fetch('/api/admin/colors').then(r => r.json()).then(rows => {
      setAdminColorOverrides(Array.isArray(rows) ? rows : [])
    }).catch(() => {})
    fetch('/api/activity-class-groups').then(r => r.json()).then(groups => {
      setAdminClassGroups(Array.isArray(groups) ? groups : [])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (isSectionOpen('holidays') && holidayCountries.length === 0) {
      fetch('/api/holidays/countries').then(r => r.json()).then(setHolidayCountries).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSections])

  // Azure config form
  const [azureTenantId, setAzureTenantId] = useState(azure?.tenant_id ?? '')
  const [azureClientId, setAzureClientId] = useState(azure?.client_id ?? '')
  const [azureClientSecret, setAzureClientSecret] = useState('')
  const [azureSenderEmail, setAzureSenderEmail] = useState(azure?.sender_email ?? '')

  // SMTP config form
  const [smtpHost, setSmtpHost] = useState(initialSmtp?.host ?? '')
  const [smtpPort, setSmtpPort] = useState(String(initialSmtp?.port ?? 587))
  const [smtpUsername, setSmtpUsername] = useState(initialSmtp?.username ?? '')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpSenderEmail, setSmtpSenderEmail] = useState(initialSmtp?.sender_email ?? '')
  const [smtpSenderName, setSmtpSenderName] = useState(initialSmtp?.sender_name ?? 'Herbe Calendar')

  // Google config form
  const [googleServiceEmail, setGoogleServiceEmail] = useState(initialGoogle?.service_account_email ?? '')
  const [googleServiceKey, setGoogleServiceKey] = useState('')
  const [googleAdminEmail, setGoogleAdminEmail] = useState(initialGoogle?.admin_email ?? '')
  const [googleDomain, setGoogleDomain] = useState(initialGoogle?.domain ?? '')

  // Zoom config form
  const [zoomAccountId, setZoomAccountId] = useState(initialZoom?.zoomAccountId ?? '')
  const [zoomClientId, setZoomClientId] = useState(initialZoom?.clientId ?? '')
  const [zoomClientSecret, setZoomClientSecret] = useState('')
  const [zoomStatus, setZoomStatus] = useState('')

  // Holidays config form
  const [holidayCountryValue, setHolidayCountryValue] = useState(holidayCountry ?? '')
  const [holidayCountries, setHolidayCountries] = useState<{ code: string; name: string }[]>([])
  const [holidayStatus, setHolidayStatus] = useState('')

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

      {/* ERP Connections */}
      <section className="bg-surface border border-border rounded-xl overflow-hidden">
        <button onClick={() => toggleSection('erp')} className="w-full flex items-center justify-between px-4 py-3 hover:bg-border/20 transition-colors">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            <span className="text-sm font-bold flex items-center gap-2">
              Standard ERP Connections
              {erpConnections.length > 0 && <span className="text-[10px] font-normal text-text-muted">({erpConnections.length})</span>}
            </span>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted transition-transform" style={{ transform: isSectionOpen('erp') ? 'rotate(180deg)' : 'rotate(0deg)' }}><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {isSectionOpen('erp') && <div className="p-4 border-t border-border space-y-3">
        <div className="flex justify-end">
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
              <div className="sm:col-span-2">
                <label className="text-[10px] text-text-muted uppercase block mb-0.5">Server UUID <span className="text-text-muted">(for hansa:// deep links, optional)</span></label>
                <input value={erpForm.serpUuid} onChange={e => setErpForm(f => ({ ...f, serpUuid: e.target.value }))} autoComplete="off"
                  className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm font-mono" placeholder="Server UUID from ERP Preferences" />
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
                  setErpForm({ name: '', apiBaseUrl: '', companyCode: '', clientId: '', clientSecret: '', username: '', password: '', serpUuid: '' })
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
                        serpUuid: (conn as any).serp_uuid || '',
                      })
                    }}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-border text-text-muted hover:bg-border/30"
                  >
                    {editingErpId === conn.id ? 'Cancel' : 'Edit'}
                  </button>
                  {conn.client_id && (
                    <button
                      onClick={async () => {
                        const res = await fetch('/api/admin/oauth-nonce', { method: 'POST' })
                        if (!res.ok) return
                        const { nonce } = await res.json()
                        const callbackUrl = `${window.location.origin}/api/herbe/callback`
                        const state = `${nonce}:${conn.id}`
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
                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-text-muted uppercase block mb-0.5">Server UUID <span className="text-text-muted">(for hansa:// links, optional)</span></label>
                        <input value={editErpForm.serpUuid} onChange={e => setEditErpForm(f => ({ ...f, serpUuid: e.target.value }))}
                          className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm font-mono" autoComplete="off" />
                      </div>
                      <p className="text-[10px] text-text-muted font-bold sm:col-span-2 pt-1">Authentication</p>
                      <div>
                        <label className="text-[10px] text-text-muted uppercase block mb-0.5">OAuth Client ID</label>
                        <input value={editErpForm.clientId} onChange={e => setEditErpForm(f => ({ ...f, clientId: e.target.value }))}
                          className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm font-mono" autoComplete="off" />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-muted uppercase block mb-0.5">OAuth Client Secret <span className="text-text-muted">(blank to keep)</span></label>
                        <input type="password" value={editErpForm.clientSecret} onChange={e => setEditErpForm(f => ({ ...f, clientSecret: e.target.value }))}
                          className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm" autoComplete="new-password" />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-muted uppercase block mb-0.5">Basic Auth Username</label>
                        <input value={editErpForm.username} onChange={e => setEditErpForm(f => ({ ...f, username: e.target.value }))}
                          className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-sm" autoComplete="off" />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-muted uppercase block mb-0.5">Basic Auth Password <span className="text-text-muted">(blank to keep)</span></label>
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
                        if (editErpForm.clientId !== conn.client_id) payload.clientId = editErpForm.clientId
                        if (editErpForm.clientSecret) payload.clientSecret = editErpForm.clientSecret
                        if (editErpForm.username) payload.username = editErpForm.username
                        if (editErpForm.password) payload.password = editErpForm.password
                        if (editErpForm.serpUuid !== ((conn as any).serp_uuid || '')) payload.serpUuid = editErpForm.serpUuid
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
        </div>}
      </section>

      {/* SMTP Email */}
      <section className="bg-surface border border-border rounded-xl overflow-hidden">
        <button onClick={() => toggleSection('smtp')} className="w-full flex items-center justify-between px-4 py-3 hover:bg-border/20 transition-colors">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <span className="text-sm font-bold flex items-center gap-2">
              SMTP Email (for login magic links)
              {initialSmtp && <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-green-500/10 text-green-500">configured</span>}
            </span>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted transition-transform" style={{ transform: isSectionOpen('smtp') ? 'rotate(180deg)' : 'rotate(0deg)' }}><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {isSectionOpen('smtp') && <div className="p-4 border-t border-border space-y-3">
        <p className="text-[10px] text-text-muted">Used when Azure AD is not configured. Sends magic link emails via SMTP.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">SMTP Host</label>
            <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} autoComplete="off"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm font-mono" placeholder="smtp.gmail.com" />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Port</label>
            <input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} autoComplete="off"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm font-mono" placeholder="587" />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Username</label>
            <input value={smtpUsername} onChange={e => setSmtpUsername(e.target.value)} autoComplete="off"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm" placeholder="user@company.com" />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Password {initialSmtp && <span className="text-text-muted">(blank to keep)</span>}</label>
            <input type="password" value={smtpPassword} onChange={e => setSmtpPassword(e.target.value)} autoComplete="new-password"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Sender Email</label>
            <input value={smtpSenderEmail} onChange={e => setSmtpSenderEmail(e.target.value)} autoComplete="off"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm" placeholder="calendar@company.com" />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Sender Name</label>
            <input value={smtpSenderName} onChange={e => setSmtpSenderName(e.target.value)} autoComplete="off"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm" placeholder="Herbe Calendar" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={async () => {
            setSaving(true); setMessage(null)
            try {
              const res = await fetch('/api/admin/config', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'smtp', host: smtpHost.trim(), port: parseInt(smtpPort) || 587, username: smtpUsername.trim(), password: smtpPassword || undefined, senderEmail: smtpSenderEmail.trim(), senderName: smtpSenderName.trim(), useTls: true }),
              })
              setMessage(res.ok ? 'SMTP config saved' : `Failed: ${(await res.json().catch(() => ({}))).error || res.status}`)
              if (res.ok) setSmtpPassword('')
            } catch (e) { setMessage(`Failed: ${e}`) } finally { setSaving(false) }
          }} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold disabled:opacity-50">Save SMTP</button>
          <button onClick={async () => {
            setSaving(true); setMessage(null)
            try {
              const res = await fetch('/api/admin/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test-smtp' }) })
              const data = await res.json()
              setMessage(data.ok ? `SMTP OK: ${data.message}` : `SMTP test failed: ${data.error}`)
            } catch (e) { setMessage(`Failed: ${e}`) } finally { setSaving(false) }
          }} disabled={saving} className="px-4 py-2 border border-border text-text-muted rounded-lg text-xs font-bold hover:bg-border/30 disabled:opacity-50">Test SMTP</button>
        </div>
        </div>}
      </section>

      {/* Azure AD */}
      <section className="bg-surface border border-border rounded-xl overflow-hidden">
        <button onClick={() => toggleSection('azure')} className="w-full flex items-center justify-between px-4 py-3 hover:bg-border/20 transition-colors">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            <span className="text-sm font-bold flex items-center gap-2">
              Azure AD / Microsoft 365
              {azure && <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-green-500/10 text-green-500">configured</span>}
            </span>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted transition-transform" style={{ transform: isSectionOpen('azure') ? 'rotate(180deg)' : 'rotate(0deg)' }}><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {isSectionOpen('azure') && <div className="p-4 border-t border-border space-y-3">
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
        </div>}
      </section>

      {/* Google Workspace */}
      <section className="bg-surface border border-border rounded-xl overflow-hidden">
        <button onClick={() => toggleSection('google')} className="w-full flex items-center justify-between px-4 py-3 hover:bg-border/20 transition-colors">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span className="text-sm font-bold flex items-center gap-2">
              Google Workspace
              {initialGoogle && <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-green-500/10 text-green-500">configured</span>}
            </span>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted transition-transform" style={{ transform: isSectionOpen('google') ? 'rotate(180deg)' : 'rotate(0deg)' }}><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {isSectionOpen('google') && <div className="p-4 border-t border-border space-y-3">
        <p className="text-[10px] text-text-muted">Enables Google Calendar integration with Meet. Requires a service account with domain-wide delegation.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Service Account Email</label>
            <input value={googleServiceEmail} onChange={e => setGoogleServiceEmail(e.target.value)} autoComplete="off"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm font-mono" placeholder="calendar@project.iam.gserviceaccount.com" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Service Account Private Key (JSON) {initialGoogle && <span className="text-text-muted">(blank to keep)</span>}</label>
            <textarea value={googleServiceKey} onChange={e => setGoogleServiceKey(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm font-mono h-20 resize-none" placeholder='Paste the "private_key" value from the JSON key file' />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Admin Email (for delegation)</label>
            <input value={googleAdminEmail} onChange={e => setGoogleAdminEmail(e.target.value)} autoComplete="off"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm" placeholder="admin@company.com" />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Workspace Domain</label>
            <input value={googleDomain} onChange={e => setGoogleDomain(e.target.value)} autoComplete="off"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm font-mono" placeholder="company.com" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={async () => {
            setSaving(true); setMessage(null)
            try {
              const res = await fetch('/api/admin/config', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'google', serviceAccountEmail: googleServiceEmail.trim(), serviceAccountKey: googleServiceKey || undefined, adminEmail: googleAdminEmail.trim(), domain: googleDomain.trim() }),
              })
              setMessage(res.ok ? 'Google config saved' : `Failed: ${(await res.json().catch(() => ({}))).error || res.status}`)
              if (res.ok) setGoogleServiceKey('')
            } catch (e) { setMessage(`Failed: ${e}`) } finally { setSaving(false) }
          }} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold disabled:opacity-50">Save Google Config</button>
          <button onClick={async () => {
            setSaving(true); setMessage(null)
            try {
              const res = await fetch('/api/admin/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test-google' }) })
              const data = await res.json()
              setMessage(data.ok ? `Google OK (${data.userCount} users found)` : `Google test failed: ${data.error}`)
            } catch (e) { setMessage(`Failed: ${e}`) } finally { setSaving(false) }
          }} disabled={saving} className="px-4 py-2 border border-border text-text-muted rounded-lg text-xs font-bold hover:bg-border/30 disabled:opacity-50">Test Connection</button>
        </div>
        </div>}
      </section>

      {/* Public Holidays */}
      <section className="bg-surface border border-border rounded-xl overflow-hidden">
        <button onClick={() => toggleSection('holidays')} className="w-full flex items-center justify-between px-4 py-3 hover:bg-border/20 transition-colors">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <span className="text-sm font-bold flex items-center gap-2">
              Public Holidays
              {holidayCountry && <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-green-500/10 text-green-500">{holidayCountry}</span>}
            </span>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted transition-transform" style={{ transform: isSectionOpen('holidays') ? 'rotate(180deg)' : 'rotate(0deg)' }}><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {isSectionOpen('holidays') && (
          <div className="p-4 border-t border-border space-y-3">
            {holidayStatus && (
              <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${holidayStatus.includes('Error') ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                {holidayStatus}
              </div>
            )}
            <div>
              <label className="text-[10px] text-text-muted uppercase block mb-0.5">Default Holiday Country</label>
              <select
                value={holidayCountryValue}
                onChange={e => setHolidayCountryValue(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Disabled</option>
                {holidayCountries.map(c => (
                  <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                ))}
              </select>
            </div>
            <button onClick={async () => {
              setHolidayStatus('Saving...')
              const res = await fetch('/api/admin/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'holidays', holidayCountry: holidayCountryValue || null }),
              })
              setHolidayStatus(res.ok ? 'Saved!' : 'Error')
            }} className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold">
              Save Holiday Config
            </button>
          </div>
        )}
      </section>

      {/* Zoom */}
      <section className="bg-surface border border-border rounded-xl overflow-hidden">
        <button onClick={() => toggleSection('zoom')} className="w-full flex items-center justify-between px-4 py-3 hover:bg-border/20 transition-colors">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            <span className="text-sm font-bold flex items-center gap-2">
              Zoom
              {initialZoom && <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-green-500/10 text-green-500">configured</span>}
            </span>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted transition-transform" style={{ transform: isSectionOpen('zoom') ? 'rotate(180deg)' : 'rotate(0deg)' }}><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {isSectionOpen('zoom') && <div className="p-4 border-t border-border space-y-3">
        {zoomStatus && (
          <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${zoomStatus.includes('fail') || zoomStatus.includes('Failed') ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
            {zoomStatus}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Account ID</label>
            <input value={zoomAccountId} onChange={e => setZoomAccountId(e.target.value)} autoComplete="off"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm font-mono" placeholder="xxxxxxxxxxxxxxxx" />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Client ID</label>
            <input value={zoomClientId} onChange={e => setZoomClientId(e.target.value)} autoComplete="off"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm font-mono" placeholder="xxxxxxxxxxxxxxxx" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] text-text-muted uppercase block mb-0.5">Client Secret {initialZoom && <span className="text-text-muted">(leave blank to keep current)</span>}</label>
            <input type="password" value={zoomClientSecret} onChange={e => setZoomClientSecret(e.target.value)} autoComplete="new-password"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm" placeholder="Enter client secret..." />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={async () => {
            setSaving(true); setZoomStatus('')
            try {
              const res = await fetch('/api/admin/config', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'zoom', zoomAccountId: zoomAccountId.trim(), clientId: zoomClientId.trim(), ...(zoomClientSecret ? { clientSecret: zoomClientSecret } : {}) }),
              })
              setZoomStatus(res.ok ? 'Zoom config saved' : `Failed: ${(await res.json().catch(() => ({}))).error || res.status}`)
              if (res.ok) setZoomClientSecret('')
            } catch (e) { setZoomStatus(`Failed: ${e}`) } finally { setSaving(false) }
          }} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold disabled:opacity-50">Save Zoom Config</button>
          <button onClick={async () => {
            setSaving(true); setZoomStatus('')
            try {
              const res = await fetch('/api/admin/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test-zoom' }) })
              const data = await res.json()
              setZoomStatus(data.ok ? `Zoom OK (connected as ${data.email ?? 'unknown'})` : `Zoom test failed: ${data.error}`)
            } catch (e) { setZoomStatus(`Failed: ${e}`) } finally { setSaving(false) }
          }} disabled={saving} className="px-4 py-2 border border-border text-text-muted rounded-lg text-xs font-bold hover:bg-border/30 disabled:opacity-50">Test Connection</button>
        </div>
        </div>}
      </section>

      {/* Activity Color Defaults */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setColorSectionOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-border/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/></svg>
            <span className="text-sm font-bold">Activity Color Defaults</span>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted transition-transform" style={{ transform: colorSectionOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {colorSectionOpen && (
          <div className="p-4 border-t border-border">
            <p className="text-xs text-text-muted mb-4">Set default colors for activity groups across this account. Users can override these in their personal settings.</p>
            {adminClassGroups.length === 0 ? (
              <p className="text-xs text-text-muted">No class groups loaded. Connect an ERP first.</p>
            ) : (
              <ColorOverridesPanel
                classGroups={adminClassGroups}
                connections={erpConnections}
                overrides={adminColorOverrides}
                mode="admin"
                onSave={async (code, color, connId) => {
                  await fetch('/api/admin/colors', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ classGroupCode: code, color, connectionId: connId }),
                  })
                  const res = await fetch('/api/admin/colors')
                  setAdminColorOverrides(await res.json())
                }}
                onDelete={async (code, connId) => {
                  await fetch('/api/admin/colors', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ classGroupCode: code, connectionId: connId }),
                  })
                  const res = await fetch('/api/admin/colors')
                  setAdminColorOverrides(await res.json())
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
