// The Title and Description hints on the Upload page follow the kind of memory chosen.
// Every kind in the picker needs its own example, and the text must stay neutral
// (no guessing who narrated) and free of em dashes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const upload = readFileSync(path.join(root, '../app/(app)/upload/page.tsx'), 'utf8')

const pills = upload.slice(upload.indexOf('const TYPE_PILLS'), upload.indexOf('function TypePills'))
const pillKinds = [...pills.matchAll(/\{ value: '(\w+)',\s+label: '/g)].map((m) => m[1])
const examples = upload.slice(upload.indexOf('const EXAMPLES'), upload.indexOf('function exampleFor'))
const exampleKinds = [...examples.matchAll(/^\s+(\w+):\s+\{ title:/gm)].map((m) => m[1])

test('every kind of memory in the picker has its own Title and Description example', () => {
  assert.ok(pillKinds.length >= 6, 'expected the memory kind pills')
  for (const kind of pillKinds) assert.ok(exampleKinds.includes(kind), `no example for: ${kind}`)
})

test('the empty boxes use the example for the chosen kind, not fixed text', () => {
  assert.match(upload, /placeholder=\{exampleFor\(memoryType\)\.title\}/)
  assert.match(upload, /placeholder=\{exampleFor\(memoryType\)\.description\}/)
})

test('example text does not assume who narrated or use em dashes', () => {
  assert.doesNotMatch(examples, /\b(she|her|he|his)\b/i)
  assert.ok(!examples.includes('—'))
})
