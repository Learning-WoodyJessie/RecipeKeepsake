// Memory Detail page — two distinct experiences:
// Audio memories: inline-editable title + single About field, auto-save on blur.
// Recipe memories: AI-structured content + auto-saving personal notes.

'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import AudioPlayer from '@/components/AudioPlayer'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { readFavorites, toggleFavorite as toggleFav } from '@/lib/favorites'

type Ingredient = { item: string; quantity: string }
type Memory = {
  token: string
  dish_name: string | null
  narrator: string | null
  recorded_at: string
  image_url: string | null
  audio_url: string | null
  transcript_raw: string | null
  transcript_english: string | null
  cook_notes: string | null
  ingredients: Ingredient[]
  steps: string[]
  user_notes: string | null
  tags: string[] | null
}

function isAudioMemory(m: Memory) {
  return (m.tags ?? []).includes('audio')
}

const CATEGORIES = ['Breakfast', 'Lunch', 'Sweets', 'Pickles', 'Snacks', 'Drinks', 'Other'] as const

// Small "Saved ✓" indicator
function SavedBadge({ show }: { show: boolean }) {
  return (
    <span style={{
      fontSize: '0.72rem', fontWeight: 600, color: '#16a34a',
      opacity: show ? 1 : 0, transition: 'opacity 0.4s', marginLeft: '0.5rem',
    }}>
      Saved ✓
    </span>
  )
}

function MemoryDetail() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') ?? ''

  const [memory, setMemory] = useState<Memory | null>(null)
  const [translated, setTranslated] = useState<Partial<Memory> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [category, setCategory] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)

  // Auto-save state
  const [savedFlash, setSavedFlash] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Editable fields
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [about, setAbout] = useState('')   // audio: merged description field
  const [notes, setNotes] = useState('')   // recipe: personal notes

  useEffect(() => {
    if (!token) { router.replace('/memories'); return }
    api.recipes.get(token).then((m: Memory) => {
      setMemory(m)
      setTitleValue(m.dish_name ?? '')
      setFavorite(readFavorites().includes(token))
      setCategory((m.tags ?? []).filter(t => t !== 'audio')[0] ?? '')
      // For audio: About = transcript_english (the description), falls back to user_notes
      setAbout(m.transcript_english ?? m.user_notes ?? '')
      // For recipes: notes = user_notes
      setNotes(m.user_notes ?? '')
    }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, [token, router])

  function flash() {
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
  }

  async function patchField(patch: Record<string, unknown>) {
    try { await api.recipes.patch(token, patch); flash() }
    catch (e: unknown) { setError((e as Error).message) }
  }

  // Debounced auto-save for textarea fields
  function scheduleAutoSave(patch: Record<string, unknown>) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => patchField(patch), 1200)
  }

  function handleTitleBlur() {
    setEditingTitle(false)
    if (memory && titleValue !== memory.dish_name) {
      patchField({ dish_name: titleValue })
    }
  }

  function toggleFavorite() {
    if (!token) return
    toggleFav(token)
    setFavorite(f => !f)
  }

  async function changeCategory(newCategory: string) {
    const next = category === newCategory ? '' : newCategory
    setCategory(next)
    setSavingCategory(true)
    try { await api.recipes.patch(token, { tags: next ? [next] : [] }) }
    catch (e: unknown) { setError((e as Error).message) }
    finally { setSavingCategory(false) }
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

  const audio = isAudioMemory(memory)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 2rem' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem', gap: '1rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title row — heart toggle lives here, inline and unobtrusive */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {audio && editingTitle ? (
              <input
                autoFocus
                value={titleValue}
                onChange={e => setTitleValue(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={e => { if (e.key === 'Enter') handleTitleBlur() }}
                style={{
                  fontFamily: 'var(--serif)', fontSize: '1.8rem', fontWeight: 700,
                  color: 'var(--text)', border: 'none', borderBottom: '2px solid var(--accent)',
                  background: 'transparent', outline: 'none', flex: 1, padding: '0.1rem 0',
                }}
              />
            ) : (
              <h1
                onClick={() => audio && setEditingTitle(true)}
                style={{
                  fontFamily: 'var(--serif)', fontSize: '1.8rem', color: 'var(--text)',
                  cursor: audio ? 'text' : 'default',
                  display: 'inline-block', marginBottom: 0, flex: 1,
                }}
                title={audio ? 'Click to rename' : undefined}
              >
                {titleValue || 'Untitled'}
                {audio && <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginLeft: '0.4rem', fontFamily: 'var(--sans)', fontWeight: 400 }}>✎</span>}
              </h1>
            )}

            {/* Heart — small, next to title */}
            <button
              onClick={toggleFavorite}
              aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
                fontSize: '1.4rem', lineHeight: 1, padding: '4px',
                color: favorite ? 'var(--accent)' : 'var(--border2)',
                transition: 'color 0.15s',
              }}
            >
              {favorite ? '♥' : '♡'}
            </button>
          </div>

          <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.3rem' }}>
            {memory.narrator} · {new Date(memory.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            <SavedBadge show={savedFlash} />
          </p>
        </div>

        {/* Action buttons — Share + Delete only */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem', flexShrink: 0 }}>
          {/* WhatsApp share */}
          <button
            onClick={() => {
              const shareUrl = `${window.location.origin}/memory?token=${token}`
              const emoji = audio ? '🎵' : '🍽️'
              const waUrl = `https://wa.me/?text=${encodeURIComponent(`${emoji} "${memory?.dish_name ?? 'this memory'}" on Echoes of Home:\n${shareUrl}`)}`
              window.open(waUrl, '_blank')
            }}
            style={{ background: '#25D366', border: 'none', borderRadius: 8, padding: '0.4rem 0.85rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: 'white', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Share
          </button>

          {/* Delete */}
          <button onClick={deleteMemory} disabled={deleting} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem 0.7rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--muted)' }}>
            {deleting ? '…' : '🗑'}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          AUDIO MEMORY LAYOUT
      ══════════════════════════════════════════ */}
      {audio && (
        <>
          {/* Player */}
          {memory.audio_url && (
            <section style={{ marginBottom: '1.5rem' }}>
              <AudioPlayer src={memory.audio_url} />
            </section>
          )}

          {/* Single "About" field — merges description + notes */}
          <section style={{ marginBottom: '1.5rem' }}>
            <div style={{ marginBottom: '0.6rem' }}>
              <h2 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', margin: 0 }}>
                About this recording
              </h2>
            </div>
            <textarea
              value={about}
              onChange={e => {
                setAbout(e.target.value)
                scheduleAutoSave({ transcript_english: e.target.value, user_notes: e.target.value })
              }}
              onBlur={() => patchField({ transcript_english: about, user_notes: about })}
              placeholder="What is this — a song, a poem, a prayer? Why does it matter to your family?"
              rows={4}
              style={{
                width: '100%', border: '1px solid var(--border)', borderRadius: 10,
                padding: '0.75rem', fontSize: '0.88rem', fontFamily: 'var(--sans)',
                color: 'var(--text)', background: 'var(--surface)', resize: 'vertical',
                lineHeight: 1.6, boxSizing: 'border-box',
              }}
            />
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
              Saves automatically when you stop typing.
            </p>
          </section>
        </>
      )}

      {/* ══════════════════════════════════════════
          RECIPE MEMORY LAYOUT
      ══════════════════════════════════════════ */}
      {!audio && (
        <>
          {/* Category pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', flexShrink: 0 }}>Category</span>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => changeCategory(cat)}
                  disabled={savingCategory}
                  style={{
                    padding: '0.25rem 0.7rem', borderRadius: 999, border: '1px solid',
                    borderColor: category === cat ? 'var(--accent)' : 'var(--border)',
                    background: category === cat ? 'var(--accent)' : 'transparent',
                    color: category === cat ? 'white' : 'var(--muted)',
                    fontSize: '0.75rem', fontWeight: 600,
                    cursor: savingCategory ? 'default' : 'pointer',
                    opacity: savingCategory ? 0.6 : 1, transition: 'all 0.15s',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Language switcher */}
          <div style={{ marginBottom: '1.25rem' }}>
            <LanguageSwitcher token={token} onTranslated={setTranslated} />
          </div>

          {/* Food image */}
          {memory.image_url && (
            <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: '1.25rem', aspectRatio: '16/9', background: 'var(--cream2)' }}>
              <img src={memory.image_url} alt={(display as Memory).dish_name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}

          {/* Cook notes */}
          {(display as Memory).cook_notes && (
            <div style={{ background: 'var(--accent-light)', border: '1px solid var(--border2)', borderLeft: '3px solid var(--accent)', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1.25rem', fontStyle: 'italic', color: 'var(--text2)', fontSize: '0.88rem', lineHeight: 1.6 }}>
              {(display as Memory).cook_notes}
            </div>
          )}

          {/* Ingredients */}
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

          {/* Steps */}
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

          {/* Audio player (recipe with audio) */}
          {memory.audio_url && (
            <section style={{ marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.6rem' }}>Original Recording</h2>
              <AudioPlayer src={memory.audio_url} />
            </section>
          )}

          {/* Transcript */}
          {(memory.transcript_raw || memory.transcript_english) && (
            <details style={{ marginBottom: '1.25rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>Full transcript</summary>
              {memory.transcript_raw && (
                <>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginTop: '0.75rem', marginBottom: '0.35rem' }}>Original</p>
                  <p style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem', fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.7 }}>{memory.transcript_raw}</p>
                </>
              )}
              {memory.transcript_english && (
                <>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginTop: '0.75rem', marginBottom: '0.35rem' }}>English translation</p>
                  <p style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem', fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.7 }}>{memory.transcript_english}</p>
                </>
              )}
            </details>
          )}

          {/* Personal notes — auto-save on blur */}
          <section style={{ marginBottom: '1.5rem' }}>
            <div style={{ marginBottom: '0.6rem' }}>
              <h2 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', margin: 0 }}>Your Notes</h2>
            </div>
            <textarea
              value={notes}
              onChange={e => {
                setNotes(e.target.value)
                scheduleAutoSave({ user_notes: e.target.value })
              }}
              onBlur={() => patchField({ user_notes: notes })}
              placeholder="Add your personal notes…"
              rows={3}
              style={{
                width: '100%', border: '1px solid var(--border)', borderRadius: 10,
                padding: '0.7rem', fontSize: '0.85rem', fontFamily: 'var(--sans)',
                color: 'var(--text)', background: 'var(--surface)', resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
              Saves automatically when you stop typing.
            </p>
          </section>
        </>
      )}
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
