// Upload Recording page — aligned to Echoes of Home product mockup.
// Two-column: main (cassette hero + dropzone + formats + privacy) | right (tips).

'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import NarratorChip from '@/components/NarratorChip'
import ReviewWizard from '@/components/ReviewWizard'
import { api } from '@/lib/api'

const TIPS = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
      </svg>
    ),
    title: 'Clear voice',
    desc: 'Record in a quiet space with minimal background noise.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    title: 'Good length',
    desc: 'Recordings between 30 seconds – 15 minutes work best.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/>
      </svg>
    ),
    title: 'Check before uploading',
    desc: 'Play your recording once to ensure it\'s clear.',
  },
]

// Cassette illustration using SVG
function CassetteHero() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
      {/* Left waveform */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {[6, 10, 14, 10, 7, 12, 9].map((h, i) => (
          <div key={i} style={{ width: 3, height: h * 2, borderRadius: 2, background: 'var(--accent)', opacity: 0.7 }} />
        ))}
      </div>
      {/* Cassette body */}
      <div style={{ position: 'relative' }}>
        {/* Floating hearts */}
        <span style={{ position: 'absolute', top: -14, left: -4, fontSize: '0.75rem', color: 'var(--accent)', opacity: 0.7 }}>♥</span>
        <span style={{ position: 'absolute', top: -10, right: -6, fontSize: '0.6rem', color: '#F4A261', opacity: 0.8 }}>✦</span>
        <svg width="100" height="68" viewBox="0 0 100 68" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Cassette body */}
          <rect x="2" y="8" width="96" height="54" rx="8" fill="#FDF5ED" stroke="#E8C9A8" strokeWidth="2"/>
          {/* Left reel */}
          <circle cx="32" cy="35" r="14" fill="#FAE8D4" stroke="#E8C9A8" strokeWidth="1.5"/>
          <circle cx="32" cy="35" r="6" fill="white" stroke="#E8C9A8" strokeWidth="1.5"/>
          {/* Right reel */}
          <circle cx="68" cy="35" r="14" fill="#FAE8D4" stroke="#E8C9A8" strokeWidth="1.5"/>
          <circle cx="68" cy="35" r="6" fill="white" stroke="#E8C9A8" strokeWidth="1.5"/>
          {/* Tape window */}
          <rect x="38" y="28" width="24" height="14" rx="3" fill="#F0DFD0" stroke="#E8C9A8" strokeWidth="1"/>
          {/* Label strip */}
          <rect x="18" y="10" width="64" height="10" rx="3" fill="#FAE8D4" stroke="#E8C9A8" strokeWidth="1"/>
          {/* Record button dot */}
          <circle cx="50" cy="56" r="4" fill="#C4522A" opacity="0.7"/>
        </svg>
      </div>
      {/* Right waveform */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {[9, 12, 7, 10, 14, 10, 6].map((h, i) => (
          <div key={i} style={{ width: 3, height: h * 2, borderRadius: 2, background: 'var(--accent)', opacity: 0.7 }} />
        ))}
      </div>
    </div>
  )
}

export default function UploadPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'ai' | 'direct'>('ai')
  const [narrator, setNarrator] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [draft, setDraft] = useState<any>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  // AI pipeline mode
  async function handleFileAI(file: File) {
    setProcessing(true)
    setError('')
    const form = new FormData()
    form.append('audio', file)
    if (narrator) form.append('narrator', narrator)
    try {
      const result = await api.capture.process(form)
      setDraft(result)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setProcessing(false)
    }
  }

  // Direct save mode
  async function handleFileDirect(file: File) {
    if (!title.trim()) { setError('Please enter a title first.'); return }
    setProcessing(true)
    setError('')
    const form = new FormData()
    form.append('audio', file)
    form.append('title', title.trim())
    if (narrator) form.append('narrator', narrator)
    if (description.trim()) form.append('description', description.trim())
    try {
      const result = await api.audio.save(form) as { token: string }
      router.push(`/memory?token=${result.token}`)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setProcessing(false)
    }
  }

  function handleFile(file: File) {
    if (mode === 'direct') return handleFileDirect(file)
    return handleFileAI(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, [narrator, title, mode])

  if (draft) return <ReviewWizard draft={draft} onCancel={() => setDraft(null)} />

  return (
    <div style={{ padding: '1.5rem 1.75rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <style>{`
        .rk-upload-cols {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.5rem;
        }
        @media (min-width: 900px) {
          .rk-upload-cols { grid-template-columns: 1fr 280px; align-items: start; }
        }
      `}</style>

      {/* Back link */}
      <Link href="/home" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text2)', textDecoration: 'none', fontSize: '0.85rem', marginBottom: '1.75rem', fontWeight: 500 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </Link>

      <div className="rk-upload-cols">
        {/* ── Main ── */}
        <div>
          {/* Hero */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <CassetteHero />
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 700, color: 'var(--text)', marginBottom: '0.65rem', lineHeight: 1.2 }}>
              {mode === 'direct' ? 'Preserve a song or poem forever' : 'Bring grandma’s voice back to life'}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: 440, margin: '0 auto' }}>
              {mode === 'direct'
                ? <>Upload the audio and we&apos;ll keep it safe —<br />just as it was recorded.</>
                : <>Upload a recording and we&apos;ll turn it into<br />a recipe memory you can keep forever.</>}
            </p>
          </div>

          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'var(--cream2)', borderRadius: 12, padding: '0.3rem' }}>
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

          {mode === 'direct' && (
            <>
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  Title *
                </div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Ammamma's lullaby, Eid poem…"
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

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  Description
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A short note about this audio — what it is, why it matters…"
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

          {/* Narrator / Author picker */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              {mode === 'direct' ? 'Author' : 'Who is narrating?'}
            </div>
            <NarratorChip selected={narrator} onSelect={setNarrator} />
          </div>

          {/* Drop zone */}
          <label
            style={{
              display: 'block',
              border: `2px dashed ${dragOver ? 'var(--accent)' : '#E0C9B5'}`,
              borderRadius: 18,
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              cursor: processing ? 'default' : 'pointer',
              background: dragOver ? 'var(--accent-light)' : 'var(--surface)',
              transition: 'border-color 0.2s, background 0.2s',
              marginBottom: '1rem',
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <input
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.webm"
              style={{ display: 'none' }}
              disabled={processing}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            {processing ? (
              <div>
                <p style={{ fontSize: '1.1rem', color: 'var(--text2)', marginBottom: '0.5rem' }}>
                  {mode === 'direct' ? '♪ Saving your keepsake…' : '✨ Listening carefully…'}
                </p>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                  {mode === 'direct' ? 'Your audio is being preserved — just a moment' : 'Transcribing, translating, and structuring — about 30–60 seconds'}
                </p>
              </div>
            ) : (
              <>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: 'var(--accent)' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                    <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
                  </svg>
                </div>
                <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)', marginBottom: '0.35rem' }}>
                  Drag &amp; drop your audio file here
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                  or click anywhere to upload
                </p>
                <p style={{ fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 500 }}>
                  {mode === 'direct' ? '♪ Kept exactly as it is — a gift for the family' : '✦ Best results with clear voice recordings'}
                </p>
              </>
            )}
          </label>

          {error && (
            <p style={{ color: 'var(--accent)', marginBottom: '0.75rem', fontSize: '0.82rem' }}>{error}</p>
          )}

          {/* Formats */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '1rem', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
            Supported formats: MP3, M4A, WAV, WebM, Opus &nbsp;•&nbsp; Up to 50MB
          </div>

          {/* Privacy badge */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', padding: '1rem 1.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)', marginBottom: 3 }}>Your recordings are private and secure.</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.5 }}>Only you and your family can access these memories.</p>
            </div>
          </div>
        </div>

        {/* ── Tips sidebar ── */}
        <aside>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.35rem 1.25rem', boxShadow: '0 4px 16px rgba(45,27,14,0.05)' }}>
            <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)', marginBottom: '1.15rem' }}>
              Tips for the best results
            </h3>
            {TIPS.map((tip) => (
              <div key={tip.title} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.1rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
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
      </div>
    </div>
  )
}
