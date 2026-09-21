// /family/groups/me answers 200 {group: null, portal_url: null, invite_url: null}
// for a user with no family group. Storing that object as if it were a group
// crashed the Account page (App Review, Sep 2026) and made the People page show
// blank "share" links whose WhatsApp button sent a message with no URL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(root, rel), 'utf8')

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

test('every consumer of getMyGroup() checks .group before using the response', () => {
  const files = [...sourceFiles(path.join(root, '../app')), ...sourceFiles(path.join(root, '../components'))]
  const offenders = []
  let checked = 0
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    let i = src.indexOf('getMyGroup()')
    while (i !== -1) {
      if (!/api\.family\.getMyGroup\(\)/.test(src.slice(Math.max(0, i - 12), i + 12))) { i = src.indexOf('getMyGroup()', i + 1); continue }
      checked++
      const window = src.slice(i, i + 320)
      if (!/\.group\b/.test(window)) offenders.push(path.relative(path.join(root, '..'), file))
      i = src.indexOf('getMyGroup()', i + 1)
    }
  }
  assert.ok(checked >= 6, `expected to find the known call sites, found ${checked}`)
  assert.deepEqual(offenders, [], 'these read /family/groups/me without checking .group (null = no group)')
})

test('People page treats {group: null} as no group, so it shows the setup CTA instead of blank share links', () => {
  const people = read('../app/(app)/people/page.tsx')
  assert.match(people, /setGroupData\(d\.group \? d : null\)/)
  assert.doesNotMatch(people, /setGroupData\(d\)\s*\n/, 'raw response must not be stored')
})

test('Collection page gives a no-group user a way to start one, and never flashes it before the check finishes', () => {
  const collection = read('../app/(app)/collection/page.tsx')
  assert.match(collection, /import FamilyGroupSheet from '@\/components\/FamilyGroupSheet'/)
  assert.match(collection, /Start your family collection/)
  assert.match(collection, /\.finally\(\(\) => setChecked\(true\)\)/)
  assert.match(collection, /if \(!checked\) return null/)
  assert.match(collection, /setInviteUrl\(d\.invite_url\)/, 'card must switch to the invite state after creating')
})
