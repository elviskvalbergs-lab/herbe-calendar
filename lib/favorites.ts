import type { Favorite } from '@/types'

const STORAGE_KEY = 'calendarFavorites'

export function loadFavorites(): Favorite[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function saveFavorites(favs: Favorite[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favs))
}

export function addFavorite(fav: Favorite) {
  const favs = loadFavorites()
  favs.push(fav)
  saveFavorites(favs)
  return favs
}

export function removeFavorite(id: string) {
  const favs = loadFavorites().filter(f => f.id !== id)
  saveFavorites(favs)
  return favs
}
