// This file defines the Memory Detail page in the application.
// Purpose: Displays detailed information about a specific memory, including audio and transcripts.
// Why: Allows users to review and interact with individual memories in depth.
// How: Fetches memory details from the API and provides options for translation and editing.

'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import AudioPlayer from '@/components/AudioPlayer'
import LanguageSwitcher from '@/components/LanguageSwitcher'

type Ingredient = { item: string; quantity: string }
type Memory = {
  token: string
  dish_name: string | null
  narrator: string | null
  recorded_at: string
  image_url: string | null
  audio_url: string | null
  transcript_english: string | null
  cook_notes: string | null
  ingredients: Ingredient[]
  steps: string[]
  user_notes: string | null
}

function MemoryDetail() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') ?? ''
  const [memory, setMemory] = useState<Memory | null>(null)
  const [translated, setTranslated] = useState<Partial<Memory> | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!token) { router.replace('/memories'); return }
    api.recipes.get(token).then((m: Memory) => {
      setMemory(m)
      setNotes(m.user_notes ?? '')
      try {
        const favs: string[] = JSON.parse(localStorage.getItem('rk_favorites') ?? '[]')
        setFavorite(favs.includes(token))
      } catch {}
    }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, [token, router])

  function toggleFavorite() {
    try {
      const favs: string[] = JSON.parse(localStorage.getItem('rk_favorites') ?? '[]')
      const next = favorite ? favs.filter(t => t !== token) : [...favs, token]
      localStorage.setItem('rk_favorites', JSON.stringify(next))
      setFavorite(!favorite)
    } catch {}
  }

  async function saveNotes() {
    setSaving(true)
    try { await api.recipes.patch(token, { user_notes: notes }) }
    catch (e: unknown) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  async function deleteMemory() {
    if (!confirm(`Delete "${memory?.dish_name}"? This cannot be undone.`)) return
    setDeleting(true)
    try { await api.recipes.delete(token); router.replace('/memories') }
    catch (e: unknown) { setError((e as Error).message); setDeleting(false) }
  }

  const display = translated ?? memory

  if (loading) return <div style={{ padding: '2rem', color: 'var(--muted)' }}>Loading…</div>
  if (error) return <div style={{ padding: '2rem', color: 'var(--accent)' }}>{error}</div>
  if (!memory || !display) return null

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.8rem', color: 'var(--text)' }}>{(display as Memory).dish_name ?? 'Untitled'}</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.25rem' }}>
            {memory.narrator} · {new Date(memory.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
          <button onClick={toggleFavorite} title={favorite ? 'Remove from favourites' : 'Add to favourites'} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem 0.7rem', cursor: 'pointer', fontSize: '1rem' }}>
            {favorite ? '★' : '☆'}
          </button>
          <button onClick={deleteMemory} disabled={deleting} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem 0.7rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--accent)' }}>
            {deleting ? '…' : '🗑'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <LanguageSwitcher token={token} onTranslated={setTranslated} />
      </div>

      {memory.image_url && (
        <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: '1.25rem', aspectRatio: '16/9', background: 'var(--cream2)' }}>
          <img src={memory.image_url} alt={(display as Memory).dish_name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}

      {(display as Memory).cook_notes && (
        <div style={{ background: 'var(--accent-light)', border: '1px solid var(--border2)', borderLeft: '3px solid var(--accent)', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1.25rem', fontStyle: 'italic', color: 'var(--text2)', fontSize: '0.88rem', lineHeight: 1.6 }}>
          {(display as Memory).cook_notes}
        </div>
      )}

      {((display as Memory).ingredients?.length ?? 0) > 0 && (
        <section style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.6rem' }}>Ingredients</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(display as Memory).ingredients.map((ing, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text)' }}>{ing.item}</span>
                <span style={{ color: 'var(--muted)' }}>{ing.quantity}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {((display as Memory).steps?.length ?? 0) > 0 && (
        <section style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.6rem' }}>Method</h2>
          <ol style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 0, listStyle: 'none' }}>
            {(display as Memory).steps.map((step, i) => (
              <li key={i} style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start', fontSize: '0.88rem', color: 'var(--text2)', lineHeight: 1.6 }}>
                <span style={{ background: 'var(--accent)', color: 'white', borderRadius: '50%', width: 20, height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, marginTop: 2 }}>{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </section>
      )}

      {memory.audio_url && (
        <section style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.6rem' }}>Original Recording</h2>
          <AudioPlayer src={memory.audio_url} />
        </section>
      )}

      {memory.transcript_english && (
        <details style={{ marginBottom: '1.25rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>Full transcript</summary>
          <p style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem', fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.7, marginTop: '0.5rem' }}>
            {memory.transcript_english}
          </p>
        </details>
      )}

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.6rem' }}>Your Notes</h2>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add your personal notes…" rows={3} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '0.7rem', fontSize: '0.85rem', fontFamily: 'var(--sans)', color: 'var(--text)', background: 'var(--surface)', resize: 'vertical' }} />
        <button onClick={saveNotes} disabled={saving} style={{ marginTop: '0.5rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 9, padding: '0.5rem 1.25rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save notes'}
        </button>
      </section>
    </div>
  )
}

export default function MemoryPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--muted)' }}>Loading…</div>}>
      <MemoryDetail />
    </Suspense>
  )
}
