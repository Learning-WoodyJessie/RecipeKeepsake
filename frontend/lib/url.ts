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
//
// This is the AUTH-GATED link (redirects a signed-out visitor to sign in) —
// still used nowhere for new shares, kept only because old messages already
// sent contain it and must keep resolving. New shares use
// buildPublicMemoryShareUrl below.
export function buildMemoryShortUrl(
  origin: string,
  slug: string | null | undefined,
  token: string,
): string {
  const urlSlug = slug || `memory-${token.slice(0, 8)}`
  return `${origin}/memory/${urlSlug}`
}

// Public, no-sign-in share link for a single memory — /m/{shortcode}, backed
// by GET /public/memory/{shortcode} (safelisted fields only). The family
// collection itself stays behind sign-in; only an individual memory someone
// explicitly shares becomes link-public. See decisions.log 2026-09-22
// [Public memory sharing].
export function buildPublicMemoryShareUrl(
  origin: string,
  slug: string | null | undefined,
  token: string,
): string {
  const urlSlug = slug || `memory-${token.slice(0, 8)}`
  return `${origin}/m/${urlSlug}`
}
