'use client'
import { useState, useRef, useEffect } from 'react'
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col"
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
          <h2 className="font-bold mb-3">Select people</h2>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or code…"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          {filtered.map((p) => {
            const isSelected = local.some(s => s.code === p.code)
            const colorIndex = selected.findIndex(s => s.code === p.code)
            return (
              <button
                key={p.code}
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
    </div>
  )
}
