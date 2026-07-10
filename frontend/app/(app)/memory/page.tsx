// Memory Detail page — two distinct experiences:
// Audio: hero banner + custom player + action row + about/tags columns + quote.
// Recipe: title header + AI-structured content + auto-saving personal notes.

'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import AudioPlayer from '@/components/AudioPlayer'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { readFavorites, toggleFavorite as toggleFav } from '@/lib/favorites'
import { buildMemoryShareMessage, toWhatsAppUrl } from '@/lib/share'

type Ingredient = { item: string; quantity: string }
type MemoryType = 'recipe' | 'song' | 'story' | 'fable' | 'wisdom' | 'poem'
type Memory = {
  token: string
  title: string | null
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
  type: MemoryType | null
  portal_visible: boolean
}

function isAudioMemory(m: Memory) {
  return (m.tags ?? []).includes('audio')
}

function isNonRecipe(m: Memory) {
  return m.type != null && m.type !== 'recipe'
}

const CATEGORIES = ['Breakfast', 'Lunch', 'Sweets', 'Pickles', 'Snacks', 'Drinks', 'Other'] as const

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

// WhatsApp SVG icon reused in multiple places
function WaIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
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
  const [heartPopping, setHeartPopping] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [category, setCategory] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null)

  // Auto-save state
  const [savedFlash, setSavedFlash] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // "Just preserved" toast — shown once on arrival from a fresh capture/save
  const [justSavedToast, setJustSavedToast] = useState(false)

  // Title editing
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')

  // Narrator editing
  const [editingNarrator, setEditingNarrator] = useState(false)
  const [narratorValue, setNarratorValue] = useState('')

  // Editable content
  const [about, setAbout] = useState('')
  const [notes, setNotes] = useState('')

  // Custom audio player state
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [inPortal, setInPortal] = useState(false)
  const [portalBusy, setPortalBusy] = useState(false)
  const [isInGroup, setIsInGroup] = useState(false)
  const [portalUrl, setPortalUrl] = useState('')

  // Signed URLs expire after 1 hour. If the audio element errors, re-fetch the
  // recipe to get a fresh signed URL. Guard prevents concurrent refresh calls.
  const audioRefreshingRef = useRef(false)
  async function refreshAudioUrl() {
    if (audioRefreshingRef.current) return
    audioRefreshingRef.current = true
    try {
      const fresh = await api.recipes.get(token) as Memory
      setMemory(m => m ? { ...m, audio_url: fresh.audio_url } : m)
    } catch {
      // Silent — user can reload the page if audio still fails
    }
  }

  useEffect(() => {
    if (!token) { router.replace('/memories'); return }
    api.recipes.get(token).then((m: Memory) => {
      setMemory(m)
      setTitleValue(m.title ?? '')
      setNarratorValue(m.narrator ?? '')
      setFavorite(readFavorites().includes(token))
      setCategory((m.tags ?? []).filter(t => t !== 'audio')[0] ?? '')
      setAbout(m.transcript_english ?? m.user_notes ?? '')
      setNotes(m.user_notes ?? '')
      setInPortal(m.portal_visible ?? false)
    }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, [token, router])

  useEffect(() => {
    api.family.getMyGroup().then((d: { portal_url?: string }) => {
      setIsInGroup(true)
      setPortalUrl(d?.portal_url ?? '')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (params.get('justSaved') !== '1') return
    setJustSavedToast(true)
    const t = setTimeout(() => setJustSavedToast(false), 2600)
    // Strip the param so a refresh/back-nav doesn't replay the toast
    router.replace(`/memory?token=${token}`, { scroll: false })
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function flash() {
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
  }

  async function togglePortal() {
    if (!memory || portalBusy) return
    setPortalBusy(true)
    const next = !inPortal
    try {
      await api.recipes.patch(memory.token, { portal_visible: next })
      setInPortal(next)
    } catch {
      // silent — state reverts on next page load
    } finally {
      setPortalBusy(false)
    }
  }

  async function patchField(patch: Record<string, unknown>) {
    try { await api.recipes.patch(token, patch); flash() }
    catch (e: unknown) { setError((e as Error).message) }
  }

  function scheduleAutoSave(patch: Record<string, unknown>) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => patchField(patch), 1200)
  }

  function handleTitleSave() {
    setEditingTitle(false)
    if (memory && titleValue !== memory.title) patchField({ title: titleValue })
  }

  function handleTitleCancel() {
    setEditingTitle(false)
    setTitleValue(memory?.title ?? '')
  }

  function toggleFavorite() {
    if (!token) return
    toggleFav(token)
    setFavorite(f => !f)
    setHeartPopping(true)
    setTimeout(() => setHeartPopping(false), 350)
  }

  async function changeCategory(newCategory: string) {
    const next = category === newCategory ? '' : newCategory
    setCategory(next)
    setSavingCategory(true)
    try { await api.recipes.patch(token, { tags: next ? [next] : [] }) }
    catch (e: unknown) { setError((e as Error).message) }
    finally { setSavingCategory(false) }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !token) return
    setLocalImageUrl(URL.createObjectURL(file))
    setPhotoUploading(true)
    setPhotoError('')
    try {
      const { image_url } = await api.memories.uploadPhoto(token, file)
      setLocalImageUrl(image_url)
    } catch (err: unknown) {
      setLocalImageUrl(null)
      setPhotoError((err as Error).message)
    } finally {
      setPhotoUploading(false)
    }
  }

  async function deleteMemory() {
    if (!confirm(`Delete "${memory?.title}"? This cannot be undone.`)) return
    setDeleting(true)
    try { await api.recipes.delete(token); router.replace('/memories') }
    catch (e: unknown) { setError((e as Error).message); setDeleting(false) }
  }

  // Audio player controls
  function togglePlay() {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { audioRef.current.play(); setPlaying(true) }
  }

  function formatTime(s: number) {
    if (!isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  function openWhatsApp() {
    const url = portalUrl || `${window.location.origin}/memory?token=${token}`
    const msg = buildMemoryShareMessage(memory?.type, memory?.title, memory?.narrator, url)
    window.open(toWhatsAppUrl(msg), '_blank')
  }

  const display = translated ?? memory

  if (loading) return <div style={{ padding: '2rem', color: 'var(--muted)' }}>Loading…</div>
  if (error) return <div style={{ padding: '2rem', color: 'var(--accent)' }}>{error}</div>
  if (!memory || !display) return null

  const audio = isAudioMemory(memory)

  const justSavedBanner = justSavedToast ? (
    <div
      className="rk-gold-pulse"
      style={{
        position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
        background: 'var(--gold-light)', border: '1px solid var(--amber)', borderRadius: 12,
        padding: '0.6rem 1.2rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', gap: '0.4rem',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'var(--amber)' }}>✨</span> Preserved forever
    </div>
  ) : null

  // ══════════════════════════════════════════════════════
  //  AUDIO MEMORY LAYOUT
  // ══════════════════════════════════════════════════════
  if (audio) {
    const displayTags = (memory.tags ?? []).filter(t => t !== 'audio')
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.25rem 1.5rem 3rem' }}>
        {justSavedBanner}

        {/* ── Hero banner ── */}
        <div style={{
          background: 'linear-gradient(135deg, var(--gold-light) 0%, #EFDFB8 60%, #EAD9AE 100%)',
          borderRadius: 20, overflow: 'hidden', marginBottom: '1.25rem',
          position: 'relative', minHeight: 220,
          display: 'flex', alignItems: 'stretch',
          border: '1px solid rgba(201,148,31,0.18)',
          boxShadow: '0 8px 32px rgba(45,27,14,0.09)',
        }}>
          {/* Left: text content */}
          <div style={{ flex: 1, padding: 'clamp(1.5rem,4vw,2.5rem)', display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 1 }}>
            {/* Decorative waveform */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: '1rem', opacity: 0.55 }}>
              {[3,5,8,6,10,7,4,9,6,11,5,8,4,7,9,5,6,8,4,6].map((h, i) => (
                <div key={i} style={{ width: 3, height: h * 3, borderRadius: 2, background: 'var(--accent)' }} />
              ))}
            </div>

            {/* Title — editable */}
            {editingTitle ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                <input
                  autoFocus
                  value={titleValue}
                  onChange={e => setTitleValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') handleTitleCancel() }}
                  style={{
                    fontFamily: 'var(--serif)', fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 700,
                    color: 'var(--text)', border: '1px solid var(--accent)', borderRadius: 8,
                    background: 'rgba(255,255,255,0.7)', outline: 'none',
                    flex: 1, padding: '0.25rem 0.6rem', minWidth: 0,
                  }}
                />
                <button onClick={handleTitleSave} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, padding: '0.35rem 0.85rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Save
                </button>
                <button onClick={handleTitleCancel} style={{ background: 'rgba(255,255,255,0.6)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.35rem 0.7rem', cursor: 'pointer', fontSize: '0.82rem', flexShrink: 0 }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.15 }}>
                  {titleValue || 'Untitled'}
                </h1>
                <button
                  onClick={() => setEditingTitle(true)}
                  aria-label="Edit title"
                  style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(201,148,31,0.3)', borderRadius: 7, padding: '4px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--muted)', flexShrink: 0 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              {editingNarrator ? (
                <input
                  autoFocus
                  value={narratorValue}
                  onChange={e => setNarratorValue(e.target.value)}
                  onBlur={() => {
                    setEditingNarrator(false)
                    if (narratorValue !== memory.narrator) {
                      patchField({ narrator: narratorValue })
                      setMemory(m => m ? { ...m, narrator: narratorValue } : m)
                    }
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
                  placeholder="Narrator name"
                  style={{ fontSize: '0.88rem', border: '1px solid var(--border)', borderRadius: 7, padding: '0.25rem 0.55rem', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--sans)', width: 160 }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingNarrator(true)}
                  title="Edit narrator"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <span style={{ fontSize: '0.88rem', color: 'var(--text2)' }}>
                    Narrated by <strong>{memory.narrator || 'Unknown'}</strong>
                  </span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)', opacity: 0.6 }}>
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              )}
              <span style={{ fontSize: '0.88rem', color: 'var(--text2)' }}>
                · {new Date(memory.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <SavedBadge show={savedFlash} />
            </div>
            <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '0.92rem', color: 'var(--text2)', marginBottom: '1rem', lineHeight: 1.5 }}>
              A song. A story. A moment that stays.
            </p>

            {/* Narrator pill */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(201,148,31,0.25)', borderRadius: 20, padding: '0.3rem 0.85rem', width: 'fit-content' }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>♡</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>From someone you love</span>
            </div>
          </div>

          {/* Right: illustration */}
          <div style={{ width: 'clamp(180px,30%,280px)', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
            <img
              src="/hero-memories.png"
              alt=""
              aria-hidden
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '60% center', opacity: 0.88 }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        </div>

        {/* ── Custom audio player ── */}
        {memory.audio_url && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 18, padding: '1.25rem 1.5rem', marginBottom: '1rem',
            boxShadow: '0 4px 16px rgba(45,27,14,0.06)',
          }}>
            {/* Hidden native audio element */}
            <audio
              ref={audioRef}
              src={memory.audio_url}
              onEnded={() => setPlaying(false)}
              onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
              onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
              onError={refreshAudioUrl}
            />

            {/* Player row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              {/* Big play button */}
              <button
                onClick={togglePlay}
                aria-label={playing ? 'Pause' : 'Play'}
                style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'var(--accent)', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, boxShadow: '0 4px 14px rgba(24,107,94,0.35)',
                  transition: 'transform 0.12s',
                }}
              >
                {playing
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden style={{ marginLeft: 3 }}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                }
              </button>

              {/* Waveform + scrubber */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Decorative waveform bars (clickable seek) */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: '0.5rem', cursor: 'pointer', height: 40 }}
                  onClick={e => {
                    if (!audioRef.current || !duration) return
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                    const pct = (e.clientX - rect.left) / rect.width
                    audioRef.current.currentTime = pct * duration
                  }}
                >
                  {[3,5,8,6,11,9,7,13,10,8,14,9,6,11,8,12,7,10,6,9,11,7,8,13,9,6,10,8,12,7,9,11,6,8,10,7,13,9,5,8].map((h, i) => {
                    const pct = duration ? currentTime / duration : 0
                    const barPct = i / 40
                    return (
                      <div key={i} style={{
                        flex: 1, height: h * 2.8, borderRadius: 2,
                        background: barPct <= pct ? 'var(--accent)' : 'rgba(24,107,94,0.2)',
                        transition: 'background 0.1s',
                      }} />
                    )
                  })}
                </div>

                {/* Time + seek bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {formatTime(currentTime)}
                  </span>
                  <input
                    type="range" min={0} max={duration || 100} step={0.1} value={currentTime}
                    onChange={e => { const t = Number(e.target.value); setCurrentTime(t); if (audioRef.current) audioRef.current.currentTime = t }}
                    style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer', height: 4 }}
                  />
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {formatTime(duration)}
                  </span>
                </div>
              </div>

              {/* Volume */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/>
                </svg>
                <input
                  type="range" min={0} max={1} step={0.05}
                  defaultValue={1}
                  onChange={e => { if (audioRef.current) audioRef.current.volume = Number(e.target.value) }}
                  style={{ width: 72, accentColor: 'var(--accent)', cursor: 'pointer', height: 4 }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Action row: Favorites | Share | Delete ── */}
        <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={toggleFavorite}
            style={{
              flex: '1 1 140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
              background: favorite ? 'var(--gold-light)' : 'var(--surface)',
              border: `1.5px solid ${favorite ? 'var(--amber)' : 'var(--border)'}`,
              borderRadius: 12, padding: '0.6rem 1rem', cursor: 'pointer',
              fontSize: '0.85rem', fontWeight: 600,
              color: favorite ? 'var(--amber)' : 'var(--text2)',
            }}
          >
            <span className={heartPopping ? 'rk-heart-pop' : undefined} style={{ fontSize: '1rem', display: 'inline-block' }}>{favorite ? '♥' : '♡'}</span>
            {favorite ? 'Saved to favorites' : 'Add to favorites'}
          </button>

          <button
            onClick={openWhatsApp}
            style={{
              flex: '1 1 120px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
              background: 'var(--surface)', border: '1.5px solid #25D366',
              borderRadius: 12, padding: '0.6rem 1rem', cursor: 'pointer',
              fontSize: '0.85rem', fontWeight: 600, color: '#25D366',
            }}
          >
            <WaIcon /> Share
          </button>

          <button
            onClick={deleteMemory}
            disabled={deleting}
            style={{
              flex: '1 1 100px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
              background: 'var(--surface)', border: '1.5px solid var(--border)',
              borderRadius: 12, padding: '0.6rem 1rem', cursor: 'pointer',
              fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>

        {/* ── Two-column: About | Tags ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.75rem' }}>
          {/* About */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.25rem' }}>
            <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)', marginBottom: '0.85rem' }}>
              About this recording
            </h2>
            <textarea
              value={about}
              onChange={e => {
                setAbout(e.target.value)
                scheduleAutoSave({ transcript_english: e.target.value, user_notes: e.target.value })
              }}
              onBlur={() => patchField({ transcript_english: about, user_notes: about })}
              placeholder="What is this: a song, a poem, a prayer? Why does it matter to your family?"
              rows={5}
              style={{
                width: '100%', border: '1px solid var(--border)', borderRadius: 10,
                padding: '0.7rem', fontSize: '0.88rem', fontFamily: 'var(--sans)',
                color: 'var(--text)', background: 'var(--cream)', resize: 'vertical',
                lineHeight: 1.65, boxSizing: 'border-box',
              }}
            />
            <p style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.4rem' }}>
              Saves automatically when you stop typing.
            </p>
          </div>

          {/* Tags */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.25rem' }}>
            <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)', marginBottom: '0.85rem' }}>
              Tags
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {['Story', 'Song', 'Memory', 'Family keepsake'].map(tag => (
                <span key={tag} style={{
                  padding: '0.35rem 0.9rem', borderRadius: 20,
                  background: 'var(--cream)', border: '1px solid var(--border)',
                  fontSize: '0.8rem', color: 'var(--text2)', fontWeight: 500,
                }}>
                  {tag}
                </span>
              ))}
              {displayTags.map(tag => (
                <span key={tag} style={{
                  padding: '0.35rem 0.9rem', borderRadius: 20,
                  background: 'var(--accent-light)', border: '1px solid rgba(24,107,94,0.2)',
                  fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600,
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Bottom quote ── */}
        <div style={{ textAlign: 'center', padding: '1rem 0 0.5rem' }}>
          <p style={{ fontFamily: 'var(--serif)', fontSize: '1rem', fontStyle: 'italic', color: 'var(--muted)', lineHeight: 1.6 }}>
            <span style={{ color: 'var(--accent)', fontSize: '1.4rem', lineHeight: 1, display: 'block', marginBottom: '0.25rem' }}>&ldquo;</span>
            Some memories are meant to be heard.
          </p>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════
  //  RECIPE MEMORY LAYOUT
  // ══════════════════════════════════════════════════════
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 2rem' }}>
      {justSavedBanner}

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem', gap: '1rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.8rem', color: 'var(--text)', margin: 0, flex: 1 }}>
              {titleValue || 'Untitled'}
            </h1>
            <button
              onClick={toggleFavorite}
              aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
              className={heartPopping ? 'rk-heart-pop' : undefined}
              style={{ background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, fontSize: '1.4rem', lineHeight: 1, padding: '4px', color: favorite ? 'var(--amber)' : 'var(--muted)' }}
            >
              {favorite ? '♥' : '♡'}
            </button>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.3rem' }}>
            {memory.narrator} · {new Date(memory.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            <SavedBadge show={savedFlash} />
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem', flexShrink: 0 }}>
          <button
            onClick={openWhatsApp}
            style={{ background: '#25D366', border: 'none', borderRadius: 8, padding: '0.4rem 0.85rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: 'white', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <WaIcon /> Share
          </button>
          <button onClick={deleteMemory} disabled={deleting} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '0.4rem 0.7rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--muted)' }}>
            {deleting ? '…' : '🗑'}
          </button>
        </div>
      </div>

      {/* Category pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', flexShrink: 0 }}>Category</span>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => changeCategory(cat)} disabled={savingCategory}
              style={{ padding: '0.25rem 0.7rem', borderRadius: 999, border: '1px solid', borderColor: category === cat ? 'var(--accent)' : 'var(--border)', background: category === cat ? 'var(--accent)' : 'transparent', color: category === cat ? 'white' : 'var(--muted)', fontSize: '0.75rem', fontWeight: 600, cursor: savingCategory ? 'default' : 'pointer', opacity: savingCategory ? 0.6 : 1, transition: 'all 0.15s' }}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <LanguageSwitcher token={token} onTranslated={setTranslated} />
      </div>

      {memory.type && memory.type !== 'recipe' && (
        <div style={{ marginBottom: '1rem' }}>
          <span style={{
            display: 'inline-block',
            padding: '3px 12px',
            borderRadius: 12,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            fontSize: 12,
            color: 'var(--muted)',
            textTransform: 'capitalize',
          }}>
            {memory.type}
          </span>
        </div>
      )}

      {isInGroup && (
        <div style={{ marginBottom: '1rem' }}>
          <button
            onClick={togglePortal}
            disabled={portalBusy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 14px', borderRadius: 20, fontSize: 13,
              border: '1px solid var(--border)',
              background: inPortal ? 'var(--accent)' : 'transparent',
              color: inPortal ? 'white' : 'var(--muted)',
              cursor: portalBusy ? 'default' : 'pointer',
              fontFamily: 'var(--sans)',
            }}
          >
            {inPortal ? '✓ In family portal' : '+ Add to family portal'}
          </button>
        </div>
      )}

      {/* Photo section */}
      <div style={{ marginBottom: '1.25rem' }}>
        <input id="detail-photo-input" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoChange} />
        {(localImageUrl ?? memory.image_url) ? (
          <div>
            <div style={{ borderRadius: 14, overflow: 'hidden', aspectRatio: '16/9', background: 'var(--cream2)', opacity: photoUploading ? 0.5 : 1, transition: 'opacity 0.2s', boxShadow: '0 0 28px rgba(24,107,94,0.18)' }}>
              <img src={localImageUrl ?? memory.image_url ?? ''} alt={(display as Memory).title ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <button
              type="button"
              onClick={() => (document.getElementById('detail-photo-input') as HTMLInputElement)?.click()}
              disabled={photoUploading}
              style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text2)' }}
            >
              {photoUploading ? 'Uploading…' : 'Change photo'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => (document.getElementById('detail-photo-input') as HTMLInputElement)?.click()}
            disabled={photoUploading}
            style={{ width: '100%', padding: '1.25rem', border: '1.5px dashed var(--border2)', borderRadius: 12, background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
          >
            <span>Add a photo</span>
            <span style={{ fontSize: '0.7rem' }}>JPEG, PNG or WebP · up to 5 MB</span>
          </button>
        )}
        {photoError && <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--accent)' }}>{photoError}</div>}
      </div>

      {(!memory.type || memory.type === 'recipe') && (
        <>
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
        </>
      )}

      {memory.audio_url && (
        <section style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.6rem' }}>Original Recording</h2>
          <AudioPlayer src={memory.audio_url} onExpired={refreshAudioUrl} />
        </section>
      )}

      {(memory.transcript_raw || memory.transcript_english) && (
        <details open={isNonRecipe(memory)} style={{ marginBottom: '1.25rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>{isNonRecipe(memory) ? 'Transcript' : 'Full transcript'}</summary>
          {memory.transcript_raw && (
            <>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginTop: '0.75rem', marginBottom: '0.35rem' }}>Original</p>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem', fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.85 }}>
                {memory.transcript_raw.split(/(?<=[.!?])\s+/).map((s, i) => (
                  <p key={i} style={{ margin: '0 0 0.35rem' }}>{s}</p>
                ))}
              </div>
            </>
          )}
          {memory.transcript_english && (
            <>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginTop: '0.75rem', marginBottom: '0.35rem' }}>English translation</p>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem', fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.85 }}>
                {memory.transcript_english.split(/(?<=[.!?])\s+/).map((s, i) => (
                  <p key={i} style={{ margin: '0 0 0.35rem' }}>{s}</p>
                ))}
              </div>
            </>
          )}
        </details>
      )}

      <section style={{ marginBottom: '1.5rem' }}>
        <div style={{ marginBottom: '0.6rem' }}>
          <h2 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', margin: 0 }}>Your Notes</h2>
        </div>
        <textarea
          value={notes}
          onChange={e => { setNotes(e.target.value); scheduleAutoSave({ user_notes: e.target.value }) }}
          onBlur={() => patchField({ user_notes: notes })}
          placeholder="Add your personal notes…"
          rows={3}
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '0.7rem', fontSize: '0.85rem', fontFamily: 'var(--sans)', color: 'var(--text)', background: 'var(--surface)', resize: 'vertical', boxSizing: 'border-box' }}
        />
        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.35rem' }}>Saves automatically when you stop typing.</p>
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
