// Regression guard for the App Store review crash (Sep 2026): /family/groups/me
// returns 200 {group: null, ...} for a user with no family group, and the
// Account page rendered data.group.name on it -> "null is not an object
// (evaluating 'e.group.name')" -> root ErrorBoundary for every brand-new user.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(root, '../app/(app)/account/page.tsx'), 'utf8')

test('Account page treats {group: null} as "no group", not as loaded data', () => {
  const fetchBlock = source.slice(
    source.indexOf('api.family.getMyGroup()'),
    source.indexOf('.finally(() => setLoading(false))'),
  )
  assert.match(fetchBlock, /d\.group\s*\?/, 'response must be checked for a null group before being stored')
  assert.doesNotMatch(fetchBlock, /setData\(d as FamilyGroupData\)\s*\)/,
    'storing the raw response makes {group: null} truthy and skips the create-group form')
})

test('the create-group form is what renders when there is no group', () => {
  assert.match(source, /if \(!data\) return \(/, 'no-group branch must still exist')
  assert.match(source, /Create a family collection/)
})
