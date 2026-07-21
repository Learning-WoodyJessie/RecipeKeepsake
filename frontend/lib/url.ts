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
// Format: /memory/{title-slug}-{token8}  (uses the slug stored in the DB)
// Example: /memory/dads-song-3da38e4f
// Falls back to memory-{token8} when slug is not yet set (old records).
export function buildMemoryShortUrl(
  origin: string,
  slug: string | null | undefined,
  token: string,
): string {
  const urlSlug = slug || `memory-${token.slice(0, 8)}`
  return `${origin}/memory/${urlSlug}`
}
