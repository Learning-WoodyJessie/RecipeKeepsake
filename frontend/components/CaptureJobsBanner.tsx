'use client'
// Home: recordings that are still being written up, ready to review, or that could not finish.
// Renders nothing at all unless background capture is switched on for this user and they have
// at least one open job, so it is invisible to everyone the feature is not enabled for.
import { useState } from 'react'
import Link from 'next/link'
import { canRetry, cardTitle, isWorking, progressLabel, reviewHref, type CaptureJob } from '@/lib/captureJobs'
import { useCaptureJobs } from '@/lib/useCaptureJobs'

const button: React.CSSProperties = {
  minHeight: 36, padding: '0.35rem 0.9rem', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--sans)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
}

function JobCard({ job, onRetry, onDiscard }: { job: CaptureJob; onRetry: () => void; onDiscard: () => void }) {
  const working = isWorking(job)
  const ready = job.status === 'ready'
  const failed = job.status === 'failed'
  const [busy, setBusy] = useState(false)
  const run = (fn: () => void) => () => { setBusy(true); fn() }

  return (
    <div
      data-testid="capture-job"
      data-status={job.status}
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem 1rem', padding: '0.85rem 1rem',
        borderRadius: 14, border: `1px solid ${ready ? 'var(--accent)' : 'var(--border)'}`,
        background: ready ? 'var(--accent-light)' : 'var(--surface)',
      }}
    >
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.98rem', color: 'var(--text)', overflowWrap: 'anywhere' }}>
          {cardTitle(job)}
        </p>
        <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: failed ? 'var(--accent)' : 'var(--muted)', lineHeight: 1.45 }}>
          {working && <span aria-hidden="true" style={{ marginRight: 6 }}>✨</span>}
          {progressLabel(job)}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {ready && (
          <Link href={reviewHref(job.id)} style={{ ...button, background: 'var(--accent)', color: 'white', border: 'none' }}>
            Review
          </Link>
        )}
        {failed && canRetry(job) && (
          <button type="button" disabled={busy} onClick={run(onRetry)} style={{ ...button, background: 'var(--accent)', color: 'white', border: 'none' }}>
            Try again
          </button>
        )}
        {(ready || failed) && (
          <button type="button" disabled={busy} onClick={run(onDiscard)} style={{ ...button, background: 'none', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            Discard
          </button>
        )}
      </div>
    </div>
  )
}

export default function CaptureJobsBanner() {
  const { enabled, jobs, retry, discard } = useCaptureJobs()
  if (!enabled || jobs.length === 0) return null

  return (
    <section aria-label="Recordings in progress" role="status" aria-live="polite" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', margin: '0 0 0.6rem', color: 'var(--text)' }}>
        Your recordings
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            onRetry={() => { void retry(job.id).catch(() => {}) }}
            onDiscard={() => { void discard(job.id).catch(() => {}) }}
          />
        ))}
      </div>
    </section>
  )
}
