import type { Favorite } from '@/types'

export async function loadFavorites(): Promise<Favorite[]> {
  try {
    const res = await fetch('/api/settings/favorites')
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function addFavorite(fav: Omit<Favorite, 'id'>): Promise<Favorite> {
  const res = await fetch('/api/settings/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fav),
  })
  return res.json()
}

export async function removeFavorite(id: string): Promise<void> {
  await fetch('/api/settings/favorites', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
}
