// The Title and Description hints on the Capture and Upload pages follow the kind of memory chosen.
// Every kind in the picker needs its own example, and the text must stay neutral
// (no guessing who narrated) and free of em dashes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const upload = readFileSync(path.join(root, '../app/(app)/upload/page.tsx'), 'utf8')
const capture = readFileSync(path.join(root, '../app/(app)/capture/page.tsx'), 'utf8')
const lib = readFileSync(path.join(root, '../lib/memoryExamples.ts'), 'utf8')

const pills = upload.slice(upload.indexOf('const TYPE_PILLS'), upload.indexOf('function TypePills'))
const pillKinds = [...pills.matchAll(/\{ value: '(\w+)',\s+label: '/g)].map((m) => m[1])
const examples = lib.slice(lib.indexOf('const EXAMPLES'), lib.indexOf('export function exampleFor'))
const exampleKinds = [...examples.matchAll(/^\s+(\w+):\s+\{ title:/gm)].map((m) => m[1])

test('every kind of memory in the picker has its own Title and Description example', () => {
  assert.ok(pillKinds.length >= 6, 'expected the memory kind pills')
  for (const kind of pillKinds) assert.ok(exampleKinds.includes(kind), `no example for: ${kind}`)
})

test('both screens fill the empty boxes from the example for the chosen kind, not fixed text', () => {
  for (const [name, src] of [['upload', upload], ['capture', capture]]) {
    assert.match(src, /placeholder=\{exampleFor\(memoryType\)\.title\}/, name)
    assert.match(src, /placeholder=\{exampleFor\(memoryType\)\.description\}/, name)
    assert.match(src, /import \{ exampleFor \} from '@\/lib\/memoryExamples'/, name)
  }
})

test('example text does not assume who narrated or use em dashes', () => {
  assert.doesNotMatch(examples, /\b(she|her|he|his)\b/i)
  assert.ok(!examples.includes('—'))
})
