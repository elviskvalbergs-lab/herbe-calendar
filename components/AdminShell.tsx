'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'

interface Props {
  email: string
  accountName: string
  accountId: string
  isSuperAdmin: boolean
  accounts?: { id: string; display_name: string }[]
  children: React.ReactNode
}

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect width="10" height="10" x="3" y="3" rx="1"/><rect width="10" height="10" x="11" y="3" rx="1" opacity=".5"/><rect width="10" height="10" x="3" y="11" rx="1" opacity=".5"/><rect width="10" height="10" x="11" y="11" rx="1"/></svg>
  )},
  { href: '/admin/members', label: 'Members', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  )},
  { href: '/admin/config', label: 'Integrations', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-5M9 8V2M15 8V2M6 8h12a2 2 0 0 1 2 2v2a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6v-2a2 2 0 0 1 2-2z"/></svg>
  )},
  { href: '/admin/analytics', label: 'Analytics', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
  )},
  { href: '/admin/tokens', label: 'Tokens', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
  )},
  { href: '/admin/cache', label: 'Cache', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>
  )},
]

const SUPER_ADMIN_ITEM: NavItem = { href: '/admin/accounts', label: 'Accounts', icon: (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
)}

const MenuIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
)
const ChevRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
)
const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
)

export default function AdminShell({ email, accountName, accountId, isSuperAdmin, accounts, children }: Props) {
  const pathname = usePathname()
  // Desktop sidebar collapse state.
  const [sideOpen, setSideOpen] = useState(true)
  // Mobile drawer open state — false means hidden off-screen.
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    try { setSideOpen(localStorage.getItem('admin-sidebar-open') !== '0') } catch {}
  }, [])
  // Auto-close mobile drawer when navigating between routes.
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  const toggleSide = () => {
    setSideOpen(v => {
      try { localStorage.setItem('admin-sidebar-open', v ? '0' : '1') } catch {}
      return !v
    })
  }

  const allNavItems = isSuperAdmin ? [...NAV_ITEMS, SUPER_ADMIN_ITEM] : NAV_ITEMS
  const currentLabel = allNavItems.find(n => pathname.startsWith(n.href))?.label ?? 'Admin'
  const avatarCode = email.slice(0, 3).toUpperCase()

  // Sidebar markup is shared between desktop (in-flow, collapsible) and
  // mobile (slide-in drawer overlay).
  const renderSidebarBody = (mobile: boolean) => {
    const open = mobile ? true : sideOpen
    return (
      <>
        <div className="admin-sb-head" style={{ padding: open ? '20px 20px 18px' : '20px 10px 18px', justifyContent: open ? 'flex-start' : 'center' }}>
          <button
            className="admin-sb-logo"
            onClick={mobile ? () => setDrawerOpen(false) : toggleSide}
            title={mobile ? 'Close menu' : (open ? 'Collapse sidebar' : 'Expand sidebar')}
          >B</button>
          {open && (
            <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {isSuperAdmin && accounts && accounts.length > 1 ? (
                <>
                  <select
                    value={accountId}
                    onChange={e => {
                      fetch('/api/admin/switch-account', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accountId: e.target.value }),
                      }).then(() => window.location.reload())
                    }}
                    className="admin-sb-account-select"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.display_name}</option>
                    ))}
                  </select>
                  <div className="admin-sb-org-sub">Organization</div>
                </>
              ) : (
                <>
                  <div className="admin-sb-org-name">{accountName}</div>
                  <div className="admin-sb-org-sub">Organization</div>
                </>
              )}
            </div>
          )}
        </div>

        <nav className="admin-sb-nav">
          {NAV_ITEMS.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-sb-item ${active ? 'active' : ''}`}
                style={{
                  padding: open ? '10px 20px' : '10px 0',
                  justifyContent: open ? 'flex-start' : 'center',
                  gap: open ? 12 : 0,
                }}
                title={!open ? item.label : undefined}
              >
                {item.icon}
                {open && <span>{item.label}</span>}
              </Link>
            )
          })}
          {isSuperAdmin && (
            <>
              <div className="admin-sb-sep" />
              <Link
                href={SUPER_ADMIN_ITEM.href}
                className={`admin-sb-item ${pathname.startsWith(SUPER_ADMIN_ITEM.href) ? 'active' : ''}`}
                style={{
                  padding: open ? '10px 20px' : '10px 0',
                  justifyContent: open ? 'flex-start' : 'center',
                  gap: open ? 12 : 0,
                }}
                title={!open ? SUPER_ADMIN_ITEM.label : undefined}
              >
                {SUPER_ADMIN_ITEM.icon}
                {open && <span>{SUPER_ADMIN_ITEM.label}</span>}
              </Link>
            </>
          )}
        </nav>

        {open ? (
          <div className="admin-sb-foot">
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
            {isSuperAdmin && <span className="admin-sb-super">Super Admin</span>}
            <Link href="/cal" className="admin-sb-back">← Back to Calendar</Link>
          </div>
        ) : (
          <div className="admin-sb-foot-collapsed">
            <button onClick={toggleSide} title="Expand sidebar"><ChevRightIcon /></button>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="admin-shell">
      {/* Desktop sidebar — in-flow, collapsible width */}
      <aside
        className="admin-sidebar hidden lg:flex"
        style={{ width: sideOpen ? 240 : 56, transition: 'width 220ms cubic-bezier(0.2,0,0,1)' }}
      >
        {renderSidebarBody(false)}
      </aside>

      {/* Mobile drawer — slides in from the left */}
      <aside
        className="admin-sidebar admin-drawer lg:hidden"
        style={{
          width: 240,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
        aria-hidden={!drawerOpen}
      >
        {renderSidebarBody(true)}
      </aside>
      {drawerOpen && (
        <div
          className="admin-drawer-backdrop lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Main area */}
      <div className="admin-main">
        {/* Topbar — same shape on desktop and mobile, hamburger toggles drawer on mobile / collapse on desktop */}
        <header className="admin-topbar">
          <button
            className="admin-topbar-menu"
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setDrawerOpen(o => !o)
              } else {
                toggleSide()
              }
            }}
            title="Toggle navigation"
          >
            <MenuIcon />
          </button>
          <span className="admin-topbar-title">{currentLabel}</span>
          <div style={{ flex: 1 }} />
          <button className="admin-topbar-bell" title="Notifications">
            <BellIcon />
            <span className="admin-topbar-bell-dot" />
          </button>
          <div className="admin-topbar-user">
            <div className="admin-topbar-avatar">{avatarCode}</div>
            <span className="admin-topbar-email">{email}</span>
          </div>
        </header>

        <main className="admin-content">
          {children}
        </main>
      </div>
    </div>
  )
}
