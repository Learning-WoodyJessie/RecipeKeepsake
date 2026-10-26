// Guards for the background-capture screens.
//
// The promise is "no regressions": for anyone the feature is not switched on for, the website
// behaves exactly as before. These tests pin down the structure that makes that true, and keep the
// website and the server from drifting apart (statuses, stages and URLs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(root, rel), 'utf8')
const capture = read('../app/(app)/capture/page.tsx')
const upload = read('../app/(app)/upload/page.tsx')
const wizard = read('../components/ReviewWizard.tsx')
const hook = read('../lib/useCaptureJobs.ts')
const banner = read('../components/CaptureJobsBanner.tsx')
const memory = read('../app/(app)/memory/page.tsx')
const api = read('../lib/api.ts')
const logic = read('../lib/captureJobs.ts')

test('capture screen: the background path asks the feature check first and otherwise changes nothing', () => {
  const fn = capture.slice(capture.indexOf('async function tryBackgroundCapture'), capture.indexOf('async function processAudio'))
  const guardAt = fn.indexOf('if (!(await captureJobsEnabled())) return false')
  assert.ok(guardAt >= 0, 'the feature check is missing')
  assert.ok(guardAt < fn.indexOf('api.captureJobs.create'), 'the feature check must come before any job request')
  const guard = fn.slice(0, fn.indexOf('return false') + 12)
  assert.doesNotMatch(guard, /setStage|setError|FormData|api\./, 'nothing may happen before the check passes')
  assert.match(capture, /async function processAudio\(blob: Blob\) \{\n    if \(await tryBackgroundCapture\(blob\)\) return/)
})

test('capture screen: the original flow is still there, line for line', () => {
  for (const original of [
    "const result = await api.capture.process(form)",
    "setAudioFile(new File([blob], filename, { type: blob.type }))",
    "setDraft(result)",
    "setStage('review')",
    "return <ReviewWizard draft={draft} audioFile={audioFile} narrator={narrator}",
  ]) assert.ok(capture.includes(original), `original flow changed: ${original}`)
})

test('capture screen: a retry resends the SAME recording, and a new or discarded recording never reuses an upload key', () => {
  assert.match(capture, /if \(uploadIdRef\.current && blobRef\.current\) \{ setError\(''\); setStage\('processing'\); void processAudio\(blobRef\.current\) \}/)
  const discard = capture.slice(capture.indexOf('function discardRecording'), capture.indexOf('async function tryBackgroundCapture'))
  assert.match(discard, /uploadIdRef\.current = null/)
  const start = capture.slice(capture.indexOf('async function startRecording'), capture.indexOf('async function startRecording') + 400)
  assert.match(start, /uploadIdRef\.current = null/)
})

test('upload screen: the original flow is reached whenever background capture is off', () => {
  const fn = upload.slice(upload.indexOf('async function handleFileAI'), upload.indexOf('// Direct save mode'))
  assert.ok(fn.includes('if (await captureJobsEnabled()) {'))
  assert.ok(fn.indexOf('const result = await api.capture.process(form)') > fn.indexOf('return\n    }'),
    'the original request must come after the background branch has returned')
  assert.match(fn, /uploadRef\.current\?\.file !== file/, 'an upload key must be tied to the file it was made for')
})

test('review wizard: the original save is untouched and the recording is never re-uploaded for a draft', () => {
  assert.match(wizard, /form\.append\('audio', audioFile, audioFile\.name\)/)
  assert.match(wizard, /saved = await api\.capture\.save\(form\)/)
  const jobBranch = wizard.slice(wizard.indexOf('if (jobId) {'), wizard.indexOf('} else {', wizard.indexOf('if (jobId) {')))
  assert.match(jobBranch, /api\.captureJobs\.save\(jobId,/)
  assert.doesNotMatch(jobBranch, /FormData|audioFile/)
})

test('feature check: any failure means "off", so the original flow keeps working', () => {
  assert.match(hook, /api\.features\.get\(\)\.then\(\(f\) => f\.capture_jobs\)\.catch\(\(\) => \{[\s\S]*?return false/)
  assert.match(api, /const on = !!data && typeof data === 'object' && \(data as \{ capture_jobs\?: unknown \}\)\.capture_jobs === true/,
    'only a literal true switches the feature on')
})

test('Home card: renders nothing unless the feature is on and there is something to show', () => {
  assert.match(banner, /if \(!enabled \|\| jobs\.length === 0\) return null/)
})

test('polling and the foreground refresh only run when the feature is on', () => {
  const polling = hook.slice(hook.indexOf('// While something is being worked on'))
  assert.equal((polling.match(/if \(!enabled\) return/g) ?? []).length, 2)
  assert.match(hook, /appStateChange/)
  assert.match(hook, /visibilitychange/)
})

test('memory page: only a background-captured save goes looking for its picture', () => {
  assert.match(memory, /get\('imagePending'\) !== '1'\) return/)
  assert.match(wizard, /const afterSave = jobId \? '&imagePending=1' : ''/)
})

test('statuses and stages agree between the website, the server and the database migration', () => {
  const union = (src, name) => new Set([...src.match(new RegExp(`export type ${name} =([^\\n]+(?:\\n\\s+\\|[^\\n]+)*)`))[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))
  const sql = read('../../data/migrations/006_capture_jobs.sql')
  const sqlStatuses = new Set([...sql.match(/status IN \(([^)]+)\)/)[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]))
  assert.deepEqual([...union(logic, 'JobStatus')].sort(), [...sqlStatuses].sort())

  const runner = read('../../scripts/capture_jobs_api.py') + read('../../tools/jobs.py')
  const serverStages = new Set([...runner.matchAll(/(?:set_stage\([^,]+, |"stage": )"([a-z]+)"/g)].map((m) => m[1]))
  for (const stage of serverStages) assert.ok(union(logic, 'JobStage').has(stage), `server stage "${stage}" missing from the website`)
})

test('every URL the website calls exists on the server, with the same method', () => {
  const server = read('../../scripts/capture_jobs_api.py')
  const routes = new Set([...server.matchAll(/@router\.(get|post|delete)\("([^"]+)"\)/g)].map((m) => `${m[1]} ${m[2].replace(/\{[a-z_]+\}/g, '{id}')}`))
  const block = api.slice(api.indexOf('captureJobs: {'), api.indexOf('audio: {'))
  const calls = [
    ['post', '/capture/jobs', /authFetch\('\/capture\/jobs', \{ method: 'POST'/],
    ['get', '/capture/jobs', /authFetch\('\/capture\/jobs'\)/],
    ['get', '/capture/jobs/{id}', /authFetch\(`\/capture\/jobs\/\$\{encodeURIComponent\(id\)\}`\)/],
    ['post', '/capture/jobs/{id}/save', /\/save`,\s*\{\s*method: 'POST'/],
    ['post', '/capture/jobs/{id}/retry', /\/retry`, \{ method: 'POST' \}/],
    ['delete', '/capture/jobs/{id}', /\{ method: 'DELETE' \}/],
  ]
  for (const [method, route, pattern] of calls) {
    assert.ok(routes.has(`${method} ${route}`), `server has no ${method} ${route}`)
    assert.match(block, pattern, `website call for ${method} ${route} changed`)
  }
  assert.ok(routes.has('get /features'))
})
