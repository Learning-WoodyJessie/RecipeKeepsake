// Capture a Memory page — aligned to Echoes of Home product mockup.
// Two-column: main (hero label, narrator chips, record card, OR, upload rows, privacy)
// Right: Tips for a great memory panel.

'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import NarratorChip from '@/components/NarratorChip'
import ReviewWizard from '@/components/ReviewWizard'
import { api } from '@/lib/api'

type Stage = 'idle' | 'recording' | 'processing' | 'review' | 'error'

const TIPS = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
      </svg>
    ),
    title: 'Ask what makes the recipe special',
    desc: 'Capture the stories behind the dish.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
      </svg>
    ),
    title: 'Ask for her tips and little secrets',
    desc: 'Those little details make it priceless.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
    title: 'Let her talk naturally',
    desc: 'The more she shares, the better!',
  },
]

function TipsPanel() {
  return (
    <aside>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.35rem 1.25rem', boxShadow: '0 4px 16px rgba(45,27,14,0.05)' }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)', marginBottom: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span aria-hidden>💡</span> Tips for a great memory
        </h3>
        {TIPS.map((tip) => (
          <div key={tip.title} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.1rem' }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
              {tip.icon}
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', marginBottom: 3 }}>{tip.title}</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>{tip.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}

// Waveform decoration (static, decorative)
function WaveformDecoration() {
  const bars = [3, 5, 8, 6, 10, 7, 4, 9, 6, 8, 5, 7, 10, 6, 4, 8, 5, 9, 6, 7, 4, 6, 9, 7, 5]
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, height: 28, opacity: 0.45 }}>
      {bars.map((h, i) => (
        <div key={i} style={{ width: 2.5, height: h * 2.5, borderRadius: 2, background: 'var(--accent)' }} />
      ))}
    </div>
  )
}

function pickMimeType(): { mimeType: string; ext: string } {
  const candidates = [
    { mimeType: 'audio/webm;codecs=opus', ext: '.webm' },
    { mimeType: 'audio/webm', ext: '.webm' },
    { mimeType: 'audio/ogg;codecs=opus', ext: '.ogg' },
    { mimeType: 'audio/mp4', ext: '.mp4' },
  ]
  const supported = candidates.find(c => MediaRecorder.isTypeSupported(c.mimeType))
  return supported ?? { mimeType: '', ext: '.webm' }
}

export default function CapturePage() {
  const router = useRouter()
  const [mode, setMode] = useState<'ai' | 'direct'>('ai')
  const [stage, setStage] = useState<Stage>('idle')
  const [narrator, setNarrator] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState(0)
  const [draft, setDraft] = useState<any>(null)
  const [error, setError] = useState('')
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const extRef = useRef<string>('.webm')

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  async function startRecording() {
    if (mode === 'direct' && !title.trim()) { setError('Please enter a title before recording.'); return }
    setError('')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
    if (!stream) { setError('Microphone access denied'); setStage('error'); return }
    const { mimeType, ext } = pickMimeType()
    extRef.current = ext
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {})
    mrRef.current = mr
    chunksRef.current = []
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(chunksRef.current, { type: mr.mimeType })
      if (mode === 'direct') saveAudioDirect(blob)
      else processAudio(blob)
    }
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
    form.append('audio', blob, `recording${extRef.current}`)
    if (narrator) form.append('narrator', narrator)
    try {
      const result = await api.capture.process(form)
      setDraft(result)
      setStage('review')
    } catch (e: unknown) { setError((e as Error).message); setStage('error') }
  }

  async function saveAudioDirect(blob: Blob) {
    const form = new FormData()
    form.append('audio', blob, `recording${extRef.current}`)
    form.append('title', title.trim())
    if (narrator) form.append('narrator', narrator)
    if (description.trim()) form.append('description', description.trim())
    try {
      const result = await api.audio.save(form) as { token: string }
      router.push(`/memory?token=${result.token}`)
    } catch (e: unknown) { setError((e as Error).message); setStage('error') }
  }

  if (stage === 'review' && draft) {
    return <ReviewWizard draft={draft} onCancel={() => { setStage('idle'); setDraft(null) }} />
  }

  const narratorLabel = narrator || 'she'

  return (
    <div style={{ padding: '1.5rem 1.75rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <style>{`
        .rk-capture-cols { display: grid; grid-template-columns: 1fr; gap: 1.5rem; }
        @media (min-width: 860px) { .rk-capture-cols { grid-template-columns: 1fr 272px; align-items: start; } }
      `}</style>

      {/* Back */}
      <Link href="/home" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text2)', textDecoration: 'none', fontSize: '0.85rem', marginBottom: '1.5rem', fontWeight: 500 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </Link>

      <div className="rk-capture-cols">
        {/* ── Main ── */}
        <div>
          {/* Hero header */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.65rem' }}>
              Capture a Memory
            </p>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.5rem, 3.5vw, 2rem)', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem', lineHeight: 1.2 }}>
              {mode === 'direct'
                ? <>What will {narratorLabel} share today? <span style={{ color: 'var(--accent)' }}>♪</span></>
                : <>What is {narratorLabel} making today? <span style={{ color: 'var(--accent)' }}>♡</span></>}
            </h1>
            <p style={{ fontSize: '0.88rem', color: 'var(--muted)', marginBottom: '1rem' }}>
              {mode === 'direct' ? 'Just press record. We’ll keep it safe forever.' : 'Just let her talk. We’ll take care of the rest.'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.65rem' }}>
              <div style={{ height: 1, width: 80, background: 'var(--border)' }} />
              <span style={{ color: 'var(--accent)', fontSize: '0.85rem', opacity: 0.6 }}>♥</span>
              <div style={{ height: 1, width: 80, background: 'var(--border)' }} />
            </div>
          </div>

          {/* Mode tabs */}
          {stage === 'idle' && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.35rem', background: 'var(--cream2)', borderRadius: 12, padding: '0.3rem' }}>
              {(['ai', 'direct'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError('') }}
                  style={{
                    flex: 1,
                    padding: '0.6rem 1rem',
                    borderRadius: 10,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--sans)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    background: mode === m ? 'var(--surface)' : 'transparent',
                    color: mode === m ? 'var(--accent)' : 'var(--muted)',
                    boxShadow: mode === m ? '0 2px 8px rgba(45,27,14,0.08)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  {m === 'ai' ? '🎙 A recipe narration' : '🎵 A song or poem'}
                </button>
              ))}
            </div>
          )}

          {/* Title + description for direct mode */}
          {mode === 'direct' && stage === 'idle' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  Title *
                </div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Appa's evening ghazal, Nani's lullaby…"
                  style={{
                    width: '100%',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.9rem',
                    fontFamily: 'var(--sans)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  Description
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this — a poem, a song, a prayer? Why does it matter?"
                  rows={2}
                  style={{
                    width: '100%',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.9rem',
                    fontFamily: 'var(--sans)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </>
          )}

          {/* Narrator / Author chips */}
          {stage !== 'review' && (
            <div style={{ marginBottom: '1.35rem' }}>
              <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.6rem' }}>
                {mode === 'direct' ? 'Who is performing?' : 'Who is narrating?'}
              </p>
              <NarratorChip selected={narrator} onSelect={setNarrator} />
            </div>
          )}

          {/* Recording card */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: '2.5rem 1.5rem 1.5rem',
            textAlign: 'center',
            marginBottom: '1rem',
            boxShadow: '0 4px 16px rgba(45,27,14,0.05)',
          }}>
            {stage === 'idle' && (
              <>
                {/* Dashed circle + mic button */}
                <div style={{ position: 'relative', width: 110, height: 110, margin: '0 auto 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px dashed var(--border)', opacity: 0.8 }} />
                  <button
                    onClick={startRecording}
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: '50%',
                      background: 'var(--accent-light)',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent)',
                      transition: 'transform 0.15s',
                    }}
                    aria-label="Start recording"
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
                    </svg>
                  </button>
                </div>
                <p style={{ fontFamily: 'monospace', fontSize: '1.75rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>00:00</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>Tap the microphone to start recording</p>
                <WaveformDecoration />
              </>
            )}

            {stage === 'recording' && (
              <>
                <div style={{ position: 'relative', width: 110, height: 110, margin: '0 auto 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px dashed #DC2626', opacity: 0.5, animation: 'pulse 1.5s infinite' }} />
                  <button
                    onClick={stopRecording}
                    style={{ width: 80, height: 80, borderRadius: '50%', background: '#FEE2E2', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626' }}
                    aria-label="Stop recording"
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="#DC2626" stroke="none"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                  </button>
                </div>
                <p style={{ fontFamily: 'monospace', fontSize: '1.75rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>{fmt(duration)}</p>
                <p style={{ fontSize: '0.82rem', color: '#DC2626', marginBottom: '1.25rem' }}>Recording… tap to stop</p>
                <WaveformDecoration />
              </>
            )}

            {stage === 'processing' && (
              <div style={{ padding: '1rem 0' }}>
                <p style={{ fontSize: '1.1rem', color: 'var(--text2)', marginBottom: '0.5rem' }}>
                  {mode === 'direct' ? '♪ Saving your keepsake…' : '✨ Listening carefully…'}
                </p>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                  {mode === 'direct' ? 'Your recording is being preserved — just a moment' : 'Transcribing, translating, and structuring — about 30–60 seconds'}
                </p>
              </div>
            )}

            {stage === 'error' && (
              <div style={{ padding: '1rem 0' }}>
                <p style={{ color: 'var(--accent)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</p>
                <button onClick={() => { setStage('idle'); setError('') }} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '0.6rem 1.5rem', cursor: 'pointer', fontWeight: 600 }}>Try again</button>
              </div>
            )}
          </div>

          {/* OR divider */}
          {(stage === 'idle' || stage === 'error') && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0.85rem 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em' }}>OR</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              {/* Upload an audio file */}
              <Link
                href="/upload"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: '1rem 1.15rem',
                  textDecoration: 'none',
                  marginBottom: '0.65rem',
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', marginBottom: 2 }}>Upload an audio file</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Upload an existing recording</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)', flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
              </Link>

              {/* Privacy badge */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', padding: '1rem 1.15rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', marginBottom: 3 }}>Your memories are private and secure.</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>Only you and your family can access these memories.</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Tips sidebar ── */}
        <TipsPanel />
      </div>
    </div>
  )
}
