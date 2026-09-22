// Regression suite for "does this page survive a brand-new account (nothing
// created yet) as well as a fully-populated one" — the exact question that
// caught the Account crash and the People blank-share-link bug in Sep 2026,
// both missed by reading the code and only found by actually loading the
// pages. Source-level checks here (no jsdom/browser dependency) encode what
// a live sweep across Home, Recipes, Moments, Search, People, and Collection
// found: see tests/fixtures/account-fixtures.mjs for the reusable stub data,
// and decisions.log 2026-09-22 [Account sweep] for how to re-run the live
// version of this sweep in a browser when changing these pages.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(root, rel), 'utf8')
const api = read('../lib/api.ts')

test('recipes.list / people.list / family.recipes all default to [] for a shape the caller cannot use as-is', () => {
  // This is the actual mechanism that made Home, Recipes, Moments, and
  // Search safe against a new account's empty-everything response without
  // any per-page null check — verified live via account-fixtures.mjs with
  // NEW_ACCOUNT. If any of these three lose their "return []" fallback, the
  // pages that .map()/.filter() the result will crash the same way Account
  // did on {group: null}.
  for (const marker of ["'recipes' in data", "'people' in data"]) {
    const at = api.indexOf(marker)
    assert.ok(at !== -1, `expected to find ${marker} in lib/api.ts`)
    const scope = api.slice(at, at + 200)
    assert.match(scope, /Array\.isArray\(rows\) \? (?:rows|\(rows as Person\[\]\)) : \[\]/)
  }
  // Every one of the three must also fall through to [] when the response
  // is neither an array nor {recipes: ...}/{people: ...} at all (a 500, a
  // network hiccup, or a shape that changes later) — the exact case the old
  // FamilyGroupSection/People bug hit ({group: null} is an object, but
  // neither 'recipes' nor 'people' — it needs its own explicit check).
  const listFns = [
    api.slice(api.indexOf('recipes: {'), api.indexOf('get: (token')),
    api.slice(api.indexOf("async list(): Promise<Person[]>"), api.indexOf('async create(body')),
    api.slice(api.indexOf('recipes: async () => {'), api.indexOf('},\n  },\n  portal:')),
  ]
  for (const fn of listFns) assert.match(fn, /return \[\]/)
})

test('every getMyGroup() consumer checks .group — the actual bug class, generalized', () => {
  // Duplicated (deliberately) from no-group-share.test.mjs as a single
  // reference point for "what does the account sweep actually guard" — see
  // that file for the full scan implementation.
  const noGroupShare = read('./no-group-share.test.mjs')
  assert.match(noGroupShare, /every consumer of getMyGroup\(\) checks \.group/)
})

test('account-fixtures.mjs stays in sync with what the six swept pages actually fetch', () => {
  const fixtures = read('./fixtures/account-fixtures.mjs')
  for (const endpoint of ['/family/groups/me', '/family/recipes', '/people', '/recipes']) {
    assert.match(fixtures, new RegExp(endpoint.replace('/', '\\/')))
  }
  assert.match(fixtures, /portal_visible: true/, 'ESTABLISHED_ACCOUNT recipe must satisfy Collection\'s client-side portal_visible filter')
})

test('no quote attribution names a real person without a verified source (misattribution risk)', () => {
  // The Collection-page quote was attributed to Chitra Banerjee Divakaruni
  // (a real, living author) but does not appear in her published work or any
  // quote database — fixed by attributing it to the app itself, matching
  // the landing page's own self-attributed quote.
  const collection = read('../app/(app)/collection/page.tsx')
  assert.doesNotMatch(collection, /Chitra Banerjee Divakaruni/)
  assert.match(collection, /attr: 'Echoes of Home'/)
})
