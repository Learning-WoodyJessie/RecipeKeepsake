'use client'
// Shown on the capture screen right after a recording has been uploaded in the background.
//
// The user can stay (the review opens by itself the moment the recipe is ready, which feels
// the same as the original flow) or leave (it waits for them on Home, and the Home card
// refreshes the instant they come back).
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { canRetry, progressLabel, reviewHref, shouldOpenReview } from '@/lib/captureJobs'
import { useCaptureJobs } from '@/lib/useCaptureJobs'

const primary: React.CSSProperties = {
  background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '0.6rem 1.25rem',
  fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'var(--sans)', textDecoration: 'none',
  display: 'inline-flex', alignItems: 'center', minHeight: 44,
}
const quiet: React.CSSProperties = { ...primary, background: 'none', color: 'var(--text2)', border: '1px solid var(--border)' }

export default function BackgroundCaptureStatus({ jobId, onRecordAnother }: { jobId: string; onRecordAnother: () => void }) {
  const router = useRouter()
  const { jobs, retry, discard } = useCaptureJobs()
  const job = jobs.find((j) => j.id === jobId)
  const opened = useRef(false)

  useEffect(() => {
    if (shouldOpenReview(job) && !opened.current) {
      opened.current = true
      router.push(reviewHref(jobId))
    }
  }, [job, jobId, router])

  const failed = job?.status === 'failed'

  return (
    <div role="status" aria-live="polite" data-testid="background-capture" style={{ padding: '1rem 0' }}>
      <p style={{ fontSize: '1.1rem', color: 'var(--text)', margin: '0 0 0.4rem', fontFamily: 'var(--serif)', fontWeight: 700 }}>
        {failed ? "We couldn't finish this one" : '✓ Recording saved'}
      </p>
      <p style={{ fontSize: '0.88rem', color: 'var(--muted)', margin: '0 0 0.35rem', lineHeight: 1.5 }}>
        {job ? progressLabel(job) : "We're writing it up now."}
      </p>
      {!failed && (
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
          This usually takes under a minute. You can leave this screen. It will be waiting for you on Home.
        </p>
      )}
      {failed && <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 1.25rem' }}>Your recording is safe.</p>}

      <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        {failed && job && canRetry(job) && (
          <button type="button" style={primary} onClick={() => { void retry(jobId).catch(() => {}) }}>Try again</button>
        )}
        <button type="button" style={failed ? quiet : primary} onClick={onRecordAnother}>Record another</button>
        <Link href="/home" style={quiet}>Back to Home</Link>
        {failed && (
          <button type="button" style={quiet} onClick={() => { void discard(jobId).then(onRecordAnother).catch(() => {}) }}>Discard</button>
        )}
      </div>
    </div>
  )
}
