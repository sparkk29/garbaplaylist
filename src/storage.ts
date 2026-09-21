import type { ClothId } from './types'

const FAV = 'gp:favorites'
const RECENT = 'gp:recent'
const RESUME = 'gp:resume'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function getFavorites(): string[] {
  return readJson<string[]>(FAV, [])
}

export function toggleFavorite(id: string): boolean {
  const set = new Set(getFavorites())
  if (set.has(id)) set.delete(id)
  else set.add(id)
  localStorage.setItem(FAV, JSON.stringify([...set]))
  return set.has(id)
}

export function isFavorite(id: string): boolean {
  return getFavorites().includes(id)
}

export function pushRecent(entry: { id: string; clothId: ClothId; title: string }): void {
  const list = readJson<typeof entry[]>(RECENT, []).filter((x) => x.id !== entry.id)
  list.unshift(entry)
  localStorage.setItem(RECENT, JSON.stringify(list.slice(0, 20)))
}

export function getResume(): { clothId: ClothId; videoId: string; t: number } | null {
  return readJson(RESUME, null)
}

export function setResume(data: { clothId: ClothId; videoId: string; t: number } | null): void {
  if (!data) localStorage.removeItem(RESUME)
  else localStorage.setItem(RESUME, JSON.stringify(data))
}
