// The rules behind the background-capture screens: what each state says, when to poll,
// when a job can be retried. Kept as plain functions so they can be tested without a browser.
// Run with: node --experimental-strip-types --test tests/capture-jobs-logic.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  POLL_WHILE_WORKING_MS, canRetry, cardTitle, isWorking, newClientRequestId, nextPollDelay,
  progressLabel, reviewHref, shouldOpenReview,
} from '../lib/captureJobs.ts'

const job = (over = {}) => ({
  id: 'j1', status: 'queued', stage: null, language: 'te', narrator: null, title: null,
  error_kind: null, error_message: null, memory_token: null,
  created_at: '2026-10-26T12:00:00+00:00', updated_at: '2026-10-26T12:00:00+00:00', ...over,
})

test('queued and processing jobs are "working"; everything else is not', () => {
  assert.equal(isWorking(job({ status: 'queued' })), true)
  assert.equal(isWorking(job({ status: 'processing' })), true)
  for (const status of ['ready', 'failed', 'saved', 'discarded']) assert.equal(isWorking(job({ status })), false)
})

test('each state tells the user what is happening in plain words', () => {
  assert.equal(progressLabel(job({ status: 'queued' })), 'Waiting for its turn…')
  assert.equal(progressLabel(job({ status: 'processing', stage: 'transcribing' })), 'Listening to the recording…')
  assert.equal(progressLabel(job({ status: 'processing', stage: 'structuring' })), 'Writing up the recipe…')
  assert.equal(progressLabel(job({ status: 'processing', stage: null })), 'Listening to the recording…')
  assert.equal(progressLabel(job({ status: 'ready' })), 'Ready to review')
})

test('a failed job shows the safe message the server wrote, with a calm fallback', () => {
  assert.equal(progressLabel(job({ status: 'failed', error_message: 'Our processing is busy right now.' })), 'Our processing is busy right now.')
  assert.equal(progressLabel(job({ status: 'failed', error_message: null })), "We couldn't finish this one. Your recording is safe.")
})

test('retry is offered for failed jobs, except ones the safety check refused', () => {
  assert.equal(canRetry(job({ status: 'failed', error_kind: 'provider_busy' })), true)
  assert.equal(canRetry(job({ status: 'failed', error_kind: 'unreadable_audio' })), true)
  assert.equal(canRetry(job({ status: 'failed', error_kind: 'rejected' })), false)
  assert.equal(canRetry(job({ status: 'ready' })), false)
  assert.equal(canRetry(job({ status: 'processing' })), false)
})

test('polling happens only while something is being worked on, only when the page is visible and the feature is on', () => {
  const working = [job({ status: 'processing' })]
  assert.equal(nextPollDelay(working, { visible: true, enabled: true }), POLL_WHILE_WORKING_MS)
  assert.equal(nextPollDelay(working, { visible: false, enabled: true }), null)      // phone locked or tab hidden
  assert.equal(nextPollDelay(working, { visible: true, enabled: false }), null)      // feature off: never poll
  assert.equal(nextPollDelay([job({ status: 'ready' }), job({ status: 'failed' })], { visible: true, enabled: true }), null)
  assert.equal(nextPollDelay([], { visible: true, enabled: true }), null)
})

test('the review opens by itself only when the job being watched is ready', () => {
  assert.equal(shouldOpenReview(job({ status: 'ready' })), true)
  for (const status of ['queued', 'processing', 'failed', 'saved']) assert.equal(shouldOpenReview(job({ status })), false)
  assert.equal(shouldOpenReview(undefined), false)
})

test('the card title prefers the recipe name, then the narrator, then a neutral label', () => {
  assert.equal(cardTitle(job({ title: 'Pesarattu', narrator: 'Lakshmi' })), 'Pesarattu')
  assert.equal(cardTitle(job({ narrator: 'Lakshmi' })), "Lakshmi's recording")
  assert.equal(cardTitle(job()), 'New recording')
})

test('review links are safe to put in a URL', () => {
  assert.equal(reviewHref('abc-123'), '/capture/review?job=abc-123')
  assert.equal(reviewHref('a b&c'), '/capture/review?job=a%20b%26c')
})

test('request ids are unique, URL-safe, and match what the server accepts', () => {
  const ids = new Set(Array.from({ length: 200 }, () => newClientRequestId()))
  assert.equal(ids.size, 200)
  for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{8,64}$/)       // tools/jobs.py and capture_jobs_api._REQUEST_ID
})
