'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'

interface Props {
  email: string
  accountName: string
  accountId: string
  isSuperAdmin: boolean
  accounts?: { id: string; display_name: string }[]
  children: React.ReactNode
}

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
  )},
  { href: '/admin/members', label: 'Members', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  )},
  { href: '/admin/config', label: 'Config', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  )},
  { href: '/admin/analytics', label: 'Analytics', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
  )},
  { href: '/admin/tokens', label: 'Tokens', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
  )},
  { href: '/admin/cache', label: 'Cache', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>
  )},
]

const SUPER_ADMIN_ITEM = { href: '/admin/accounts', label: 'Accounts', icon: (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
)}

export default function AdminShell({ email, accountName, accountId, isSuperAdmin, accounts, children }: Props) {
  const pathname = usePathname()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex h-screen bg-bg text-text">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex flex-col w-56 bg-surface border-r border-border shrink-0">
        <div className="p-4 border-b border-border">
          <Link href="/cal" className="font-bold text-base">
            herbe<span className="text-primary">.</span>calendar
          </Link>
          {isSuperAdmin && accounts && accounts.length > 1 ? (
            <select
              value={accountId}
              onChange={e => {
                fetch('/api/admin/switch-account', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ accountId: e.target.value }),
                }).then(() => window.location.reload())
              }}
              className="mt-1 w-full bg-bg border border-border rounded text-[10px] text-text-muted px-1 py-0.5"
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.display_name}</option>
              ))}
            </select>
          ) : (
            <p className="text-[10px] text-text-muted mt-1 truncate">{accountName}</p>
          )}
        </div>
        <nav className="flex-1 py-2">
          {NAV_ITEMS.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary font-bold border-r-2 border-primary'
                    : 'text-text-muted hover:text-text hover:bg-border/30'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
          {isSuperAdmin && (
            <>
              <div className="mx-4 my-2 border-t border-border" />
              <Link
                href="/admin/accounts"
                className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                  pathname.startsWith('/admin/accounts')
                    ? 'bg-primary/10 text-primary font-bold border-r-2 border-primary'
                    : 'text-text-muted hover:text-text hover:bg-border/30'
                }`}
              >
                {SUPER_ADMIN_ITEM.icon} Accounts
              </Link>
            </>
          )}
        </nav>
        <div className="p-4 border-t border-border">
          <p className="text-[10px] text-text-muted truncate">{email}</p>
          {isSuperAdmin && (
            <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded mt-1 inline-block">
              Super Admin
            </span>
          )}
          <Link href="/cal" className="block mt-2 text-xs text-text-muted hover:text-primary">
            ← Back to Calendar
          </Link>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
          <Link href="/cal" className="font-bold text-sm">
            herbe<span className="text-primary">.</span>calendar
          </Link>
          {isSuperAdmin && accounts && accounts.length > 1 ? (
            <select
              value={accountId}
              onChange={e => {
                fetch('/api/admin/switch-account', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ accountId: e.target.value }),
                }).then(() => window.location.reload())
              }}
              className="bg-bg border border-border rounded text-[10px] text-text-muted px-1 py-0.5 max-w-[120px]"
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.display_name}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-text-muted">{accountName}</span>
          )}
          <button
            onClick={() => setMobileNavOpen(o => !o)}
            className="text-text-muted text-lg"
          >☰</button>
        </header>

        {/* Icon toolbar — always visible on mobile */}
        <nav className="lg:hidden flex items-center justify-around bg-surface border-b border-border px-1 py-1.5">
          {NAV_ITEMS.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
                  active ? 'text-primary' : 'text-text-muted hover:text-text'
                }`}
                title={item.label}
              >
                {item.icon}
                <span className="text-[8px] font-bold">{item.label}</span>
              </Link>
            )
          })}
          {isSuperAdmin && (() => {
            const active = pathname.startsWith(SUPER_ADMIN_ITEM.href)
            return (
              <Link
                href={SUPER_ADMIN_ITEM.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
                  active ? 'text-primary' : 'text-text-muted hover:text-text'
                }`}
                title={SUPER_ADMIN_ITEM.label}
              >
                {SUPER_ADMIN_ITEM.icon}
                <span className="text-[8px] font-bold">{SUPER_ADMIN_ITEM.label}</span>
              </Link>
            )
          })()}
          <Link
            href="/cal"
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-text-muted hover:text-primary transition-colors"
            title="Calendar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span className="text-[8px] font-bold">Calendar</span>
          </Link>
        </nav>

        {/* Hamburger dropdown — labels with icons for accessibility */}
        {mobileNavOpen && (
          <nav className="lg:hidden bg-surface border-b border-border px-4 py-2 space-y-1">
            {NAV_ITEMS.map(item => {
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold ${
                    active ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-border/30'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              )
            })}
            {isSuperAdmin && (
              <Link
                href="/admin/accounts"
                onClick={() => setMobileNavOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold ${
                  pathname.startsWith('/admin/accounts') ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-border/30'
                }`}
              >
                {SUPER_ADMIN_ITEM.icon}
                Accounts
              </Link>
            )}
            <Link
              href="/cal"
              onClick={() => setMobileNavOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-primary"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              ← Calendar
            </Link>
          </nav>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
