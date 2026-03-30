'use client'
import { useEffect, useRef } from 'react'

interface Props {
  onClose: () => void
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const cmd = isMac ? '⌘' : 'Ctrl'
const ctrl = isMac ? '⌃' : 'Ctrl'

const SHORTCUTS = [
  { group: 'Navigation' },
  { key: '←  →', desc: 'Previous / next day' },
  { key: `${ctrl}${cmd}←  ${ctrl}${cmd}→`, desc: 'Jump by view period (1 / 3 / 5 days)' },
  { key: `T  or  ${ctrl}${cmd}T`, desc: 'Jump to today' },
  { group: 'Activities' },
  { key: `${ctrl}${cmd}N`, desc: 'New activity' },
  { key: `${ctrl}${cmd}S`, desc: 'Save activity (in form)' },
  { key: `${ctrl}${cmd}Y`, desc: 'Duplicate / copy activity' },
  { key: `${ctrl}${cmd}O`, desc: 'Open activity in Standard ERP' },
  { key: 'Esc', desc: 'Close form / modal' },
  { group: 'In activity type / project / customer fields' },
  { key: '↑  ↓', desc: 'Move through search results' },
  { key: 'Enter / Tab', desc: 'Select focused result and advance' },
  { key: 'Tab', desc: 'Move to next field (date is skipped)' },
  { group: 'App' },
  { key: 'Z', desc: 'Toggle zoom (1× / 2×)' },
  { key: '?', desc: 'Show this keyboard shortcuts panel' },
]

export default function KeyboardShortcutsModal({ onClose }: Props) {
  const swipeStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        onTouchStart={e => { swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
        onTouchEnd={e => {
          if (swipeStart.current !== null) {
            const dx = e.changedTouches[0].clientX - swipeStart.current.x
            const dy = e.changedTouches[0].clientY - swipeStart.current.y
            if (dy > 80 && dy > Math.abs(dx)) onClose()
            else if (dx < -80 && Math.abs(dx) > Math.abs(dy)) onClose()
          }
          swipeStart.current = null
        }}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-bold">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-text-muted text-xl leading-none">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-1">
          {SHORTCUTS.map((s, i) =>
            'group' in s ? (
              <p key={i} className="text-xs text-text-muted uppercase tracking-wide pt-3 pb-1 first:pt-0">{s.group}</p>
            ) : (
              <div key={i} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-text-muted">{s.desc}</span>
                <kbd className="ml-4 shrink-0 font-mono text-xs bg-bg border border-border rounded px-2 py-0.5 text-text-muted">{s.key}</kbd>
              </div>
            )
          )}
        </div>
        <div className="p-4 border-t border-border">
          <button onClick={onClose} className="w-full bg-primary text-white font-bold py-3 rounded-xl">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
