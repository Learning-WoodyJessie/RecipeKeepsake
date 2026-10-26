// The website passes certain server messages through unchanged. Those phrases
// must match what tools/errors.py actually sends, or the pass-through silently
// stops working and users see "Something went wrong" again.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(root, rel), 'utf8')

const ts = read('../lib/serverMessages.ts')
const py = read('../../tools/errors.py')

const tsPhrases = [...ts.matchAll(/^\s+(["'])(.+?)\1,$/gm)].map((m) => m[2].replace(/\\'/g, "'"))

test('every phrase the website lets through is a message the server really sends', () => {
  assert.ok(tsPhrases.length >= 4, 'expected the four server messages')
  for (const phrase of tsPhrases) {
    assert.ok(py.includes(phrase), `tools/errors.py does not contain: ${phrase}`)
  }
})

test('every message the server defines is on the website pass-through list', () => {
  const serverMessages = [...py.matchAll(/^_MSG_[A-Z]+ = \(?\s*"([^"]+)"/gm)].map((m) => m[1])
  assert.equal(serverMessages.length, 4)
  for (const message of serverMessages) {
    assert.ok(
      tsPhrases.some((p) => message.startsWith(p)),
      `not on the pass-through list in lib/serverMessages.ts: ${message}`,
    )
  }
})

test('the upload page lets server messages through before its own guessing', () => {
  const upload = read('../app/(app)/upload/page.tsx')
  assert.match(upload, /import \{ isServerSafeMessage \} from '@\/lib\/serverMessages'/)
  const fn = upload.slice(upload.indexOf('function friendlyError'))
  assert.ok(fn.indexOf('isServerSafeMessage(e)') < fn.indexOf("e.includes('503')"), 'pass-through must come first')
})
