// Guards per-memory public sharing (decisions.log 2026-09-22): a single
// memory can be viewed via /m/{shortcode} with no sign-in, but the family
// collection stays gated. Old share links (/memory/{shortcode}, auth-gated)
// must keep working — they were already sent to people before this change.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(root, rel), 'utf8')

test('the public memory route is a static page (query string), not a dynamic path segment', () => {
  // This app ships as a Next static export (output: 'export'), which cannot
  // serve true per-value dynamic routes — a [shortcode] folder here would
  // 404 or silently fall through to the landing page in production.
  assert.ok(existsSync(path.join(root, '../app/m/page.tsx')))
  assert.ok(!existsSync(path.join(root, '../app/m/[shortcode]')), '[shortcode] segment cannot work under output: export')
  assert.ok(!existsSync(path.join(root, '../app/(app)/m')), 'must live outside the AuthGuard-wrapped (app) group')
})

test('the public page reads the shortcode from ?code= and calls the public endpoint', () => {
  const page = read('../app/m/page.tsx')
  assert.doesNotMatch(page, /AuthGuard/)
  assert.match(page, /useSearchParams\(\)\.get\('code'\)/)
  assert.match(page, /\/public\/memory\/\$\{encodeURIComponent\(code\)\}/)
  assert.match(page, /<Suspense>/, 'useSearchParams needs a Suspense boundary, per the existing / landing page pattern')
})

test('the public page is not search-indexed', () => {
  assert.match(read('../app/m/page.tsx'), /noindex/)
})

test('the page knows whether you are signed in and never shows "Sign in" to someone who is', () => {
  const page = read('../app/m/page.tsx')
  assert.match(page, /supabase\.auth\.getSession\(\)/)
  // three states: unknown (nothing shown, no flash), signed out, signed in
  assert.match(page, /useState<boolean \| null>\(null\)/)
  const signInBlock = page.slice(page.indexOf('{signedIn === false && ('), page.indexOf('{signedIn === true && ('))
  assert.match(signInBlock, />\s*Sign in\s*</)
  assert.match(signInBlock, /\/\?next=/)
  const signedInBlock = page.slice(page.indexOf('{signedIn === true && ('))
  assert.doesNotMatch(signedInBlock.split('</Shell>')[0], /Sign in/)
  assert.match(signedInBlock, /href="\/home"/)
})

test('the sign-in prompt does not promise a collection the visitor may not have access to', () => {
  const page = read('../app/m/page.tsx')
  assert.doesNotMatch(page, /whole family collection/)
  assert.doesNotMatch(page, /Sign in to see more/)
})

test('the public page renders no edit, translate, or reaction affordances', () => {
  const page = read('../app/m/page.tsx')
  assert.doesNotMatch(page, /ReactionBar|LanguageSwitcher|patch\(|onClick=\{.*[Ss]ave/)
})

test('the backend pretty-link redirect target matches the static page exactly', () => {
  const serve = readFileSync(path.join(root, '../../scripts/serve.py'), 'utf8')
  assert.match(serve, /@app\.get\("\/m\/\{shortcode\}"\)/)
  assert.match(serve, /destination = f"\{base\}\/m\?code=\{code\}"/)
})

test('buildPublicMemoryShareUrl and the old buildMemoryShortUrl both exist and point at different paths', () => {
  const url = read('../lib/url.ts')
  assert.match(url, /export function buildMemoryShortUrl/, 'old builder must stay — already-sent links use it')
  assert.match(url, /export function buildPublicMemoryShareUrl/)
  assert.match(url, /return `\$\{origin\}\/memory\/\$\{urlSlug\}`/)
  assert.match(url, /return `\$\{origin\}\/m\/\$\{urlSlug\}`/)
})

test('every WhatsApp share call site uses the public builder, not the auth-gated one', () => {
  for (const rel of ['../app/(app)/memory/page.tsx', '../app/(app)/moments/page.tsx', '../app/(app)/recipes/page.tsx']) {
    const src = read(rel)
    assert.match(src, /buildPublicMemoryShareUrl/, `${rel} should share the public link`)
    assert.doesNotMatch(src, /buildMemoryShortUrl/, `${rel} should not build the auth-gated link for new shares`)
  }
})
