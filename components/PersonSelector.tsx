'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Person } from '@/types'
import { personColor } from '@/lib/colors'

interface Props {
  people: Person[]
  selected: Person[]
  onChange: (persons: Person[]) => void
  onClose: () => void
}

export default function PersonSelector({ people, selected, onChange, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [local, setLocal] = useState<Person[]>(selected)
  const [mounted, setMounted] = useState(false)
  // Computed top offset so the modal sits just below the topbar, leaving
  // the already-selected person chips visible behind it.
  const [topOffset, setTopOffset] = useState(80)
  useEffect(() => {
    setMounted(true)
    const tb = document.querySelector('.topbar') as HTMLElement | null
    if (tb) setTopOffset(tb.getBoundingClientRect().bottom + 4)
  }, [])
  const swipeStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const filtered = people.filter(p =>
    p.code.toLowerCase().includes(query.toLowerCase()) ||
    p.name.toLowerCase().includes(query.toLowerCase())
  )

  function toggle(person: Person) {
    const next = local.find(p => p.code === person.code)
      ? local.filter(p => p.code !== person.code)
      : [...local, person]
    setLocal(next)
    onChange(next)  // immediate update to parent
  }

  if (!mounted) return null
  return createPortal(
    <div
      className="fixed left-0 right-0 bottom-0 flex items-start justify-center"
      style={{ top: topOffset, zIndex: 1000 }}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-selector-title"
        className="relative bg-surface border border-border rounded-2xl w-full max-w-sm flex flex-col mx-3 mt-2"
        style={{ maxHeight: `calc(100vh - ${topOffset}px - 16px)` }}
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
        <div className="p-4 border-b border-border">
          <h2 id="person-selector-title" className="font-bold mb-3">Select people</h2>
          <label htmlFor="person-search" className="sr-only">Search people</label>
          <input
            id="person-search"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or code…"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div role="listbox" aria-label="People" className="overflow-y-auto flex-1 p-2">
          {filtered.map((p) => {
            const isSelected = local.some(s => s.code === p.code)
            const colorIndex = selected.findIndex(s => s.code === p.code)
            return (
              <button
                key={p.code}
                role="option"
                aria-selected={isSelected}
                onClick={() => toggle(p)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-border text-left"
                title={`${p.name}${p.email ? ` <${p.email}>` : ''}`}
              >
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full border"
                  style={isSelected ? {
                    color: personColor(colorIndex),
                    borderColor: personColor(colorIndex) + '44',
                    background: personColor(colorIndex) + '22',
                  } : { color: '#6b6467', borderColor: '#3a3435' }}
                >
                  {p.code}
                </span>
                <span className="text-sm">{p.name}</span>
                {isSelected && <span className="ml-auto text-primary">✓</span>}
              </button>
            )
          })}
        </div>
        <div className="p-4 border-t border-border">
          <button
            onClick={onClose}
            className="w-full bg-primary text-white font-bold py-2.5 rounded-lg"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
