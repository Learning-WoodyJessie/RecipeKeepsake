// Read-only single-memory view for the viewer role. Reuses GET /recipe/{token}
// (already unrestricted to any authenticated user via the share-token model)
// but renders no edit/delete/translate controls.

'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import { api } from '@/lib/api'

type Ingredient = { item: string; quantity: string }

type Memory = {
  token: string
  title: string | null
  narrator: string | null
  image_url: string | null
  audio_url: string | null
  transcript_raw: string | null
  transcript_english: string | null
  cook_notes: string | null
  ingredients: Ingredient[]
  steps: string[]
}

function SharedDetail() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [memory, setMemory] = useState<Memory | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setError('Missing token'); return }
    api.recipes.get(token).then(setMemory).catch((e: Error) => setError(e.message))
  }, [token])

  if (error) return <div style={{ padding: '2rem', color: 'var(--accent)' }}>{error}</div>
  if (!memory) return <div style={{ padding: '2rem', color: 'var(--muted)' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', padding: '1.5rem' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <Link href="/shared" style={{ color: 'var(--accent)', fontSize: '0.85rem', textDecoration: 'none', display: 'inline-block', marginBottom: '1rem' }}>← Back</Link>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.4rem' }}>{memory.title ?? 'Untitled'}</h1>
          {memory.narrator && <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem' }}>By {memory.narrator}</p>}

          {memory.image_url && (
            <img src={memory.image_url} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: '1rem', boxShadow: '0 0 28px rgba(24,107,94,0.18)' }} />
          )}

          {memory.audio_url && (
            <audio controls src={memory.audio_url} style={{ width: '100%', marginBottom: '1rem' }} />
          )}

          {memory.ingredients?.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>Ingredients</h2>
              <ul style={{ fontSize: '0.88rem', color: 'var(--text2)', lineHeight: 1.6 }}>
                {memory.ingredients.map((ing, i) => <li key={i}>{ing.item}: {ing.quantity}</li>)}
              </ul>
            </div>
          )}

          {memory.steps?.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>Steps</h2>
              <ol style={{ fontSize: '0.88rem', color: 'var(--text2)', lineHeight: 1.6 }}>
                {memory.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          )}

          {(memory.transcript_raw || memory.transcript_english) && (
            <div>
              <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>Notes</h2>
              {memory.transcript_raw && <p style={{ background: 'var(--cream2)', borderRadius: 10, padding: '0.85rem', fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.7, marginBottom: '0.5rem' }}>{memory.transcript_raw}</p>}
              {memory.transcript_english && <p style={{ fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.7 }}>{memory.transcript_english}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SharedDetailPage() {
  return (
    <AuthGuard>
      <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--muted)' }}>Loading…</div>}>
        <SharedDetail />
      </Suspense>
    </AuthGuard>
  )
}
