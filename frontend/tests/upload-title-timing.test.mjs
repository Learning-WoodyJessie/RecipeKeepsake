// On "Their voice" a title is not asked for before the file goes up. The review screen that follows
// already makes it required (Save stays disabled until one is typed), so asking twice only stops
// people after they have picked their file. Typed text ("Their words") has no later screen, so
// that form still needs its title up front.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const upload = readFileSync(path.join(root, '../app/(app)/upload/page.tsx'), 'utf8')
const review = readFileSync(path.join(root, '../components/SingleScreenReview.tsx'), 'utf8')

const between = (src, from, to) => src.slice(src.indexOf(from), src.indexOf(to))
const directHandler = between(upload, 'async function handleFileDirect', 'async function handleTextSave')
const textHandler = between(upload, 'async function handleTextSave', 'function handleFile(')
const directForm = between(upload, "{mode === 'direct' && (\n            <>", "{mode === 'text' && (\n            <>")
const textForm = upload.slice(upload.indexOf("{mode === 'text' && (\n            <>"))

test('choosing an audio file on "Their voice" is not blocked by an empty title', () => {
  assert.ok(directHandler.includes("form.append('title'"), 'handler not found')
  assert.ok(!directHandler.includes('Please enter a title first.'))
})

test('the review screen that follows still requires a title before saving', () => {
  assert.match(review, /disabled=\{saving \|\| !title\.trim\(\)\}/)
})

test('a title typed before uploading carries over to the review screen', () => {
  assert.match(upload, /<SingleScreenReview[^>]*initialTitle=\{title\}/s)
})

test('typed text still needs its title up front', () => {
  assert.ok(textHandler.includes('Please enter a title first.'))
  assert.match(textForm, /Title \*/)
})

test('the audio form does not claim to enforce a title, and says when it is needed', () => {
  assert.doesNotMatch(directForm, /Title \*/)
  assert.ok(directForm.includes('Needed before you save. You can add it on the next screen.'))
})
