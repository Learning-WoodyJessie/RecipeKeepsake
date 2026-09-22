// Guards the "no account needed" copy fix (decisions.log 2026-09-22): the
// family collection/portal has always required sign-in, but several screens
// claimed otherwise. Per-memory sharing genuinely is no-sign-in now, and the
// two magic-link screens genuinely don't need a created account — those are
// left alone; only the collection-related claims were false and are checked
// here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(root, rel), 'utf8')

test('no screen claims the family collection/portal needs no account', () => {
  const files = [
    '../app/(app)/people/page.tsx',
    '../app/(app)/account/page.tsx',
    '../app/(app)/collection/page.tsx',
    '../components/FamilyGroupSheet.tsx',
  ]
  // Account's viewer-approval paragraph legitimately says this (a magic-link
  // sign-in, not an anonymous view) — strip it before scanning that file so
  // the check below only catches a real leftover claim elsewhere in it.
  const LEGITIMATE = "Approve a family member's email for read-only viewing. They'll get a sign-in link, no account needed. Revoke access here anytime."
  for (const rel of files) {
    const src = read(rel).replace(LEGITIMATE, '')
    assert.doesNotMatch(src, /no account needed/i, `${rel} must not claim the collection needs no account`)
  }
})

test('the two magic-link screens keep their accurate "no account needed" copy', () => {
  // These describe a signed-in-via-emailed-link flow with no password/account
  // to create — a real distinction from the collection claims above.
  assert.match(read('../app/(app)/account/page.tsx'), /sign-in link, no account needed/)
  assert.match(read('../app/view/page.tsx'), /sign-in link, no account needed/)
})

test('privacy policy no longer claims there are no public links', () => {
  const policy = read('../app/privacy/page.tsx')
  assert.doesNotMatch(policy, /no public links and no anonymous access/i)
  assert.doesNotMatch(policy, /Your memories are never public\. Only you and people you invite/)
  assert.match(policy, /share a single memory directly/i)
  assert.match(policy, /without signing in/i)
})
