// Converts any string to an ASCII-safe URL slug (strips diacritics, Telugu, etc.)
function toAsciiSlug(s: string, maxLen = 15): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen) || 'family'
}

// Builds a clean, consistent share URL for a memory.
// Format: /memory/{narrator}-{type}-{token8}
// Example: /memory/smitha-recipe-42329f17
export function buildMemoryShortUrl(
  origin: string,
  narrator: string | null | undefined,
  type: string | null | undefined,
  token: string,
): string {
  const narratorSlug = toAsciiSlug(narrator || 'family')
  const typeSlug = (type || 'recipe').toLowerCase().replace(/[^a-z]+/g, '') || 'recipe'
  const shortToken = token.slice(0, 8)
  return `${origin}/memory/${narratorSlug}-${typeSlug}-${shortToken}`
}
