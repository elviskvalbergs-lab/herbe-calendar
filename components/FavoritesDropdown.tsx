'use client'
import { useState, useRef, useEffect } from 'react'
import type { Favorite, CalendarState } from '@/types'
import { loadFavorites, addFavorite, removeFavorite } from '@/lib/favorites'
import FavoriteDetailModal from './FavoriteDetailModal'
import ConfirmDialog from './ConfirmDialog'
import { useConfirm } from '@/lib/useConfirm'

interface Props {
  state: CalendarState
  onApply: (view: CalendarState['view'], personCodes: string[], hiddenCalendars?: string[]) => void
  /** Current hidden calendars to save with favorites. */
  hiddenCalendars?: Set<string>
  /** Render as flat list (no star button / no dropdown wrapper). Used inside mobile bottom sheet. */
  inline?: boolean
}

export default function FavoritesDropdown({ state, onApply, hiddenCalendars, inline }: Props) {
  const [open, setOpen] = useState(false)
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailFavorite, setDetailFavorite] = useState<Favorite | null>(null)
  const [linkCounts, setLinkCounts] = useState<Record<string, number>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm()

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setNaming(false) } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  useEffect(() => {
    loadFavorites().then(favs => {
      setFavorites(favs)
      const counts: Record<string, number> = {}
      for (const f of favs) if ((f as any).linkCount > 0) counts[f.id] = (f as any).linkCount
      setLinkCounts(counts)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (naming) inputRef.current?.focus()
  }, [naming])

  async function handleSave() {
    if (!name.trim()) return
    const fav = await addFavorite({
      name: name.trim(),
      view: state.view,
      personCodes: state.selectedPersons.map(p => p.code),
      hiddenCalendars: hiddenCalendars ? [...hiddenCalendars] : [],
    })
    setFavorites(prev => [...prev, fav])
    setName('')
    setNaming(false)
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    confirm('Remove this favorite view?', async () => {
      setFavorites(prev => prev.filter(f => f.id !== id))
      await removeFavorite(id)
    }, { confirmLabel: 'Remove', destructive: true })
  }

  function handleApply(fav: Favorite) {
    onApply(fav.view, fav.personCodes, fav.hiddenCalendars)
    if (!inline) setOpen(false)
  }

  const currentCodes = state.selectedPersons.map(p => p.code).sort().join(',')
  const currentHidden = hiddenCalendars ? [...hiddenCalendars].sort().join(',') : ''
  const activeMatch = favorites.find(f =>
    f.view === state.view &&
    f.personCodes.slice().sort().join(',') === currentCodes &&
    (f.hiddenCalendars ?? []).slice().sort().join(',') === currentHidden
  )
  const isActive = !!activeMatch

  const list = (
    <>
      {loading && <p className="px-3 py-2 text-xs text-text-muted">Loading…</p>}
      {favorites.map(fav => (
        <button
          key={fav.id}
          onClick={() => handleApply(fav)}
          className="w-full text-left px-3 py-2 text-sm hover:bg-border rounded-lg flex items-center gap-2 group"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-400 shrink-0">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <span className="truncate">{fav.name}</span>
          <span className="text-[10px] text-text-muted ml-auto whitespace-nowrap">
            {fav.view === 'day' ? 'Day' : fav.view === '3day' ? '3D' : '5D'} · {fav.personCodes.length}p
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setDetailFavorite(fav); if (!inline) setOpen(false) }}
            className={`text-xs shrink-0 ${linkCounts[fav.id] > 0 ? 'text-red-400 hover:text-red-300' : 'text-text-muted hover:text-primary'}`}
            title="Share / details"
          >
            ↗
          </button>
          <button
            onClick={(e) => handleDelete(e, fav.id)}
            className="text-text-muted hover:text-red-400 text-xs ml-1 shrink-0 opacity-0 group-hover:opacity-100"
            title="Remove favorite"
          >
            ✕
          </button>
        </button>
      ))}

      {favorites.length > 0 && <div className="h-px bg-border my-1" />}

      {naming ? (
        <form
          onSubmit={(e) => { e.preventDefault(); handleSave() }}
          className="px-3 py-2 flex items-center gap-2"
        >
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Favorite name…"
            className="flex-1 bg-transparent border border-border rounded px-2 py-1 text-sm outline-none focus:border-primary"
            onKeyDown={e => { if (e.key === 'Escape') { setNaming(false); setName('') } }}
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="text-primary text-sm font-bold disabled:opacity-30"
          >
            Save
          </button>
        </form>
      ) : (
        <button
          onClick={() => setNaming(true)}
          className="w-full text-left px-3 py-2 text-sm hover:bg-border text-primary font-semibold flex items-center gap-2 rounded-lg"
        >
          <span>+</span>
          <span>Save current view…</span>
        </button>
      )}

      {!loading && favorites.length === 0 && !naming && (
        <p className="px-3 py-1 text-xs text-text-muted">No favorites yet</p>
      )}
    </>
  )

  const modal = detailFavorite && (
    <FavoriteDetailModal
      favorite={detailFavorite}
      open={!!detailFavorite}
      onClose={() => setDetailFavorite(null)}
      onLinksChange={(favId, count) => setLinkCounts(prev => ({ ...prev, [favId]: count }))}
    />
  )

  if (inline) return <><div>{list}</div>{modal}</>

  return (
    <>
      <div className="relative">
        <button
          onClick={() => { setOpen(o => !o); setNaming(false); setName('') }}
          className="text-text-muted px-1.5 py-1 rounded-lg hover:bg-border text-base leading-none"
          title="Favorites"
        >
          {isActive ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" className="text-yellow-400">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          )}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setNaming(false) }} />
            <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-xl shadow-xl py-1 min-w-[240px]">
              {list}
            </div>
          </>
        )}
      </div>
      {modal}
      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          destructive={confirmState.destructive}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </>
  )
}
