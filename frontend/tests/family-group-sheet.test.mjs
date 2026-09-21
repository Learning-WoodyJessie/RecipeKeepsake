// Guards the family-invite UX redesign: the blocking "Name your family
// collection" popup that fired ~0.8s after every first load (no visible way to
// dismiss, no context, not accessible) was replaced by an accessible sheet that
// only opens on a user action, from a card on Home.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(root, rel), 'utf8')
const sheet = read('../components/FamilyGroupSheet.tsx')
const layout = read('../app/(app)/layout.tsx')
const home = read('../app/(app)/home/page.tsx')

test('nothing pops the family prompt on load any more', () => {
  assert.ok(!existsSync(path.join(root, '../components/FamilySetupPrompt.tsx')), 'old auto-popup component should be gone')
  assert.doesNotMatch(layout, /FamilySetupPrompt|FamilyGroupSheet/, 'layout must not mount a family prompt')
})

test('the sheet is controlled by its caller and never opens itself', () => {
  assert.match(sheet, /open:\s*boolean/)
  assert.doesNotMatch(sheet, /setTimeout\(/, 'no timer-driven opening')
  assert.doesNotMatch(sheet, /setVisible\(true\)/)
})

test('the sheet has a visible way out: Close button, "Not now", Escape and backdrop', () => {
  assert.match(sheet, /aria-label="Close"/)
  assert.match(sheet, />\s*Not now\s*</)
  assert.match(sheet, /e\.key === 'Escape'/)
  assert.match(sheet, /onClick=\{\(\) => \{ if \(!creating\) onClose\(\) \}\}/, 'backdrop click closes')
})

test('the sheet is an accessible dialog', () => {
  assert.match(sheet, /role="dialog"/)
  assert.match(sheet, /aria-modal="true"/)
  assert.match(sheet, /aria-labelledby="family-sheet-title"/)
  assert.match(sheet, /<label htmlFor="family-sheet-name"/, 'input needs a real label, not just a placeholder')
  assert.match(sheet, /role="alert"/, 'errors must be announced')
  assert.match(sheet, /e\.key !== 'Tab'/, 'focus should be trapped while open')
})

test('copy says it is optional instead of implying a required step', () => {
  assert.match(sheet, /Optional/)
  assert.doesNotMatch(sheet, /One quick step/)
  assert.match(sheet, /later from Account/)
})

test('"already in a family group" is treated as success, not an error', () => {
  assert.match(sheet, /Already in a family group/)
  assert.match(sheet, /api\.family\.getMyGroup\(\)/)
})

test('Home card opens the sheet in place and nudges after the first memory', () => {
  assert.match(home, /<FamilyGroupSheet/)
  assert.match(home, /onClick=\{\(\) => setSheetOpen\(true\)\}/)
  assert.match(home, /<QuotePanel hasMemories=\{memories\.length > 0\} \/>/)
  assert.match(home, /Your first memory is saved\. Invite your family/)
  assert.match(home, /Create a shared collection so your family can browse memories/, 'pre-memory copy retained')
})

test('touch targets meet the 44pt minimum', () => {
  assert.match(sheet, /width: 44, height: 44/, 'close button')
  assert.match(sheet, /minHeight: 48/, 'primary button')
  assert.match(home, /minHeight: 44/, 'Home card CTA')
})
