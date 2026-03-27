'use client'
import { useState, useRef } from 'react'
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative glass shadow-premium rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden border border-white/10"
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
        <div className="flex justify-center pt-4 pb-2 sm:hidden">
          <div className="w-12 h-1.5 rounded-full bg-white/10" />
        </div>
        
        <div className="p-6 border-b border-white/5 bg-white/5">
          <h2 className="text-sm font-black uppercase tracking-widest text-text-muted mb-4 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Add Person to View
          </h2>
          <div className="relative">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or code…"
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-white/20"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-xs font-bold text-white/20 uppercase tracking-widest">No results found</p>
            </div>
          ) : (
            filtered.map((p) => {
              const isSelected = local.some(s => s.code === p.code)
              const colorIndex = local.findIndex(s => s.code === p.code)
              return (
                <button
                  key={p.code}
                  onClick={() => toggle(p)}
                  className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all border ${isSelected ? 'bg-white/10 border-white/10 shadow-lg' : 'hover:bg-white/5 border-transparent'}`}
                  title={`${p.name}${p.email ? ` <${p.email}>` : ''}`}
                >
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black shadow-inner border"
                    style={{
                      background: isSelected ? personColor(colorIndex) + '33' : 'rgba(255,255,255,0.05)',
                      color: isSelected ? personColor(colorIndex) : 'rgba(255,255,255,0.3)',
                      borderColor: isSelected ? personColor(colorIndex) + '44' : 'rgba(255,255,255,0.05)'
                    }}
                  >
                    {p.code}
                  </div>
                  <div className="flex-1 text-left">
                    <p className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-white/70'}`}>{p.name}</p>
                    <p className="text-[10px] text-white/30 font-medium uppercase tracking-tighter">{p.code}</p>
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/20 animate-fade-in">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="p-6 border-t border-white/5 bg-white/5">
          <button
            onClick={onClose}
            className="w-full bg-primary text-white text-xs font-black uppercase tracking-widest py-4 rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Confirm Selection
          </button>
        </div>
      </div>
    </div>
  )
}
