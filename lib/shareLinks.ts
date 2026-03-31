import type { ShareLink, ShareVisibility } from '@/types'

export async function loadShareLinks(favoriteId: string): Promise<ShareLink[]> {
  try {
    const res = await fetch(`/api/settings/share-links?favoriteId=${favoriteId}`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function createShareLink(data: {
  favoriteId: string
  name: string
  visibility: ShareVisibility
  expiresAt?: string
  password?: string
}): Promise<ShareLink> {
  const res = await fetch('/api/settings/share-links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function removeShareLink(id: string): Promise<void> {
  await fetch('/api/settings/share-links', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
}

export async function removeAllShareLinks(favoriteId: string): Promise<void> {
  await fetch('/api/settings/share-links', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favoriteId }),
  })
}

export async function updateShareLink(id: string, data: {
  name?: string
  visibility?: ShareVisibility
  expiresAt?: string | null
  password?: string
}): Promise<ShareLink> {
  const res = await fetch('/api/settings/share-links', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  })
  return res.json()
}
