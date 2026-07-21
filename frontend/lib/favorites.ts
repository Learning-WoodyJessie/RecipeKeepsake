const KEY = 'rk_favorites'

export function readFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function toggleFavorite(token: string): string[] {
  const set = new Set(readFavorites())
  if (set.has(token)) set.delete(token); else set.add(token)
  const next = [...set]
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

export function clearUserData(): void {
  localStorage.removeItem(KEY)
  localStorage.removeItem('familyGroupCreated')
}
