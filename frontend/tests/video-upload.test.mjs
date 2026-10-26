// Video upload is a separate path that keeps only the sound. These tests pin the routing rule
// (anything that works as audio today still goes the audio way), the limits, and the messages
// that tell people their video itself is not kept.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  isVideoUpload, videoTooLarge, VIDEO_MAX_BYTES, VIDEO_ACCEPT, VIDEO_PROBLEMS, isVideoProblemMessage,
  VIDEO_HINT, VIDEO_PROCESSING_TITLE, VIDEO_PROCESSING_NOTE,
} from '../lib/videoUpload.ts'

const root = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(root, rel), 'utf8')
const MB = 1024 * 1024
const f = (name, size, type = '') => ({ name, size, type })

test('iPhone style .mov and .m4v always go the video way, in any case and any size', () => {
  assert.equal(isVideoUpload(f('clip.mov', 1 * MB, 'video/quicktime')), true)
  assert.equal(isVideoUpload(f('CLIP.MOV', 90 * MB)), true)
  assert.equal(isVideoUpload(f('clip.m4v', 2 * MB)), true)
})

test('an .mp4 stays on the audio path unless it is too big for audio, so what works today is unchanged', () => {
  assert.equal(isVideoUpload(f('voice.mp4', 5 * MB, 'video/mp4')), false)
  assert.equal(isVideoUpload(f('voice.mp4', 25 * MB, 'video/mp4')), false)
  assert.equal(isVideoUpload(f('clip.mp4', 25 * MB + 1, 'video/mp4')), true)
  assert.equal(isVideoUpload(f('clip.mp4', 150 * MB, '')), true)
})

test('audio files never go the video way, however big', () => {
  for (const name of ['a.m4a', 'a.mp3', 'a.wav', 'a.webm', 'a.ogg', 'a.aac', 'a.flac', 'a.opus', 'noextension'])
    assert.equal(isVideoUpload(f(name, 300 * MB, 'audio/mpeg')), false, name)
})

test('the limit is 200 MB, checked before anything is uploaded', () => {
  assert.equal(VIDEO_MAX_BYTES, 200 * MB)
  assert.equal(videoTooLarge(f('a.mov', 200 * MB)), false)
  assert.equal(videoTooLarge(f('a.mov', 200 * MB + 1)), true)
})

test('the file picker offers phone video formats', () => {
  for (const t of ['video/mp4', 'video/quicktime', '.mov', '.m4v']) assert.ok(VIDEO_ACCEPT.includes(t), t)
})

test('people are told up front and while it works that only the sound is kept', () => {
  assert.match(VIDEO_HINT, /only the sound, not the video/)
  assert.match(VIDEO_PROCESSING_NOTE, /only the audio, not the video/)
  assert.ok(VIDEO_PROCESSING_TITLE.length > 0)
})

test('no message uses an em dash', () => {
  for (const m of [VIDEO_HINT, VIDEO_PROCESSING_TITLE, VIDEO_PROCESSING_NOTE, ...VIDEO_PROBLEMS])
    assert.ok(!m.includes('—'), m)
})

test('every video message the website lets through is one the server really sends', () => {
  const py = read('../../tools/video.py')
  assert.ok(VIDEO_PROBLEMS.length >= 4)
  for (const phrase of VIDEO_PROBLEMS) assert.ok(py.includes(phrase), `tools/video.py does not contain: ${phrase}`)
  assert.equal(isVideoProblemMessage('Request failed: We couldn\'t find any sound in this video.'), true)
  assert.equal(isVideoProblemMessage('Something else'), false)
})

test('the api has a separate call for video that posts to the video endpoint', () => {
  const api = read('../lib/api.ts')
  assert.match(api, /createFromVideo[\s\S]{0,200}\/capture\/jobs\/video/)
  assert.match(api, /authFetch\('\/capture\/jobs', \{ method: 'POST', body: formData \}\)/, 'the audio call must be untouched')
})

test('the upload page sends videos the video way and everything else exactly as before', () => {
  const up = read('../app/(app)/upload/page.tsx')
  assert.match(up, /isVideoUpload\(file\)/)
  assert.match(up, /jobForm\.append\(asVideo \? 'video' : 'audio', file\)/)
  assert.match(up, /asVideo \? api\.captureJobs\.createFromVideo\(jobForm\) : api\.captureJobs\.create\(jobForm\)/)
  assert.match(up, /videoTooLarge\(file\)/)
  assert.match(up, /isVideoProblemMessage\(e\)/)
})

test('video only appears in the picker for people who have background capture, on the recipe tab', () => {
  const up = read('../app/(app)/upload/page.tsx')
  assert.match(up, /mode === 'ai' && videoOk \? `,\$\{VIDEO_ACCEPT\}` : ''/)
  assert.match(up, /mode === 'ai' && videoOk && \(/)
  assert.ok(up.includes('{VIDEO_HINT}'))
  assert.ok(up.includes('VIDEO_PROCESSING_TITLE') && up.includes('VIDEO_PROCESSING_NOTE'))
})
