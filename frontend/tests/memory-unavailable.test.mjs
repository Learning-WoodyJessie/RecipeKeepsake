// When a memory cannot be opened, the page says what to do instead of "Recipe not found [req:...]".
// The server answers the same 404 whether the memory belongs to another account, was removed, or the
// link is wrong, so the wording covers all three without confirming which.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  isNotFoundMessage, requestRefOf, UNAVAILABLE_TITLE, UNAVAILABLE_REASON, UNAVAILABLE_STEPS, signedInAs,
} from '../lib/memoryAccess.ts'

const root = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(root, rel), 'utf8')

test('a not-found answer from the server is recognised, with or without its reference', () => {
  assert.equal(isNotFoundMessage('Recipe not found [req:19c78f55]'), true)
  assert.equal(isNotFoundMessage('Recipe not found'), true)
  assert.equal(isNotFoundMessage('Memory not found'), true)
})

test('other failures are not mistaken for it, so they keep their own message', () => {
  assert.equal(isNotFoundMessage('Request failed'), false)
  assert.equal(isNotFoundMessage('Failed to fetch'), false)
  assert.equal(isNotFoundMessage('Something went wrong on our side.'), false)
})

test('the support reference is pulled out of the message', () => {
  assert.equal(requestRefOf('Recipe not found [req:19c78f55]'), '19c78f55')
  assert.equal(requestRefOf('Recipe not found'), null)
})

test('the wording says what to do and covers a different account, a removed memory and a re-share', () => {
  assert.equal(UNAVAILABLE_TITLE, "We can't open this memory")
  assert.match(UNAVAILABLE_REASON, /different account/)
  assert.match(UNAVAILABLE_REASON, /removed/)
  assert.equal(UNAVAILABLE_STEPS.length, 2)
  assert.match(UNAVAILABLE_STEPS[0], /account that saved it/)
  assert.match(UNAVAILABLE_STEPS[1], /Share button/)
})

test('it works for songs and stories too, and uses no em dash', () => {
  const all = [UNAVAILABLE_TITLE, UNAVAILABLE_REASON, ...UNAVAILABLE_STEPS].join(' ')
  assert.doesNotMatch(all, /recipe/i)
  assert.ok(!all.includes('—'))
})

test('the signed-in line names the account when known and is empty when not', () => {
  assert.equal(signedInAs('me@example.com'), "You're signed in as me@example.com.")
  assert.equal(signedInAs(null), '')
  assert.equal(signedInAs(''), '')
})

test('the memory page shows the friendly screen for not found and leaves other errors as they were', () => {
  const page = read('../app/(app)/memory/page.tsx')
  assert.match(page, /import MemoryUnavailable from '@\/components\/MemoryUnavailable'/)
  assert.match(page, /if \(error\) return isNotFoundMessage\(error\) \? <MemoryUnavailable error=\{error\} \/> : /)
  assert.match(page, /<div style=\{\{ padding: '2rem', color: 'var\(--accent\)' \}\}>\{error\}<\/div>/)
})

test('the screen offers switching accounts, coming back to this memory afterwards, and a way home', () => {
  assert.ok(existsSync(path.join(root, '../components/MemoryUnavailable.tsx')))
  const c = read('../components/MemoryUnavailable.tsx')
  assert.match(c, /Switch account/)
  assert.match(c, /localStorage\.setItem\('returnTo'/)
  assert.match(c, /authSignOut\(\)/)
  assert.match(c, /\/\?next=\$\{encodeURIComponent\(/)
  assert.match(c, /href="\/recipes"/)
  assert.match(c, /requestRefOf\(error\)/)
})
