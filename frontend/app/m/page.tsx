'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AudioPlayer from '@/components/AudioPlayer'
import { EchoesLogoMark } from '@/components/EchoesLogoMark'

// Public, no-sign-in view of a single memory someone shared via a
// /m?code={shortcode} link — backed by GET /public/memory/{shortcode}, which
// returns a safelisted field set only. The family collection stays behind
// sign-in (decisions.log 2026-09-22 [Public memory sharing]); this page is
// intentionally read-only with no edit, translate, reaction, or
// family-collection affordances.
//
// Static page reading `code` from the query string, not a [shortcode] path
// segment: this app ships as a Next static export (output: 'export'), which
// cannot serve true per-value dynamic routes — there's no server to render
// them. /memory's ?token= page follows the same pattern for the same reason.
// The pretty /m/{shortcode} link people actually see and share is produced
// by the backend (GET /m/{shortcode} in serve.py), which redirects real
// visitors here and serves bots an OG-tag preview, mirroring /memory/{shortcode}.
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

type PublicMemory = {
  token: string
  slug: string | null
  title: string | null
  narrator: string | null
  type: string | null
  recorded_at: string | null
  image_url: string | null
  audio_url: string | null
  transcript_raw: string | null
  transcript_english: string | null
  ingredients: { item: string; amount?: string }[] | null
  steps: string[] | null
}

const TYPE_LABEL: Record<string, string> = {
  recipe: 'Recipe', song: 'Song', story: 'Story', fable: 'Fable', wisdom: 'Wisdom', poem: 'Poem',
}

export default function PublicMemoryPage() {
  return <Suspense><PublicMemoryPageInner /></Suspense>
}

function PublicMemoryPageInner() {
  const code = useSearchParams().get('code') ?? ''
  const [memory, setMemory] = useState<PublicMemory | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)

  useEffect(() => {
    if (!code) { setNotFound(true); return }
    let cancelled = false
    fetch(`${API}/public/memory/${encodeURIComponent(code)}`)
      .then(res => { if (!res.ok) throw new Error(String(res.status)); return res.json() })
      .then((d: PublicMemory) => { if (!cancelled) setMemory(d) })
      .catch(() => { if (!cancelled) setNotFound(true) })
    return () => { cancelled = true }
  }, [code])

  if (notFound) {
    return (
      <Shell>
        <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>
          This memory link isn&apos;t available anymore.
        </p>
      </Shell>
    )
  }

  if (!memory) {
    return (
      <Shell>
        <div style={{ height: 14, width: '60%', background: 'var(--border)', borderRadius: 4, marginBottom: '0.75rem', opacity: 0.5 }} />
        <div style={{ height: 14, width: '40%', background: 'var(--border)', borderRadius: 4, opacity: 0.5 }} />
      </Shell>
    )
  }

  const hasRecipeContent = (memory.ingredients?.length ?? 0) > 0 || (memory.steps?.length ?? 0) > 0
  const transcript = memory.transcript_english || memory.transcript_raw
  const hasBothLanguages = !!memory.transcript_english && !!memory.transcript_raw && memory.transcript_english !== memory.transcript_raw

  return (
    <Shell>
      <title>{memory.title ? `${memory.title} — Echoes of Home` : 'A family memory — Echoes of Home'}</title>
      <meta name="robots" content="noindex, nofollow" />

      {memory.type && (
        <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', margin: '0 0 0.5rem' }}>
          {TYPE_LABEL[memory.type] ?? memory.type}
        </p>
      )}
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.4rem, 4vw, 1.9rem)', fontWeight: 700, color: 'var(--text)', margin: '0 0 0.35rem' }}>
        {memory.title || 'A family memory'}
      </h1>
      {memory.narrator && (
        <p style={{ fontSize: '0.9rem', color: 'var(--muted)', margin: '0 0 1.25rem' }}>Narrated by {memory.narrator}</p>
      )}

      {memory.image_url && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={memory.image_url}
          alt=""
          style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 16, marginBottom: '1.25rem' }}
        />
      )}

      {memory.audio_url && (
        <div style={{ marginBottom: '1.25rem' }}>
          <AudioPlayer src={memory.audio_url} />
        </div>
      )}

      {hasRecipeContent && (
        <div style={{ marginBottom: '1.25rem' }}>
          {memory.ingredients && memory.ingredients.length > 0 && (
            <>
              <h2 style={sectionHeading}>Ingredients</h2>
              <ul style={{ margin: '0 0 1rem', paddingLeft: '1.2rem', fontSize: '0.92rem', color: 'var(--text2)', lineHeight: 1.7 }}>
                {memory.ingredients.map((ing, i) => (
                  <li key={i}>{ing.amount ? `${ing.amount} ` : ''}{ing.item}</li>
                ))}
              </ul>
            </>
          )}
          {memory.steps && memory.steps.length > 0 && (
            <>
              <h2 style={sectionHeading}>Steps</h2>
              <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.92rem', color: 'var(--text2)', lineHeight: 1.7 }}>
                {memory.steps.map((step, i) => <li key={i} style={{ marginBottom: '0.4rem' }}>{step}</li>)}
              </ol>
            </>
          )}
        </div>
      )}

      {transcript && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={sectionHeading}>Story</h2>
          <p style={{ fontSize: '0.95rem', color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {showOriginal ? (memory.transcript_raw || transcript) : transcript}
          </p>
          {hasBothLanguages && (
            <button
              type="button"
              onClick={() => setShowOriginal(v => !v)}
              style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', padding: 0, marginTop: '0.35rem' }}
            >
              {showOriginal ? 'Show English' : 'Show original language'}
            </button>
          )}
        </div>
      )}

      <div style={{
        marginTop: '2rem', padding: '1.25rem', borderRadius: 14,
        background: 'var(--accent-light)', border: '1px solid rgba(24,107,94,0.2)', textAlign: 'center',
      }}>
        <p style={{ fontSize: '0.88rem', color: 'var(--text)', margin: '0 0 0.85rem', lineHeight: 1.5 }}>
          {memory.narrator ? `See ${memory.narrator}'s whole family collection` : "See this family's whole collection"} — recipes, songs, and stories, all in one place.
        </p>
        <Link
          href={`/?next=${encodeURIComponent(`/m?code=${code}`)}`}
          style={{
            display: 'inline-block', background: 'var(--accent)', color: 'white', textDecoration: 'none',
            padding: '0.65rem 1.5rem', borderRadius: 10, fontSize: '0.9rem', fontWeight: 700,
          }}
        >
          Sign in to see more
        </Link>
      </div>
    </Shell>
  )
}

const sectionHeading: React.CSSProperties = {
  fontFamily: 'var(--serif)', fontSize: '1rem', fontWeight: 700, color: 'var(--text)', margin: '0 0 0.5rem',
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--cream)', fontFamily: 'var(--sans)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(1.5rem, 5vw, 3rem) 1.25rem' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', marginBottom: '2rem' }}>
          <EchoesLogoMark size={28} />
          <span style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>Echoes of Home</span>
        </Link>
        {children}
      </div>
    </main>
  )
}
