// The Upload page stops people with its own plain messages ("Please enter a title first.") before
// anything is sent. Those must reach the screen as written. They used to be run through
// friendlyError, which replaced them with "Something went wrong. Please try again.", so someone
// who only forgot a title thought the app had failed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const upload = readFileSync(path.join(root, '../app/(app)/upload/page.tsx'), 'utf8')
const fn = upload.slice(upload.indexOf('function friendlyError'), upload.indexOf('export default function UploadPage'))

test('the page keeps its own form messages in one list', () => {
  assert.match(upload, /const FORM_PROBLEMS = \[/)
  const list = upload.slice(upload.indexOf('const FORM_PROBLEMS'), upload.indexOf('function friendlyError'))
  assert.ok(list.includes('Please enter a title first.'))
  assert.ok(list.includes('Please add some text or a photo first.'))
})

test('friendlyError lets those messages through before it starts guessing', () => {
  const rule = fn.indexOf('FORM_PROBLEMS.includes(e)')
  assert.ok(rule >= 0, 'friendlyError must check FORM_PROBLEMS')
  assert.ok(rule < fn.indexOf("e.includes('503')"), 'must come before the guessing rules')
})

test('every message the page raises for a missing field is on that list', () => {
  const raised = [...upload.matchAll(/setError\('(Please [^']+)'\)/g)].map((m) => m[1])
  assert.ok(raised.length >= 2, 'expected the title and content messages')
  const list = upload.slice(upload.indexOf('const FORM_PROBLEMS'), upload.indexOf('function friendlyError'))
  for (const message of raised) assert.ok(list.includes(message), `not on FORM_PROBLEMS: ${message}`)
})
