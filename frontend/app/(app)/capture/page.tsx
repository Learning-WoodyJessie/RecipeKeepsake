// This file defines the Capture page in the application.
// Purpose: Allows users to record audio narrations for memories.
// Why: Enables the core functionality of capturing family memories through voice recordings.
// How: Uses MediaRecorder API for audio recording and React hooks for state management.

'use client'
import { useState, useRef } from 'react'
import NarratorChip from '@/components/NarratorChip'
import ReviewWizard from '@/components/ReviewWizard'
import { api } from '@/lib/api'

type Stage = 'idle' | 'recording' | 'processing' | 'review' | 'error'

export default function CapturePage() {
  const [stage, setStage] = useState<Stage>('idle')
  const [narrator, setNarrator] = useState('')
  const [duration, setDuration] = useState(0)
  const [draft, setDraft] = useState<any>(null)
  const [error, setError] = useState('')
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
    if (!stream) { setError('Microphone access denied'); setStage('error'); return }
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mrRef.current = mr
    chunksRef.current = []
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); processAudio(new Blob(chunksRef.current, { type: 'audio/webm' })) }
    mr.start()
    setStage('recording')
    setDuration(0)
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    mrRef.current?.stop()
    setStage('processing')
  }

  async function processAudio(blob: Blob) {
    const form = new FormData()
    form.append('audio', blob, 'recording.webm')
    if (narrator) form.append('narrator', narrator)
    try {
      const result = await api.capture.process(form)
      setDraft(result)
      setStage('review')
    } catch (e: unknown) { setError((e as Error).message); setStage('error') }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '1.5rem 2rem' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', color: 'var(--text)', marginBottom: '0.5rem' }}>Record a Memory</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>Sit with your narrator. Press record. Let them speak naturally.</p>

      {stage !== 'review' && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.5rem' }}>Who is narrating?</div>
          <NarratorChip selected={narrator} onSelect={setNarrator} />
        </div>
      )}

      {stage === 'idle' && (
        <div style={{ textAlign: 'center', padding: '2.5rem 0' }}>
          <button onClick={startRecording} style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--accent)', border: 'none', color: 'white', fontSize: '2.5rem', cursor: 'pointer', boxShadow: '0 0 0 12px var(--accent-light)' }}>🎙️</button>
          <p style={{ marginTop: '1.25rem', color: 'var(--muted)', fontSize: '0.82rem' }}>Tap to start recording</p>
        </div>
      )}

      {stage === 'recording' && (
        <div style={{ textAlign: 'center', padding: '2.5rem 0' }}>
          <button onClick={stopRecording} style={{ width: 96, height: 96, borderRadius: '50%', background: '#DC2626', border: 'none', color: 'white', fontSize: '2.5rem', cursor: 'pointer' }}>⏹</button>
          <p style={{ marginTop: '1.25rem', fontSize: '1.5rem', fontFamily: 'monospace', color: 'var(--text)' }}>{fmt(duration)}</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.5rem' }}>Tap to stop</p>
        </div>
      )}

      {stage === 'processing' && (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--muted)' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>⏳ Processing…</p>
          <p style={{ fontSize: '0.82rem' }}>Transcribing, translating, and structuring — about 30–60 seconds</p>
        </div>
      )}

      {stage === 'error' && (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <p style={{ color: 'var(--accent)', marginBottom: '1rem' }}>{error}</p>
          <button onClick={() => { setStage('idle'); setError('') }} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '0.6rem 1.5rem', cursor: 'pointer', fontWeight: 600 }}>Try again</button>
        </div>
      )}

      {stage === 'review' && draft && (
        <ReviewWizard draft={draft} onCancel={() => { setStage('idle'); setDraft(null) }} />
      )}
    </div>
  )
}
