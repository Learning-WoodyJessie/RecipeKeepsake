// Background capture: what the screens say and when they ask the server for news.
//
// A recording is uploaded once; the server turns it into a draft recipe while the user
// does something else; the user reviews and saves it. These are the rules for that journey,
// kept as plain functions with no imports so they can be tested without a browser.
// Server side: scripts/capture_jobs_api.py. Design: docs/plans/2026-10-26-capture-jobs-design.md

export type JobStatus = 'queued' | 'processing' | 'ready' | 'failed' | 'saved' | 'discarded'
export type JobStage = 'transcribing' | 'structuring'

export type JobDraft = {
  title: string
  narrator: string | null
  ingredients: { item: string; quantity: string }[]
  steps: string[]
  cook_notes: string
  review_flags: string[]
  transcript_raw: string
  transcript_english: string
  category: string
  image_url: string
}

export type CaptureJob = {
  id: string
  status: JobStatus
  stage: JobStage | null
  language: string | null
  narrator: string | null
  title: string | null
  error_kind: string | null
  error_message: string | null
  memory_token: string | null
  created_at: string
  updated_at: string
  result?: JobDraft | null
}

// How often to ask "is it done yet?" while a job is being worked on. Nothing else polls.
export const POLL_WHILE_WORKING_MS = 3000

export function isWorking(job: CaptureJob): boolean {
  return job.status === 'queued' || job.status === 'processing'
}

export function progressLabel(job: CaptureJob): string {
  switch (job.status) {
    case 'queued':
      return 'Waiting for its turn…'
    case 'processing':
      return job.stage === 'structuring' ? 'Writing up the recipe…' : 'Listening to the recording…'
    case 'ready':
      return 'Ready to review'
    case 'failed':
      return job.error_message || "We couldn't finish this one. Your recording is safe."
    default:
      return ''
  }
}

// A recording the safety check refused would be refused again, so only Discard makes sense.
export function canRetry(job: CaptureJob): boolean {
  return job.status === 'failed' && job.error_kind !== 'rejected'
}

export function shouldOpenReview(job: CaptureJob | undefined): boolean {
  return job?.status === 'ready'
}

export function cardTitle(job: CaptureJob): string {
  if (job.title) return job.title
  if (job.narrator) return `${job.narrator}'s recording`
  return 'New recording'
}

export function reviewHref(jobId: string): string {
  return `/capture/review?job=${encodeURIComponent(jobId)}`
}

// null means "do not poll". Only an unfinished job on a visible page with the feature on needs news.
export function nextPollDelay(
  jobs: CaptureJob[],
  { visible, enabled }: { visible: boolean; enabled: boolean },
): number | null {
  if (!enabled || !visible) return null
  return jobs.some(isWorking) ? POLL_WHILE_WORKING_MS : null
}

// Sent with every upload. If the response is lost and the user taps again, the server
// recognises the id and returns the original job instead of making (and charging) a second.
export function newClientRequestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}
