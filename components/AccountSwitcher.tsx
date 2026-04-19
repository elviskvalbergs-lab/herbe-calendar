'use client'
import { useState, useEffect, useRef } from 'react'

interface Account {
  id: string
  display_name: string
  logo_url?: string
}

interface Props {
  currentAccountId: string
  onClose: () => void
}

export default function AccountSwitcher({ currentAccountId, onClose }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/settings/accounts')
      .then(r => r.json())
      .then(data => {
        setAccounts(data.accounts ?? [])
        // Focus current account
        const idx = (data.accounts ?? []).findIndex((a: Account) => a.id === currentAccountId)
        setFocusedIdx(idx >= 0 ? idx : 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [currentAccountId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, accounts.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' && focusedIdx >= 0 && focusedIdx < accounts.length) {
        e.preventDefault()
        switchTo(accounts[focusedIdx].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [accounts, focusedIdx, onClose])

  async function switchTo(accountId: string) {
    if (accountId === currentAccountId) { onClose(); return }
    await fetch('/api/settings/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    })
    window.location.href = '/cal'
  }

  const currentName = accounts.find(a => a.id === currentAccountId)?.display_name

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div ref={modalRef} className="relative bg-surface border border-border shadow-2xl rounded-2xl w-full max-w-xs overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <h2 className="text-sm font-bold">Switch Account</h2>
          {currentName && <p className="text-[10px] text-text-muted mt-0.5">Current: {currentName}</p>}
        </div>

        {loading ? (
          <div className="p-4 text-xs text-text-muted text-center animate-pulse">Loading accounts...</div>
        ) : (
          <div role="listbox" aria-label="Accounts" className="px-2 pb-2">
            {accounts.map((a, idx) => {
              const isCurrent = a.id === currentAccountId
              return (
                <button
                  key={a.id}
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => switchTo(a.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 transition-colors ${
                    focusedIdx === idx ? 'bg-primary/15' : 'hover:bg-border/30'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden ${
                    isCurrent ? 'bg-primary text-white' : 'bg-border text-text-muted'
                  }`}>
                    {a.logo_url
                      ? <img src={a.logo_url} alt="" className="w-full h-full object-cover" />
                      : a.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold truncate ${isCurrent ? 'text-primary' : ''}`}>{a.display_name}</p>
                    {isCurrent && <p className="text-[10px] text-primary">Active</p>}
                  </div>
                  {isCurrent && <span className="text-primary text-xs">✓</span>}
                </button>
              )
            })}
            {accounts.length <= 1 && (
              <p className="text-[10px] text-text-muted text-center py-2 mt-1 border-t border-border pt-3">
                To switch accounts, your email must be added as a member in the other account.
              </p>
            )}
          </div>
        )}

        <div className="px-4 py-2 border-t border-border flex justify-between items-center">
          <span className="text-[9px] text-text-muted">⌃⌘A to toggle</span>
          <button onClick={onClose} className="text-xs text-text-muted hover:text-text">Close</button>
        </div>
      </div>
    </div>
  )
}
