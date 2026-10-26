'use client'
// Review a recording that was processed in the background, then save it.
// Reached from the Home card or automatically from the capture screen: /capture/review?job=<id>
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import ReviewWizard from '@/components/ReviewWizard'
import { api } from '@/lib/api'
import { isWorking, progressLabel, POLL_WHILE_WORKING_MS, type CaptureJob } from '@/lib/captureJobs'

type Load = { kind: 'loading' } | { kind: 'missing' } | { kind: 'job'; job: CaptureJob }

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ maxWidth: 520, margin: '3rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
      <h2 style={{ fontFamily: 'var(--serif)', color: 'var(--text)', marginBottom: '0.5rem' }}>{title}</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>{body}</p>
      <Link href="/home" style={{ color: 'var(--accent)', fontWeight: 600 }}>Back to Home</Link>
    </div>
  )
}

function ReviewInner() {
  const router = useRouter()
  const jobId = useSearchParams().get('job') ?? ''
  const [state, setState] = useState<Load>({ kind: 'loading' })

  useEffect(() => {
    if (!jobId) return          // rendered as "missing" below; no state to set
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const job = await api.captureJobs.get(jobId)
        if (cancelled) return
        if (job.status === 'saved' && job.memory_token) { router.replace(`/memory?token=${job.memory_token}&justSaved=1`); return }
        setState({ kind: 'job', job })
        if (isWorking(job)) timer = setTimeout(load, POLL_WHILE_WORKING_MS)
      } catch {
        if (!cancelled) setState({ kind: 'missing' })
      }
    }
    void load()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [jobId, router])

  if (!jobId || state.kind === 'missing') {
    return <Message title="We can't find this recording" body="It may already have been saved, or removed. Your saved memories are on Home." />
  }
  if (state.kind === 'loading') return <p style={{ padding: '2rem', color: 'var(--muted)' }}>Opening your recipe…</p>
  const { job } = state
  if (isWorking(job)) return <Message title="Still writing it up" body={progressLabel(job)} />
  if (job.status === 'failed') return <Message title="We couldn't finish this one" body={progressLabel(job)} />
  if (job.status !== 'ready' || !job.result) return <Message title="We can't find this recording" body="It may already have been saved, or removed." />

  return (
    <ReviewWizard
      draft={{ ...job.result, narrator: job.result.narrator ?? job.narrator ?? '', audio_url: '', image_url: '' }}
      jobId={job.id}
      narrator={job.narrator ?? undefined}
      onCancel={() => router.push('/home')}
    />
  )
}

export default function CaptureReviewPage() {
  return <Suspense><ReviewInner /></Suspense>
}
