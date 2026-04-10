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
  { href: '/admin/dashboard', label: 'Dashboard', icon: '◻' },
  { href: '/admin/members', label: 'Members', icon: '👥' },
  { href: '/admin/config', label: 'Connections', icon: '⚙' },
  { href: '/admin/analytics', label: 'Analytics', icon: '📊' },
  { href: '/admin/tokens', label: 'API Tokens', icon: '🔑' },
]

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
                document.cookie = `adminAccountId=${e.target.value};path=/;max-age=86400`
                window.location.reload()
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
                <span>🏢</span> Accounts
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
                document.cookie = `adminAccountId=${e.target.value};path=/;max-age=86400`
                window.location.reload()
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
        {mobileNavOpen && (
          <nav className="lg:hidden bg-surface border-b border-border px-4 py-2 flex flex-wrap gap-2">
            {NAV_ITEMS.map(item => {
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    active ? 'bg-primary text-white' : 'bg-border/30 text-text-muted'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
            {isSuperAdmin && (
              <Link
                href="/admin/accounts"
                onClick={() => setMobileNavOpen(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  pathname.startsWith('/admin/accounts') ? 'bg-primary text-white' : 'bg-border/30 text-text-muted'
                }`}
              >
                Accounts
              </Link>
            )}
            <Link
              href="/cal"
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-primary/30 text-primary"
            >
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
