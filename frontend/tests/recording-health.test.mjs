// Production incident (Oct 2026): Chrome picked the Mac's iPhone Continuity mic,
// which dropped out mid-take. Timer said 52 s but only 10.7 KB was captured.
// The page must flag takes like that before the user saves them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
// Node 22.15 can't import .ts directly; strip the few type annotations and evaluate.
const healthSrc = readFileSync(path.join(root, '../lib/recordingHealth.ts'), 'utf8')
  .replace(/export /g, '')
  .replace(/: (number|boolean)/g, '')
const { looksSilent, averageKbps } = new Function(`${healthSrc}; return { looksSilent, averageKbps }`)()
const capture = readFileSync(path.join(root, '../app/(app)/capture/page.tsx'), 'utf8')

test('the real bad take is flagged and the real good takes are not', () => {
  assert.equal(looksSilent(10753, 52.3), true)    // iPhone mic dropout
  assert.equal(looksSilent(99931, 28.1), false)   // good take
  assert.equal(looksSilent(102606, 39.1), false)  // good, quieter take
  assert.equal(looksSilent(79146, 20.2), false)   // MacBook mic
})

test('very short takes are never judged, and zero length does not divide by zero', () => {
  assert.equal(looksSilent(100, 1.5), false)
  assert.equal(averageKbps(1000, 0), 0)
})

test('capture page shows the mic in use and warns about a silent take', () => {
  assert.match(capture, /from '@\/lib\/recordingHealth'/)
  assert.match(capture, /track\?\.label/)
  assert.match(capture, /setSilentTake\(looksSilent\(/)
  assert.match(capture, /looks silent/i)
})

test('the stop log uses template strings (console.log does not support %.1f)', () => {
  assert.doesNotMatch(capture, /%\.1f/)
})
