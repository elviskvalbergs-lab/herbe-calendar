'use client'
import { useEffect, useRef } from 'react'
import { useFocusTrap } from '@/lib/useFocusTrap'

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
  { key: `${ctrl}${cmd}A`, desc: 'Switch account' },
  { key: 'C', desc: 'Toggle calendar sources' },
  { key: 'Z', desc: 'Toggle zoom (1× / 2×)' },
  { key: '?', desc: 'Show this keyboard shortcuts panel' },
]

export default function KeyboardShortcutsModal({ onClose }: Props) {
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const dialogRef = useFocusTrap<HTMLDivElement>(true)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" style={{ background: 'rgba(10,18,16,0.55)', backdropFilter: 'blur(2px)' }}>
      <div className="absolute inset-0" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        className="modal relative w-full max-w-md"
        style={{ maxHeight: '80vh', borderRadius: '12px 12px 0 0' }}
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
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--app-line-strong)' }} />
        </div>
        <div className="modal-header">
          <h2 id="keyboard-shortcuts-title" className="mh-title">Keyboard Shortcuts</h2>
          <div className="ml-auto" />
          <button onClick={onClose} aria-label="Close" className="icon-btn">✕</button>
        </div>
        <div className="modal-body space-y-1">
          {SHORTCUTS.map((s, i) =>
            'group' in s ? (
              <p key={i} className="b-eyebrow" style={{ paddingTop: i === 0 ? 0 : 'var(--space-3)', paddingBottom: 'var(--space-1)', marginBottom: 0 }}>{s.group}</p>
            ) : (
              <div key={i} className="flex items-center justify-between py-1.5">
                <span className="text-sm" style={{ color: 'var(--app-fg-muted)' }}>{s.desc}</span>
                <span className="kbd ml-4 shrink-0">{s.key}</span>
              </div>
            )
          )}
        </div>
        <div className="modal-footer">
          <div className="spacer" />
          <button onClick={onClose} className="btn btn-primary">Done</button>
        </div>
      </div>
    </div>
  )
}
