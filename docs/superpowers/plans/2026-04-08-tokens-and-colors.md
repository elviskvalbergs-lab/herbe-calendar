# API Token Management & Activity Type Color Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin UI for managing API tokens (create/list/revoke with expiry), move activity type color overrides from localStorage to the database with per-user and per-connection granularity, and add row hover highlighting to all admin tables.

**Architecture:** Two independent feature tracks sharing common admin UI patterns. Token management is a new admin page + API route backed by the existing `api_tokens` table (adds `expires_at` column). Color overrides introduce a new `color_overrides` table with a 6-level fallback hierarchy, new API routes for user and admin levels, and UI in both the Settings modal and admin Config page.

**Tech Stack:** Next.js App Router, PostgreSQL (Neon), React client components, existing auth patterns (`requireAdminSession`, `requireSession`)

---

## File Structure

### New Files
| File | Purpose |
|------|---------|
| `db/migrations/11_add_token_expiry.sql` | Add `expires_at` to `api_tokens` |
| `db/migrations/12_create_color_overrides.sql` | New `color_overrides` table |
| `app/api/admin/tokens/route.ts` | Token CRUD API (GET/POST/PATCH) |
| `app/admin/tokens/page.tsx` | Admin tokens page (server component) |
| `app/admin/tokens/TokensClient.tsx` | Tokens table + create/reveal modals |
| `app/api/settings/colors/route.ts` | User-level color overrides API |
| `app/api/admin/colors/route.ts` | Admin-level color overrides API |
| `components/ColorOverridesPanel.tsx` | Shared side-by-side color editor (used in Settings and admin) |
| `__tests__/lib/activityColors.test.ts` | Extended with DB override hierarchy tests |

### Modified Files
| File | Change |
|------|--------|
| `lib/apiTokens.ts` | Check `expires_at` in `validateToken()` |
| `lib/activityColors.ts` | New `resolveColorWithOverrides()` function for 6-level hierarchy |
| `components/AdminShell.tsx` | Add "API Tokens" to NAV_ITEMS |
| `components/SettingsModal.tsx` | Add "Colors" tab with ColorOverridesPanel |
| `components/CalendarShell.tsx` | Fetch color overrides from API, pass to color resolver, localStorage migration |
| `app/admin/members/MembersClient.tsx` | Add `hover:bg-border/20` to table rows |
| `app/admin/accounts/AccountsClient.tsx` | Add `hover:bg-border/20` to account cards |

---

## Task 1: Migration — Add `expires_at` to `api_tokens`

**Files:**
- Create: `db/migrations/11_add_token_expiry.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add optional expiry timestamp to API tokens
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
```

- [ ] **Step 2: Run the migration**

Run: `psql "$DATABASE_URL" -f db/migrations/11_add_token_expiry.sql`
Expected: `ALTER TABLE` with no errors

- [ ] **Step 3: Commit**

```bash
git add db/migrations/11_add_token_expiry.sql
git commit -m "feat: add expires_at column to api_tokens table"
```

---

## Task 2: Update `validateToken()` to check expiry

**Files:**
- Modify: `lib/apiTokens.ts:12-24`
- Test: `__tests__/lib/apiTokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/apiTokens.test.ts`:

```typescript
import { generateToken } from '@/lib/apiTokens'

describe('generateToken', () => {
  it('returns a raw token starting with hcal_ and a hex hash', () => {
    const { raw, hash } = generateToken()
    expect(raw).toMatch(/^hcal_[0-9a-f]{64}$/)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generates unique tokens each call', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a.raw).not.toBe(b.raw)
    expect(a.hash).not.toBe(b.hash)
  })
})
```

- [ ] **Step 2: Run test to verify it passes** (these test the existing function)

Run: `npx jest __tests__/lib/apiTokens.test.ts --no-cache`
Expected: PASS

- [ ] **Step 3: Update `validateToken` to check `expires_at`**

In `lib/apiTokens.ts`, change the SQL query at line 15 from:

```typescript
`SELECT account_id, scope FROM api_tokens WHERE token_hash = $1 AND revoked_at IS NULL`,
```

to:

```typescript
`SELECT account_id, scope FROM api_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
```

- [ ] **Step 4: Commit**

```bash
git add lib/apiTokens.ts __tests__/lib/apiTokens.test.ts
git commit -m "feat: check expires_at in token validation"
```

---

## Task 3: API route — `/api/admin/tokens`

**Files:**
- Create: `app/api/admin/tokens/route.ts`

- [ ] **Step 1: Create the token admin API route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAdminAccountId } from '@/lib/adminAccountId'
import { generateToken } from '@/lib/apiTokens'

export async function GET() {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { rows } = await pool.query(
    `SELECT id, name, scope, created_by, created_at, last_used, expires_at, revoked_at
     FROM api_tokens WHERE account_id = $1
     ORDER BY created_at DESC`,
    [session.accountId]
  )

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name, scope, expiresAt } = await req.json()
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const tokenScope = scope === 'super' && session.isSuperAdmin ? 'super' : 'account'
  const { raw, hash } = generateToken()

  const { rows } = await pool.query(
    `INSERT INTO api_tokens (account_id, token_hash, name, scope, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [session.accountId, hash, name.trim(), tokenScope, session.email, expiresAt || null]
  )

  return NextResponse.json({ id: rows[0].id, token: raw }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await req.json()
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  await pool.query(
    `UPDATE api_tokens SET revoked_at = now() WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL`,
    [id, session.accountId]
  )

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify the route compiles**

Run: `npx next build --no-lint 2>&1 | head -30` (or run dev server and hit the endpoint)

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/tokens/route.ts
git commit -m "feat: add admin API route for token management"
```

---

## Task 4: Admin tokens page — server component + client component

**Files:**
- Create: `app/admin/tokens/page.tsx`
- Create: `app/admin/tokens/TokensClient.tsx`
- Modify: `components/AdminShell.tsx:15-20`

- [ ] **Step 1: Create the server component page**

Create `app/admin/tokens/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAdminAccountId, getAllAccounts } from '@/lib/adminAccountId'
import AdminShell from '@/components/AdminShell'
import { pool } from '@/lib/db'
import TokensClient from './TokensClient'

export default async function TokensPage() {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') redirect('/login')
    redirect('/cal')
  }
  const accounts = session.isSuperAdmin ? await getAllAccounts() : []

  const { rows: tokens } = await pool.query(
    `SELECT id, name, scope, created_by, created_at, last_used, expires_at, revoked_at
     FROM api_tokens WHERE account_id = $1
     ORDER BY created_at DESC`,
    [session.accountId]
  )

  return (
    <AdminShell email={session.email} accountName={session.accountName} accountId={session.accountId} isSuperAdmin={session.isSuperAdmin} accounts={accounts}>
      <h1 className="text-xl font-bold mb-6">API Tokens</h1>
      <TokensClient tokens={tokens} isSuperAdmin={session.isSuperAdmin} />
    </AdminShell>
  )
}
```

- [ ] **Step 2: Create the client component**

Create `app/admin/tokens/TokensClient.tsx`:

```typescript
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

  const [copied, setCopied] = useState(false)

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
```

- [ ] **Step 3: Add "API Tokens" to admin navigation**

In `components/AdminShell.tsx`, add to the `NAV_ITEMS` array (line 15-20):

```typescript
const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: '◻' },
  { href: '/admin/members', label: 'Members', icon: '👥' },
  { href: '/admin/config', label: 'Connections', icon: '⚙' },
  { href: '/admin/analytics', label: 'Analytics', icon: '📊' },
  { href: '/admin/tokens', label: 'API Tokens', icon: '🔑' },
]
```

- [ ] **Step 4: Verify in browser**

Run: `npm run dev` and navigate to `/admin/tokens`
Expected: Page loads with empty table, create form works, token is revealed once

- [ ] **Step 5: Commit**

```bash
git add app/admin/tokens/ components/AdminShell.tsx
git commit -m "feat: add admin UI for API token management"
```

---

## Task 5: Admin table row hover — Members, Accounts

**Files:**
- Modify: `app/admin/members/MembersClient.tsx:150`
- Modify: `app/admin/accounts/AccountsClient.tsx:107`

- [ ] **Step 1: Add hover to Members table rows**

In `app/admin/members/MembersClient.tsx`, line 150, change:

```tsx
<tr key={m.email} className={`border-b border-border/30 ${!m.active ? 'bg-border/10' : ''}`}>
```

to:

```tsx
<tr key={m.email} className={`border-b border-border/30 transition-colors hover:bg-border/20 ${!m.active ? 'bg-border/10' : ''}`}>
```

- [ ] **Step 2: Add hover to Accounts cards**

In `app/admin/accounts/AccountsClient.tsx`, line 107, change:

```tsx
<div key={a.id} className={`bg-surface border border-border rounded-xl p-4 flex items-center justify-between ${a.suspended_at ? 'opacity-60' : ''}`}>
```

to:

```tsx
<div key={a.id} className={`bg-surface border border-border rounded-xl p-4 flex items-center justify-between transition-colors hover:bg-border/20 ${a.suspended_at ? 'opacity-60' : ''}`}>
```

- [ ] **Step 3: Verify in browser**

Navigate to `/admin/members` and `/admin/accounts`, hover over rows/cards.
Expected: Subtle background highlight on hover.

- [ ] **Step 4: Commit**

```bash
git add app/admin/members/MembersClient.tsx app/admin/accounts/AccountsClient.tsx
git commit -m "feat: add row hover highlighting to admin tables"
```

---

## Task 6: Migration — Create `color_overrides` table

**Files:**
- Create: `db/migrations/12_create_color_overrides.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Color overrides for activity class groups
-- user_email NULL = admin default, connection_id NULL = all connections
CREATE TABLE IF NOT EXISTS color_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  user_email      TEXT,
  connection_id   UUID REFERENCES account_erp_connections(id) ON DELETE CASCADE,
  class_group_code TEXT NOT NULL,
  color           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one override per (account, user, connection, class_group)
-- COALESCE handles NULLs for uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_color_overrides_unique
  ON color_overrides (account_id, COALESCE(user_email, ''), COALESCE(connection_id::text, ''), class_group_code);

CREATE INDEX IF NOT EXISTS idx_color_overrides_account ON color_overrides (account_id);
CREATE INDEX IF NOT EXISTS idx_color_overrides_user ON color_overrides (account_id, user_email) WHERE user_email IS NOT NULL;
```

- [ ] **Step 2: Run the migration**

Run: `psql "$DATABASE_URL" -f db/migrations/12_create_color_overrides.sql`
Expected: `CREATE TABLE`, `CREATE INDEX` x3

- [ ] **Step 3: Commit**

```bash
git add db/migrations/12_create_color_overrides.sql
git commit -m "feat: add color_overrides table for DB-backed color settings"
```

---

## Task 7: Color overrides API routes

**Files:**
- Create: `app/api/settings/colors/route.ts`
- Create: `app/api/admin/colors/route.ts`

- [ ] **Step 1: Create user-level color API**

Create `app/api/settings/colors/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  // Fetch user overrides + admin defaults for this account
  const { rows } = await pool.query(
    `SELECT id, user_email, connection_id, class_group_code, color
     FROM color_overrides
     WHERE account_id = $1 AND (user_email = $2 OR user_email IS NULL)
     ORDER BY user_email NULLS LAST, connection_id NULLS LAST`,
    [session.accountId, session.email]
  )

  return NextResponse.json(rows)
}

export async function PUT(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { classGroupCode, color, connectionId } = await req.json()
  if (!classGroupCode || !color) {
    return NextResponse.json({ error: 'classGroupCode and color required' }, { status: 400 })
  }

  await pool.query(
    `INSERT INTO color_overrides (account_id, user_email, connection_id, class_group_code, color)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (account_id, COALESCE(user_email, ''), COALESCE(connection_id::text, ''), class_group_code)
     DO UPDATE SET color = $5, updated_at = now()`,
    [session.accountId, session.email, connectionId || null, classGroupCode, color]
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { classGroupCode, connectionId } = await req.json()
  if (!classGroupCode) {
    return NextResponse.json({ error: 'classGroupCode required' }, { status: 400 })
  }

  if (connectionId) {
    await pool.query(
      `DELETE FROM color_overrides WHERE account_id = $1 AND user_email = $2 AND connection_id = $3 AND class_group_code = $4`,
      [session.accountId, session.email, connectionId, classGroupCode]
    )
  } else {
    await pool.query(
      `DELETE FROM color_overrides WHERE account_id = $1 AND user_email = $2 AND connection_id IS NULL AND class_group_code = $3`,
      [session.accountId, session.email, classGroupCode]
    )
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Create admin-level color API**

Create `app/api/admin/colors/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAdminAccountId } from '@/lib/adminAccountId'

export async function GET() {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { rows } = await pool.query(
    `SELECT id, connection_id, class_group_code, color
     FROM color_overrides
     WHERE account_id = $1 AND user_email IS NULL
     ORDER BY connection_id NULLS LAST`,
    [session.accountId]
  )

  return NextResponse.json(rows)
}

export async function PUT(req: NextRequest) {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { classGroupCode, color, connectionId } = await req.json()
  if (!classGroupCode || !color) {
    return NextResponse.json({ error: 'classGroupCode and color required' }, { status: 400 })
  }

  await pool.query(
    `INSERT INTO color_overrides (account_id, user_email, connection_id, class_group_code, color)
     VALUES ($1, NULL, $2, $3, $4)
     ON CONFLICT (account_id, COALESCE(user_email, ''), COALESCE(connection_id::text, ''), class_group_code)
     DO UPDATE SET color = $4, updated_at = now()`,
    [session.accountId, connectionId || null, classGroupCode, color]
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { classGroupCode, connectionId } = await req.json()
  if (!classGroupCode) {
    return NextResponse.json({ error: 'classGroupCode required' }, { status: 400 })
  }

  if (connectionId) {
    await pool.query(
      `DELETE FROM color_overrides WHERE account_id = $1 AND user_email IS NULL AND connection_id = $2 AND class_group_code = $3`,
      [session.accountId, connectionId, classGroupCode]
    )
  } else {
    await pool.query(
      `DELETE FROM color_overrides WHERE account_id = $1 AND user_email IS NULL AND connection_id IS NULL AND class_group_code = $2`,
      [session.accountId, classGroupCode]
    )
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/settings/colors/route.ts app/api/admin/colors/route.ts
git commit -m "feat: add color overrides API routes (user + admin)"
```

---

## Task 8: Update `activityColors.ts` — DB override hierarchy

**Files:**
- Modify: `lib/activityColors.ts`
- Modify: `__tests__/lib/activityColors.test.ts`

- [ ] **Step 1: Write tests for the new resolution function**

Add to `__tests__/lib/activityColors.test.ts`:

```typescript
import { resolveColorWithOverrides } from '@/lib/activityColors'

describe('resolveColorWithOverrides', () => {
  const classGroups = [
    { code: 'MTG', calColNr: 'Sky Blue' as string | number | undefined },
    { code: 'INT', calColNr: undefined },
  ]

  it('returns ERP color when no overrides exist', () => {
    const result = resolveColorWithOverrides('MTG', null, classGroups, 0, [])
    expect(result).toBe('#00ABCE') // Sky Blue
  })

  it('returns palette fallback when no calColNr and no overrides', () => {
    const result = resolveColorWithOverrides('INT', null, classGroups, 1, [])
    expect(result).toBe(BRAND_PALETTE[1])
  })

  it('user global override beats ERP color', () => {
    const overrides = [
      { user_email: 'user@test.com', connection_id: null, class_group_code: 'MTG', color: '#ff0000' },
    ]
    const result = resolveColorWithOverrides('MTG', null, classGroups, 0, overrides)
    expect(result).toBe('#ff0000')
  })

  it('user per-connection override beats user global', () => {
    const overrides = [
      { user_email: 'user@test.com', connection_id: null, class_group_code: 'MTG', color: '#ff0000' },
      { user_email: 'user@test.com', connection_id: 'conn-1', class_group_code: 'MTG', color: '#00ff00' },
    ]
    const result = resolveColorWithOverrides('MTG', 'conn-1', classGroups, 0, overrides)
    expect(result).toBe('#00ff00')
  })

  it('admin global override beats ERP color', () => {
    const overrides = [
      { user_email: null, connection_id: null, class_group_code: 'MTG', color: '#0000ff' },
    ]
    const result = resolveColorWithOverrides('MTG', null, classGroups, 0, overrides)
    expect(result).toBe('#0000ff')
  })

  it('user global beats admin global', () => {
    const overrides = [
      { user_email: null, connection_id: null, class_group_code: 'MTG', color: '#0000ff' },
      { user_email: 'user@test.com', connection_id: null, class_group_code: 'MTG', color: '#ff0000' },
    ]
    const result = resolveColorWithOverrides('MTG', null, classGroups, 0, overrides)
    expect(result).toBe('#ff0000')
  })

  it('admin per-connection beats admin global', () => {
    const overrides = [
      { user_email: null, connection_id: null, class_group_code: 'MTG', color: '#0000ff' },
      { user_email: null, connection_id: 'conn-1', class_group_code: 'MTG', color: '#00ff00' },
    ]
    const result = resolveColorWithOverrides('MTG', 'conn-1', classGroups, 0, overrides)
    expect(result).toBe('#00ff00')
  })

  it('falls back through hierarchy correctly: user-conn > user-global > admin-conn > admin-global > ERP > palette', () => {
    // Only admin global set for MTG
    const overrides = [
      { user_email: null, connection_id: null, class_group_code: 'MTG', color: '#admin' },
    ]
    // No user override, no connection-specific → falls to admin global
    expect(resolveColorWithOverrides('MTG', 'conn-1', classGroups, 0, overrides)).toBe('#admin')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/lib/activityColors.test.ts --no-cache`
Expected: FAIL — `resolveColorWithOverrides` not found

- [ ] **Step 3: Implement `resolveColorWithOverrides`**

Add to `lib/activityColors.ts` after the existing `getActivityColor` function:

```typescript
export interface ColorOverrideRow {
  user_email: string | null
  connection_id: string | null
  class_group_code: string
  color: string
}

/**
 * Resolve the color for a class group code using the 6-level override hierarchy:
 * 1. user per-connection → 2. user global → 3. admin per-connection →
 * 4. admin global → 5. ERP CalColNr → 6. palette fallback
 */
export function resolveColorWithOverrides(
  classGroupCode: string,
  connectionId: string | null,
  classGroups: { code: string; calColNr?: string | number }[],
  groupIndex: number,
  overrides: ColorOverrideRow[],
): string {
  // 1. User per-connection
  if (connectionId) {
    const match = overrides.find(o => o.class_group_code === classGroupCode && o.user_email !== null && o.connection_id === connectionId)
    if (match) return match.color
  }
  // 2. User global
  const userGlobal = overrides.find(o => o.class_group_code === classGroupCode && o.user_email !== null && o.connection_id === null)
  if (userGlobal) return userGlobal.color
  // 3. Admin per-connection
  if (connectionId) {
    const match = overrides.find(o => o.class_group_code === classGroupCode && o.user_email === null && o.connection_id === connectionId)
    if (match) return match.color
  }
  // 4. Admin global
  const adminGlobal = overrides.find(o => o.class_group_code === classGroupCode && o.user_email === null && o.connection_id === null)
  if (adminGlobal) return adminGlobal.color
  // 5. ERP CalColNr
  const group = classGroups.find(g => g.code === classGroupCode)
  if (group) {
    const erpColor = calColNrToColor(group.calColNr)
    if (erpColor) return erpColor
  }
  // 6. Palette fallback
  return BRAND_PALETTE[groupIndex % BRAND_PALETTE.length]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/lib/activityColors.test.ts --no-cache`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add lib/activityColors.ts __tests__/lib/activityColors.test.ts
git commit -m "feat: add resolveColorWithOverrides with 6-level hierarchy"
```

---

## Task 9: Update CalendarShell to use DB color overrides

**Files:**
- Modify: `components/CalendarShell.tsx`

- [ ] **Step 1: Add color override state and fetch**

In `components/CalendarShell.tsx`, add the import at the top (alongside existing activityColors imports):

```typescript
import {
  buildClassGroupColorMap, getActivityColor, loadColorOverrides,
  resolveColorWithOverrides, OUTLOOK_COLOR, FALLBACK_COLOR,
  type ColorOverrideRow,
} from '@/lib/activityColors'
```

Add state for DB overrides near the other state declarations (around line 26):

```typescript
const [dbColorOverrides, setDbColorOverrides] = useState<ColorOverrideRow[]>([])
```

- [ ] **Step 2: Fetch DB overrides on mount and migrate localStorage**

Add a new `useEffect` after the existing color-loading effect (after line 300):

```typescript
// Fetch DB color overrides and migrate localStorage on mount
useEffect(() => {
  fetch('/api/settings/colors')
    .then(r => r.json())
    .then(async (rows: ColorOverrideRow[]) => {
      setDbColorOverrides(Array.isArray(rows) ? rows : [])

      // One-time migration: move localStorage overrides to DB
      const local = loadColorOverrides()
      const localKeys = Object.keys(local)
      if (localKeys.length > 0 && rows.filter(r => r.user_email !== null).length === 0) {
        await Promise.all(localKeys.map(code =>
          fetch('/api/settings/colors', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ classGroupCode: code, color: local[code] }),
          }).catch(() => {})
        ))
        try { localStorage.removeItem('activityClassGroupColors') } catch {}
        // Refetch to get migrated overrides
        const res = await fetch('/api/settings/colors')
        const migrated = await res.json()
        setDbColorOverrides(Array.isArray(migrated) ? migrated : [])
      }
    })
    .catch(() => {})
}, [])
```

- [ ] **Step 3: Update `colorForActivity` to use DB overrides**

Replace the existing `colorForActivity` function (around line 260) to use the new hierarchy when DB overrides are available:

```typescript
function colorForActivity(activity: Activity): string {
  if (activity.icsColor) return activity.icsColor
  if (activity.source === 'outlook' && !activity.isExternal) return OUTLOOK_COLOR
  if (!activity.activityTypeCode) return FALLBACK_COLOR
  const grp = typeToClassGroup.get(activity.activityTypeCode)
  if (!grp) return FALLBACK_COLOR

  if (dbColorOverrides.length > 0) {
    const groupIndex = classGroups.findIndex(g => g.code === grp)
    return resolveColorWithOverrides(grp, activity.erpConnectionId ?? null, classGroups, groupIndex >= 0 ? groupIndex : 0, dbColorOverrides)
  }

  return classGroupToColor.get(grp) ?? FALLBACK_COLOR
}
```

- [ ] **Step 4: Verify in browser**

Run dev server, check that calendar colors still render correctly.
Expected: No visual change unless DB overrides exist.

- [ ] **Step 5: Commit**

```bash
git add components/CalendarShell.tsx
git commit -m "feat: wire CalendarShell to DB color overrides with localStorage migration"
```

---

## Task 10: Color overrides panel — shared UI component

**Files:**
- Create: `components/ColorOverridesPanel.tsx`

- [ ] **Step 1: Create the side-by-side color editor component**

```typescript
'use client'
import { useState } from 'react'
import { ActivityClassGroup } from '@/types'
import { BRAND_PALETTE, calColNrToColor } from '@/lib/activityColors'
import type { ColorOverrideRow } from '@/lib/activityColors'

interface Connection { id: string; name: string }

interface Props {
  classGroups: ActivityClassGroup[]
  connections: Connection[]
  overrides: ColorOverrideRow[]
  /** 'user' shows user overrides over admin defaults; 'admin' shows only admin overrides */
  mode: 'user' | 'admin'
  onSave: (classGroupCode: string, color: string, connectionId: string | null) => Promise<void>
  onDelete: (classGroupCode: string, connectionId: string | null) => Promise<void>
}

export default function ColorOverridesPanel({ classGroups, connections, overrides, mode, onSave, onDelete }: Props) {
  const [saving, setSaving] = useState<string | null>(null)

  function getOverride(groupCode: string, connectionId: string | null, isUser: boolean): ColorOverrideRow | undefined {
    return overrides.find(o =>
      o.class_group_code === groupCode &&
      (isUser ? o.user_email !== null : o.user_email === null) &&
      (connectionId ? o.connection_id === connectionId : o.connection_id === null)
    )
  }

  function resolvedColor(groupCode: string, connectionId: string | null, groupIndex: number): { color: string; source: 'user-conn' | 'user-global' | 'admin-conn' | 'admin-global' | 'erp' | 'palette' } {
    if (mode === 'user') {
      if (connectionId) {
        const uc = getOverride(groupCode, connectionId, true)
        if (uc) return { color: uc.color, source: 'user-conn' }
      }
      const ug = getOverride(groupCode, null, true)
      if (ug) return { color: ug.color, source: 'user-global' }
    }
    if (connectionId) {
      const ac = getOverride(groupCode, connectionId, false)
      if (ac) return { color: ac.color, source: 'admin-conn' }
    }
    const ag = getOverride(groupCode, null, false)
    if (ag) return { color: ag.color, source: 'admin-global' }

    const group = classGroups.find(g => g.code === groupCode)
    const erpColor = group ? calColNrToColor(group.calColNr) : undefined
    if (erpColor) return { color: erpColor, source: 'erp' }
    return { color: BRAND_PALETTE[groupIndex % BRAND_PALETTE.length], source: 'palette' }
  }

  function isInherited(groupCode: string, connectionId: string | null): boolean {
    if (mode === 'user') {
      const own = getOverride(groupCode, connectionId, true)
      return !own
    }
    const own = getOverride(groupCode, connectionId, false)
    return !own
  }

  async function handleColorPick(groupCode: string, color: string, connectionId: string | null) {
    const key = `${groupCode}-${connectionId ?? 'global'}`
    setSaving(key)
    await onSave(groupCode, color, connectionId)
    setSaving(null)
  }

  async function handleReset(groupCode: string, connectionId: string | null) {
    const key = `${groupCode}-${connectionId ?? 'global'}`
    setSaving(key)
    await onDelete(groupCode, connectionId)
    setSaving(null)
  }

  function renderColumn(connectionId: string | null, label: string, isPrimary: boolean) {
    return (
      <div className="flex-1 min-w-[140px]">
        <div className={`font-bold text-[11px] uppercase tracking-wide mb-3 pb-2 border-b-2 ${isPrimary ? 'text-primary border-primary' : 'text-text-muted border-border'}`}>
          {label}
        </div>
        <div className="space-y-2">
          {classGroups.map((g, idx) => {
            const inherited = isInherited(g.code, connectionId)
            const { color } = resolvedColor(g.code, connectionId, idx)
            const savingKey = `${g.code}-${connectionId ?? 'global'}`

            return (
              <div
                key={g.code}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md border transition-colors ${
                  inherited ? 'border-dashed border-border/60 opacity-50' : 'border-border'
                }`}
              >
                <label className="relative cursor-pointer shrink-0">
                  <div
                    className="w-5 h-5 rounded"
                    style={{ background: color, border: `2px solid ${color}44` }}
                  />
                  <input
                    type="color"
                    value={color}
                    onChange={e => handleColorPick(g.code, e.target.value, connectionId)}
                    className="sr-only"
                    disabled={saving === savingKey}
                  />
                </label>
                <span className={`text-xs truncate flex-1 ${inherited ? 'italic text-text-muted' : ''}`}>
                  {inherited ? 'inherited' : (g.name || g.code)}
                </span>
                {!inherited && (
                  <button
                    onClick={() => handleReset(g.code, connectionId)}
                    className="text-[9px] text-text-muted hover:text-text shrink-0"
                    disabled={saving === savingKey}
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {renderColumn(null, 'All Connections', true)}
      {connections.map(c => renderColumn(c.id, c.name, false))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ColorOverridesPanel.tsx
git commit -m "feat: add shared ColorOverridesPanel component"
```

---

## Task 11: Add "Colors" tab to SettingsModal

**Files:**
- Modify: `components/SettingsModal.tsx`

- [ ] **Step 1: Update the Tab type and add color state**

In `components/SettingsModal.tsx`:

Change the Tab type (line 33):

```typescript
type Tab = 'style' | 'calendars' | 'colors'
```

Add imports at the top:

```typescript
import ColorOverridesPanel from './ColorOverridesPanel'
import type { ColorOverrideRow } from '@/lib/activityColors'
```

Update the Props interface to add what we need:

```typescript
interface Props {
  classGroups: ActivityClassGroup[]
  colorMap: Map<string, string>
  persons: { code: string; name: string }[]
  connections: { id: string; name: string }[]
  colorOverrides: ColorOverrideRow[]
  error?: string | null
  onClose: () => void
  onColorChange: (groupCode: string, color: string) => void
  onColorOverridesChange: () => void
}
```

Update the destructured props:

```typescript
export default function SettingsModal({ classGroups, colorMap, persons, connections, colorOverrides, error, onClose, onColorChange, onColorOverridesChange }: Props) {
```

- [ ] **Step 2: Add the Colors tab button and content**

Add the tab button after the Calendars button (around line 183):

```tsx
<button
  onClick={() => setActiveTab('colors')}
  className={`pb-2 px-1 ${activeTab === 'colors' ? 'border-b-2 border-primary text-primary font-bold' : 'text-text-muted hover:text-text'}`}
>
  Colors
</button>
```

Add the tab content inside the scrollable area, after the calendars tab content (before the closing `</div>` of the scroll area):

```tsx
{activeTab === 'colors' && (
  <div className="space-y-4">
    <p className="text-[10px] text-text-muted uppercase font-bold tracking-wide">Activity Group Colors</p>
    <p className="text-xs text-text-muted">Click a color swatch to change it. Colors sync across all your devices.</p>
    <ColorOverridesPanel
      classGroups={classGroups}
      connections={connections}
      overrides={colorOverrides}
      mode="user"
      onSave={async (code, color, connId) => {
        await fetch('/api/settings/colors', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classGroupCode: code, color, connectionId: connId }),
        })
        onColorOverridesChange()
      }}
      onDelete={async (code, connId) => {
        await fetch('/api/settings/colors', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classGroupCode: code, connectionId: connId }),
        })
        onColorOverridesChange()
      }}
    />
  </div>
)}
```

- [ ] **Step 3: Update CalendarShell to pass the new props**

In `components/CalendarShell.tsx`, find where `SettingsModal` is rendered and add the new props:

```tsx
<SettingsModal
  classGroups={classGroups}
  colorMap={classGroupToColor}
  persons={state.selectedPersons}
  connections={erpConnections}
  colorOverrides={dbColorOverrides}
  error={classGroupsError}
  onClose={() => setColorSettingsOpen(false)}
  onColorChange={(groupCode, color) => {
    setColorOverrides(prev => ({ ...prev, [groupCode]: color }))
  }}
  onColorOverridesChange={() => {
    fetch('/api/settings/colors').then(r => r.json()).then(rows => {
      setDbColorOverrides(Array.isArray(rows) ? rows : [])
    }).catch(() => {})
  }}
/>
```

- [ ] **Step 4: Verify in browser**

Run dev server, open Settings modal, click "Colors" tab.
Expected: Side-by-side columns showing class groups with color swatches per connection. Clicking a swatch opens the color picker. Changes persist across page reloads.

- [ ] **Step 5: Commit**

```bash
git add components/SettingsModal.tsx components/CalendarShell.tsx
git commit -m "feat: add Colors tab to Settings modal with DB-backed overrides"
```

---

## Task 12: Admin color defaults in Config page

**Files:**
- Modify: `app/admin/config/ConfigClient.tsx`

- [ ] **Step 1: Add color settings section to ConfigClient**

At the top of `ConfigClient.tsx`, add imports:

```typescript
import ColorOverridesPanel from '@/components/ColorOverridesPanel'
import type { ColorOverrideRow } from '@/lib/activityColors'
```

Add state for admin color overrides and class groups in the component:

```typescript
const [adminColorOverrides, setAdminColorOverrides] = useState<ColorOverrideRow[]>([])
const [adminClassGroups, setAdminClassGroups] = useState<{ code: string; name: string; calColNr?: string | number }[]>([])
const [colorSectionOpen, setColorSectionOpen] = useState(false)
```

Add a fetch effect for both:

```typescript
useEffect(() => {
  fetch('/api/admin/colors').then(r => r.json()).then(rows => {
    setAdminColorOverrides(Array.isArray(rows) ? rows : [])
  }).catch(() => {})
  fetch('/api/activity-class-groups').then(r => r.json()).then(groups => {
    setAdminClassGroups(Array.isArray(groups) ? groups : [])
  }).catch(() => {})
}, [])
```

Add the collapsible section after the ERP connections section in the JSX:

```tsx
{/* Activity Color Defaults */}
<div className="bg-surface border border-border rounded-xl overflow-hidden">
  <button
    onClick={() => setColorSectionOpen(o => !o)}
    className="w-full flex items-center justify-between px-4 py-3 hover:bg-border/20 transition-colors"
  >
    <span className="text-sm font-bold">Activity Color Defaults</span>
    <span className="text-text-muted text-xs">{colorSectionOpen ? '▼' : '▶'}</span>
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
```

Note: `erpConnections` should already be available as state in ConfigClient — it's the list fetched for the ERP connections section. If the variable name differs, use the existing ERP connections state variable.

- [ ] **Step 2: Verify in browser**

Navigate to `/admin/config`, expand "Activity Color Defaults" section.
Expected: Side-by-side columns for admin color defaults. Changes apply as account-wide defaults.

- [ ] **Step 3: Commit**

```bash
git add app/admin/config/ConfigClient.tsx
git commit -m "feat: add admin color defaults section in Config page"
```

---

## Task 13: Final integration test

- [ ] **Step 1: Run the full test suite**

Run: `npx jest --no-cache`
Expected: All tests pass (individual files — the full suite may still hang per known issue)

- [ ] **Step 2: Run individual test files if suite hangs**

Run: `npx jest __tests__/lib/activityColors.test.ts __tests__/lib/apiTokens.test.ts --no-cache`
Expected: PASS

- [ ] **Step 3: Verify end-to-end in browser**

1. Create an API token in `/admin/tokens`, verify it appears in the table
2. Use the token with curl: `curl -H "Authorization: Bearer hcal_..." localhost:3000/api/export/analytics`
3. Revoke the token, verify the curl now returns 401
4. Open Settings → Colors, change a class group color, verify it persists on page reload
5. Open Settings → Colors on a different connection column, set a per-connection override
6. Check the calendar view — verify the per-connection color shows correctly
7. Open `/admin/config` → Activity Color Defaults, set an admin default, verify it applies when user has no override

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration test fixes for tokens and colors"
```
