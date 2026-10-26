// Someone on Capture's "Their voice" tab who taps "Upload an audio file" must land on the Upload
// page's "Their voice" tab, not the recipe one. Landing on the recipe tab sends a song through the
// recipe pipeline (a "Your recordings" card on Home, then a recipe review).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const capture = readFileSync(path.join(root, '../app/(app)/capture/page.tsx'), 'utf8')
const upload = readFileSync(path.join(root, '../app/(app)/upload/page.tsx'), 'utf8')

test('the upload page opens on "Their voice" when asked with ?mode=direct', () => {
  assert.match(upload, /searchParams\.get\('mode'\)/)
  assert.match(upload, /m === 'direct'\) setMode\('direct'\)/)
})

test('capture passes its current tab to the upload page', () => {
  assert.match(capture, /href=\{mode === 'direct' \? '\/upload\?mode=direct' : '\/upload'\}/)
})
