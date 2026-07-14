// Upload Recording page — aligned to Echoes of Home product mockup.
// Two-column: main (cassette hero + dropzone + formats + privacy) | right (tips).

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import NarratorCarousel from '@/components/NarratorCarousel'
import ReviewWizard from '@/components/ReviewWizard'
import SingleScreenReview from '@/components/SingleScreenReview'
import { api } from '@/lib/api'

const TIPS_RECIPE = [
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>,
    title: 'Clear voice',
    desc: 'Record in a quiet space with minimal background noise.',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    title: 'Good length',
    desc: 'Recordings between 30 seconds – 15 minutes work best.',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>,
    title: 'Check before uploading',
    desc: 'Play your recording once to ensure it\'s clear.',
  },
]

const TIPS_AUDIO = [
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
    title: 'Any format works',
    desc: 'MP3, M4A, AAC, WAV, FLAC, OGG, Opus, WebM, AIFF. Upload whatever your app exported.',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
    title: 'Add a title & author',
    desc: 'Give it a name so the family knows whose voice this is.',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>,
    title: 'Share instantly',
    desc: 'Once saved, share via WhatsApp with one tap.',
  },
]

const FORMATS = [
  { ext: 'MP3', note: 'Most common, works everywhere' },
  { ext: 'M4A', note: 'iPhone voice memos default' },
  { ext: 'AAC', note: 'Apple / iTunes exports' },
  { ext: 'WAV', note: 'Uncompressed, highest quality' },
  { ext: 'FLAC', note: 'Lossless compressed' },
  { ext: 'OGG / OGA', note: 'Open format' },
  { ext: 'Opus', note: 'WhatsApp voice notes' },
  { ext: 'WebM', note: 'Browser recordings' },
  { ext: 'AIFF', note: 'Mac / GarageBand' },
  { ext: 'MP4', note: 'Video with audio track' },
]

const TYPE_OPTIONS = [
  {
    value: 'song' as const,
    label: 'Song',
    desc: 'A melody or lullaby',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  },
  {
    value: 'story' as const,
    label: 'Story',
    desc: 'A tale from their life',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  },
  {
    value: 'fable' as const,
    label: 'Fable',
    desc: 'A lesson handed down',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  },
  {
    value: 'wisdom' as const,
    label: 'Wisdom',
    desc: 'Words to live by',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/><path d="M12 7v5l3 3"/></svg>,
  },
  {
    value: 'poem' as const,
    label: 'Poem',
    desc: 'A verse in their voice',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  },
] as const


const TYPE_PILLS = [
  { value: 'song',    label: '🎵 Song' },
  { value: 'story',   label: '📖 Story' },
  { value: 'fable',   label: '✨ Fable' },
  { value: 'wisdom',  label: '🙏 Wisdom' },
  { value: 'poem',    label: '🖊️ Poem' },
  { value: 'other',   label: '• Other' },
] as const

function TypePills({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
      {TYPE_PILLS.map(t => {
        const sel = value === t.value
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 13,
              border: sel ? '1.5px solid var(--accent)' : '1px solid var(--border)',
              background: sel ? 'var(--accent-light)' : 'transparent',
              color: sel ? 'var(--accent)' : 'var(--muted)',
              fontWeight: sel ? 600 : 400,
              cursor: 'pointer', fontFamily: 'var(--sans)',
            }}
          >{t.label}</button>
        )
      })}
    </div>
  )
}

function performerLabel(memoryType: string, mode: string): string {
  if (mode === 'ai') return 'Who is narrating?'
  if (mode === 'text') {
    if (memoryType === 'wisdom') return 'Whose words?'
    if (memoryType === 'poem') return 'Who wrote this?'
    return 'Who is the author?'
  }
  if (memoryType === 'song') return 'Who is singing?'
  if (memoryType === 'story' || memoryType === 'fable') return 'Who is telling this?'
  if (memoryType === 'wisdom') return 'Whose words?'
  if (memoryType === 'poem') return 'Who recited this?'
  return 'Who is performing?'
}

function FormatsDropdown() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom: '1rem' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.8rem', padding: '0.25rem 0', margin: '0 auto' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
        Audio formats supported
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{ marginTop: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.75rem 1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem 1.5rem' }}>
          {FORMATS.map(f => (
            <div key={f.ext} style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--accent)', minWidth: 52 }}>{f.ext}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{f.note}</span>
            </div>
          ))}
          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', marginTop: '0.35rem', paddingTop: '0.35rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
            Max file size: 50 MB
          </div>
        </div>
      )}
    </div>
  )
}

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
        <span style={{ position: 'absolute', top: -14, left: -4, fontSize: '0.75rem', color: 'var(--muted)', opacity: 0.7 }}>♥</span>
        <span style={{ position: 'absolute', top: -10, right: -6, fontSize: '0.6rem', color: 'var(--amber)', opacity: 0.8 }}>✦</span>
        <svg width="100" height="68" viewBox="0 0 100 68" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Cassette body */}
          <rect x="2" y="8" width="96" height="54" rx="8" fill="#FDF5ED" stroke="#E8C9A8" strokeWidth="2"/>
          {/* Left reel */}
          <circle cx="32" cy="35" r="14" fill="var(--gold-light)" stroke="#E0C68A" strokeWidth="1.5"/>
          <circle cx="32" cy="35" r="6" fill="white" stroke="#E8C9A8" strokeWidth="1.5"/>
          {/* Right reel */}
          <circle cx="68" cy="35" r="14" fill="var(--gold-light)" stroke="#E0C68A" strokeWidth="1.5"/>
          <circle cx="68" cy="35" r="6" fill="white" stroke="#E8C9A8" strokeWidth="1.5"/>
          {/* Tape window */}
          <rect x="38" y="28" width="24" height="14" rx="3" fill="#F0DFD0" stroke="#E8C9A8" strokeWidth="1"/>
          {/* Label strip */}
          <rect x="18" y="10" width="64" height="10" rx="3" fill="var(--gold-light)" stroke="#E0C68A" strokeWidth="1"/>
          {/* Record button dot */}
          <circle cx="50" cy="56" r="4" fill="var(--accent)" opacity="0.7"/>
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

function friendlyError(e: string): string {
  if (e.includes('memory_cap_reached')) return e // handled separately
  if (e.includes('UNAVAILABLE') || e.includes('high demand') || e.includes('503')) return 'AI transcription is temporarily at capacity — please try again in a moment.'
  if (e.includes('unsupported_language') || e.includes('not supported')) return 'There was a problem processing this audio. Please try again.'
  if (e.includes('NoneType') || e.includes('empty transcription')) return 'We couldn\'t read this recording. Please try a different file or format.'
  if (e.includes('File too large') || e.includes('413')) return e // already user-friendly
  if (e.includes('400') || e.includes('Error code')) return 'Something went wrong processing this file. Please try again or use a different format.'
  return 'Something went wrong. Please try again.'
}

export default function UploadPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<'ai' | 'direct' | 'text'>(() => {
    return 'ai'
  })

  useEffect(() => {
    const m = searchParams.get('mode')
    if (m === 'text') setMode('text')
    else if (m === 'direct') setMode('direct')
  }, [searchParams])
  const [memoryType, setMemoryType] = useState<string>('song')
  const language = 'te'
  const [narrator, setNarrator] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [draft, setDraft] = useState<any>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [directReview, setDirectReview] = useState<{ token: string; transcriptRaw: string; transcriptEnglish: string } | null>(null)
  const [textContent, setTextContent] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  function handlePhotoSelected(file: File) {
    setPhotoFile(file)
    const url = URL.createObjectURL(file)
    setPhotoPreview(url)
    setMode('text')
    setError('')
  }

  // AI pipeline mode
  async function handleFileAI(file: File) {
    setProcessing(true)
    setError('')
    const form = new FormData()
    form.append('audio', file)
    form.append('language', language)
    if (narrator) form.append('narrator', narrator)
    try {
      const result = await api.capture.process(form)
      setAudioFile(file)
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
    form.append('memory_type', memoryType)
    form.append('language', language)
    if (narrator) form.append('narrator', narrator)
    if (description.trim()) form.append('description', description.trim())
    try {
      const result = await api.audio.save(form) as { token: string; transcript_raw?: string; transcript_english?: string }
      setDirectReview({
        token: result.token,
        transcriptRaw: result.transcript_raw ?? '',
        transcriptEnglish: result.transcript_english ?? '',
      })
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setProcessing(false)
    }
  }

  // Text / photo save mode
  async function handleTextSave() {
    if (!title.trim()) { setError('Please enter a title first.'); return }
    if (!textContent.trim() && !photoFile) { setError('Please add some text or a photo first.'); return }
    setProcessing(true)
    setError('')
    try {
      const result = await api.text.save({
        title: title.trim(),
        text: textContent.trim() || `[Photo memory: ${title.trim()}]`,
        memory_type: memoryType,
        narrator: narrator || undefined,
      }) as { token: string; transcript_raw?: string; transcript_english?: string }
      // Upload photo if one was selected
      if (photoFile && result.token) {
        await api.memories.uploadPhoto(result.token, photoFile).catch(() => {})
      }
      setDirectReview({
        token: result.token,
        transcriptRaw: result.transcript_raw ?? '',
        transcriptEnglish: result.transcript_english ?? '',
      })
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

  if (directReview) {
    return (
      <SingleScreenReview
        token={directReview.token}
        initialTitle={title}
        transcriptRaw={directReview.transcriptRaw}
        transcriptEnglish={directReview.transcriptEnglish}
        memoryType={memoryType}
        onReRecord={() => setDirectReview(null)}
      />
    )
  }

  if (draft && audioFile) return <ReviewWizard draft={draft} audioFile={audioFile} narrator={narrator} onCancel={() => { setDraft(null); setAudioFile(null) }} />

  return (
    <div style={{ padding: '1.5rem 1.75rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <style>{`
        .rk-upload-cols {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.5rem;
        }
        .rk-upload-cols > * { min-width: 0; }
        @media (min-width: 760px) {
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
              {mode === 'direct' ? 'Preserve a song or poem forever' : mode === 'text' ? 'Save this moment, forever' : "Bring grandma's voice back to life"}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: 440, margin: '0 auto' }}>
              {mode === 'direct'
                ? <>Upload the audio and we&apos;ll keep it safe,<br />just as it was recorded.</>
                : mode === 'text'
                ? <>A poem, proverb, blessing, or story. Typed, pasted, or photographed.<br />We&apos;ll translate it and keep it forever.</>
                : <>Upload a recording and we&apos;ll turn it into<br />a recipe memory you can keep forever.</>}
            </p>
          </div>

          {/* Mode tabs — audio modes only */}
          {mode !== 'text' && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'var(--cream2)', borderRadius: 12, padding: '0.3rem' }}>
            {([
              { value: 'ai',     label: 'Their recipe' },
              { value: 'direct', label: 'Their voice' },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => { setMode(value); setError('') }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '0.6rem 0.5rem',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--sans)',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  background: mode === value ? 'var(--accent)' : 'transparent',
                  color: mode === value ? 'white' : 'var(--muted)',
                  boxShadow: mode === value ? '0 2px 8px rgba(45,27,14,0.15)' : 'none',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                }}
              >
                {value === 'ai' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M12 2c-1 2-1 3 0 4s1 2 0 4"/><path d="M8 2c-1 2-1 3 0 4s1 2 0 4"/><path d="M16 2c-1 2-1 3 0 4s1 2 0 4"/><path d="M4 14h16"/><path d="M4 14c0 4 3.6 7 8 7s8-3 8-7"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                  </svg>
                )}
                {label}
              </button>
            ))}
          </div>
          )}

          {mode === 'direct' && (
            <>
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
                  What kind of memory is this?
                </div>
                <TypePills value={memoryType} onChange={setMemoryType} />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  Title *
                </div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ammamma's lullaby"
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
                  placeholder="A blessing she sang every morning before the day began."
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

          {mode === 'text' && (
            <>
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
                  What kind of memory is this?
                </div>
                <TypePills value={memoryType} onChange={setMemoryType} />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  Title *
                </div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Amma's Ugadi blessing"
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
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
                  {performerLabel(memoryType, 'text')}
                </div>
                <NarratorCarousel selected={narrator} onSelect={setNarrator} />
              </div>

              {/* Photo preview — shown when a photo was selected */}
              {photoPreview && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                    Photo
                  </div>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img
                      src={photoPreview}
                      alt="Selected photo"
                      style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 10, border: '1px solid var(--border)', display: 'block', objectFit: 'contain' }}
                    />
                    <button
                      type="button"
                      onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', fontSize: '0.75rem' }}
                      aria-label="Remove photo"
                    >✕</button>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  {photoFile ? 'Notes (optional)' : 'Text *'}
                </div>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder={photoFile ? 'Add a note about this photo (optional)…' : 'చందమామ రావో జాబిల్లి రావో…'}
                  rows={photoFile ? 4 : 8}
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
                    lineHeight: 1.6,
                  }}
                />
              </div>

              {error && (error.includes('memory_cap_reached') ? (
                <div style={{ padding: '1rem 1.1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: '0.75rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>🔒</p>
                  <p style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', marginBottom: '0.3rem' }}>You've saved 10 memories</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.85rem', lineHeight: 1.5 }}>
                    Unlimited storage is coming soon. Email us and we'll let you know when it's ready.
                  </p>
                  <a href="mailto:pavanimbr@gmail.com?subject=Unlimited memories waitlist" style={{ display: 'inline-block', padding: '0.5rem 1.2rem', background: 'var(--accent)', color: 'white', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', marginBottom: '0.5rem' }}>
                    support@theechoesofhome.com
                  </a>
                  <br />
                  <Link href="/recipes" style={{ fontSize: '0.78rem', color: 'var(--muted)', textDecoration: 'underline' }}>Manage your memories</Link>
                </div>
              ) : (
                <p style={{ color: 'var(--accent)', marginBottom: '0.75rem', fontSize: '0.82rem' }}>{friendlyError(error)}</p>
              ))}

              <button
                type="button"
                disabled={processing}
                onClick={handleTextSave}
                style={{
                  width: '100%',
                  padding: '0.8rem 1.5rem',
                  borderRadius: 12,
                  border: 'none',
                  background: processing ? 'var(--muted)' : 'var(--accent)',
                  color: 'white',
                  fontFamily: 'var(--sans)',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: processing ? 'default' : 'pointer',
                  marginBottom: '1rem',
                }}
              >
                {processing ? '✨ Saving…' : photoFile ? '📷 Save this memory' : '✍️ Save this memory'}
              </button>
            </>
          )}

          {/* Narrator / Author picker — ai and direct modes only */}
          {mode !== 'text' && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
              {performerLabel(memoryType, mode)}
            </div>
            <NarratorCarousel selected={narrator} onSelect={setNarrator} />
          </div>
          )}


          {/* Drop zone + formats + privacy — audio modes only */}
          {mode !== 'text' && (
          <>
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
              accept="audio/*,.mp3,.mp4,.m4a,.wav,.webm,.ogg,.oga,.opus,.flac,.aac,.aiff"
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
                  {mode === 'direct' ? 'Your audio is being preserved, just a moment' : 'Transcribing, translating, and structuring, about 30–60 seconds'}
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
                  {mode === 'direct' ? '♪ Kept exactly as it is, a gift for the family' : '✦ Best results with clear voice recordings'}
                </p>
              </>
            )}
          </label>

          {error && (error.includes('memory_cap_reached') ? (
            <div style={{ padding: '1rem 1.1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: '0.75rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>🔒</p>
              <p style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', marginBottom: '0.3rem' }}>You've saved 10 memories</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.85rem', lineHeight: 1.5 }}>
                Unlimited storage is coming soon. Email us and we'll let you know when it's ready.
              </p>
              <a href="mailto:pavanimbr@gmail.com?subject=Unlimited memories waitlist" style={{ display: 'inline-block', padding: '0.5rem 1.2rem', background: 'var(--accent)', color: 'white', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', marginBottom: '0.5rem' }}>
                support@theechoesofhome.com
              </a>
              <br />
              <Link href="/recipes" style={{ fontSize: '0.78rem', color: 'var(--muted)', textDecoration: 'underline' }}>Manage your memories</Link>
            </div>
          ) : (
            <p style={{ color: 'var(--accent)', marginBottom: '0.75rem', fontSize: '0.82rem' }}>{friendlyError(error)}</p>
          ))}

          {/* Formats dropdown */}
          <FormatsDropdown />

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
          {/* "No recording?" — secondary paths */}
          <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'var(--cream2)', borderRadius: 14, border: '1px solid var(--border)' }}>
            <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '0.65rem' }}>
              No recording? Preserve it another way.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => { setMode('text'); setError(''); setTimeout(() => { const el = document.querySelector('textarea'); el?.focus() }, 100) }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.85rem', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--sans)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                Add in words
              </button>
              <button type="button" onClick={() => photoInputRef.current?.click()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.85rem', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--sans)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                Upload a photo
              </button>
            </div>
            {/* Hidden file input — triggers native camera/files picker on mobile */}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*,image/heic,image/heif"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoSelected(f) }}
            />
          </div>
          </>
          )}

          {/* Back to audio link when in text mode */}
          {mode === 'text' && (
            <button type="button" onClick={() => { setMode('ai'); setError('') }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.82rem', fontFamily: 'var(--sans)', marginBottom: '1.25rem', padding: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Back to audio upload
            </button>
          )}
        </div>

        {/* ── Tips sidebar ── */}
        <aside>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.35rem 1.25rem', boxShadow: '0 4px 16px rgba(45,27,14,0.05)' }}>
            <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)', marginBottom: '1.15rem' }}>
              {mode === 'text' ? 'Tips for text memories' : mode === 'direct' ? 'How it works' : 'Tips for the best results'}
            </h3>
            {(mode === 'direct' ? TIPS_AUDIO : TIPS_RECIPE).map((tip) => (
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
