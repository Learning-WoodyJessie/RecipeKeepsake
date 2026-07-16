// Memory Detail page — two distinct experiences:
// Audio: hero banner + custom player + action row + about/tags columns + quote.
// Recipe: title header + AI-structured content + auto-saving personal notes.

'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import AudioPlayer from '@/components/AudioPlayer'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { readFavorites, toggleFavorite as toggleFav } from '@/lib/favorites'
import { buildMemoryShareMessage, toWhatsAppUrl } from '@/lib/share'
import { buildMemoryShortUrl } from '@/lib/url'

type Ingredient = { item: string; quantity: string }
type MemoryType = 'recipe' | 'song' | 'story' | 'fable' | 'wisdom' | 'poem'
type Memory = {
  token: string
  user_id: string
  slug: string | null
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
  const from = params.get('from') ?? ''
  const backHref = from === 'moments' ? '/moments' : from === 'home' ? '/home' : '/recipes'
  const backLabel = from === 'moments' ? 'Moments' : from === 'home' ? 'Home' : 'All Recipes'
  // Read token from window.location.search directly — useSearchParams() can lag
  // during client-side navigation, causing tokenReady to initialise false and
  // the slug-resolution effect to fire a spurious redirect to /recipes.
  const initialToken = (typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('token')
    : null) ?? params.get('token') ?? ''
  const [token, setToken] = useState(initialToken)
  // tokenReady: true when token is known (either from ?token= param or resolved from slug)
  const [tokenReady, setTokenReady] = useState(!!initialToken)

  const [memory, setMemory] = useState<Memory | null>(null)
  const [translated, setTranslated] = useState<Partial<Memory> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [heartPopping, setHeartPopping] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
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
  const [inviteUrl, setInviteUrl] = useState('')
  const [portalToast, setPortalToast] = useState<'added' | 'removed' | null>(null)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [createGroupError, setCreateGroupError] = useState('')

  // Non-owner viewing state — see docs/plans/2026-07-14-memory-sharing-redesign-design.md
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [sameGroupIds, setSameGroupIds] = useState<string[]>([])
  const [ownMemoryCount, setOwnMemoryCount] = useState<number | null>(null)

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

  // Resolve slug → token when the URL is /memory/some-slug (no ?token= param)
  useEffect(() => {
    if (tokenReady) return
    const segs = window.location.pathname.split('/').filter(Boolean)
    const slug = segs.length === 2 && segs[0] === 'memory' ? segs[1] : null
    if (!slug) { router.replace('/recipes'); return }
    api.recipes.getBySlug(slug)
      .then((m: Memory) => { setToken(m.token); setTokenReady(true) })
      .catch(() => router.replace('/recipes'))
  }, [tokenReady, router])

  useEffect(() => {
    if (!tokenReady || !token) return
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
  }, [token, tokenReady, router])

  useEffect(() => {
    api.family.getMyGroup().then((d: { portal_url?: string; invite_url?: string }) => {
      setIsInGroup(true)
      setPortalUrl(d?.portal_url ?? '')
      setInviteUrl(d?.invite_url ?? '')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null))
  }, [])

  useEffect(() => {
    api.family.members().then((d: { members: { user_id: string }[] }) => {
      setSameGroupIds((d.members ?? []).map(m => m.user_id))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    api.recipes.list().then((r: unknown[]) => setOwnMemoryCount(r.length)).catch(() => setOwnMemoryCount(0))
  }, [])

  useEffect(() => {
    if (params.get('justSaved') !== '1') return
    setJustSavedToast(true)
    const t = setTimeout(() => setJustSavedToast(false), 2600)
    // Strip justSaved but keep the from param so the back button still works
    router.replace(`/memory?token=${token}${from ? `&from=${from}` : ''}`, { scroll: false })
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function flash() {
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
  }

  const portalToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  async function togglePortal() {
    if (!memory || portalBusy) return
    setPortalBusy(true)
    const next = !inPortal
    setInPortal(next) // optimistic — show feedback immediately
    try {
      await api.recipes.patch(memory.token, { portal_visible: next })
      setPortalToast(next ? 'added' : 'removed')
      if (portalToastTimer.current) clearTimeout(portalToastTimer.current)
      portalToastTimer.current = setTimeout(() => setPortalToast(null), 5000)
    } catch {
      setInPortal(!next) // revert on failure
    } finally {
      setPortalBusy(false)
    }
  }

  async function copyInviteLink() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setInviteCopied(true)
    setTimeout(() => setInviteCopied(false), 2000)
  }

  // Create the family group inline (from the memory page) and immediately add
  // this memory to it — avoids sending a first-time owner away to Account
  // settings just to come back and toggle the memory in afterward.
  async function createGroupAndAdd() {
    if (!newGroupName.trim()) { setCreateGroupError('Enter a name for your family.'); return }
    setCreatingGroup(true)
    setCreateGroupError('')
    try {
      const d = await api.family.createGroup(newGroupName.trim()) as { portal_url: string; invite_url: string }
      setIsInGroup(true)
      setPortalUrl(d.portal_url)
      setInviteUrl(d.invite_url)
      setShowCreateGroupModal(false)
      setNewGroupName('')
      await togglePortal()
    } catch (e: unknown) {
      setCreateGroupError((e as Error).message)
    } finally {
      setCreatingGroup(false)
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
    setDeleting(true)
    setShowDeleteModal(false)
    try { await api.recipes.delete(token); router.replace(backHref) }
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
    const memoryUrl = buildMemoryShortUrl(window.location.origin, memory?.narrator, memory?.type, token)
    // Only substitute the viewer's own family portal when they own this memory —
    // otherwise a non-owner who happens to belong to their own unrelated family
    // group would forward a link to THEIR portal instead of this memory.
    const isOwnerForShare = !!currentUserId && memory?.user_id === currentUserId
    const url = (isOwnerForShare && portalUrl) || memoryUrl
    const msg = buildMemoryShareMessage(memory?.type, memory?.title, memory?.narrator, url)
    window.open(toWhatsAppUrl(msg), '_blank')
  }

  const display = translated ?? memory

  if (loading) return <div style={{ padding: '2rem', color: 'var(--muted)' }}>Loading…</div>
  if (error) return <div style={{ padding: '2rem', color: 'var(--accent)' }}>{error}</div>
  if (!memory || !display) return null

  // Ownership branch — until currentUserId resolves, default to the strictest
  // state (not owner) rather than briefly flashing owner-only controls.
  const isOwner = !!currentUserId && memory.user_id === currentUserId
  const isSameGroup = !isOwner && sameGroupIds.includes(memory.user_id)
  // Bare non-owner share links (no ?from=) have no real "back" destination —
  // the default would otherwise point at the viewer's own unrelated recipes.
  const showBackLink = isOwner || !!from
  // Onboarding nudge — only for a true first-timer with no family-group tie to this memory.
  const showOnboardingBanner = !isOwner && !isSameGroup && ownMemoryCount === 0

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

  const onboardingBanner = showOnboardingBanner ? (
    <div style={{
      background: 'var(--gold-light)', border: '1px solid var(--amber)', borderRadius: 14,
      padding: '1rem 1.25rem', marginTop: '0.5rem', marginBottom: '1.75rem',
      display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '1.1rem' }}>❤️</span>
      <span style={{ fontSize: '0.85rem', color: 'var(--text)', flex: 1, minWidth: 200 }}>
        Loved this? Start preserving your own family's memories.
      </span>
      <Link href="/" style={{
        fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent)', textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}>
        Get started →
      </Link>
    </div>
  ) : null

  // Caption explaining the Family Collection toggle before it's clicked.
  const familyCollectionCaption = (
    <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '0.4rem 0 0' }}>
      Visible to anyone who joins your family via invite link.
    </p>
  )

  // Confirmation + invite-link copy action shown right after toggling.
  const familyCollectionToast = portalToast ? (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
      background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 10,
      padding: '0.5rem 0.75rem', marginTop: '0.5rem', fontSize: '0.78rem',
    }}>
      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
        {portalToast === 'added' ? 'Added to Family Collection ✓' : 'Removed — no longer visible to your family.'}
      </span>
      {portalToast === 'added' && inviteUrl && (
        <button
          type="button"
          onClick={copyInviteLink}
          style={{
            background: 'none', border: '1px solid var(--accent)', borderRadius: 8,
            padding: '0.2rem 0.6rem', fontSize: '0.75rem', fontWeight: 600,
            color: 'var(--accent)', cursor: 'pointer',
          }}
        >
          {inviteCopied ? 'Copied!' : 'Copy invite link'}
        </button>
      )}
    </div>
  ) : null

  // Inline "create a family" prompt — lets an owner with no group yet create
  // one without leaving the memory page, then this memory is added right away.
  const createGroupModal = (
    <div
      onClick={() => !creatingGroup && setShowCreateGroupModal(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 12,
          maxWidth: 420, width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          padding: '1.5rem',
        }}
      >
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          Create your family collection
        </h2>
        <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6 }}>
          Give it a name — this memory will be added to it right away, and you'll get an invite link to share.
        </p>
        {createGroupError && <p style={{ color: 'var(--accent)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{createGroupError}</p>}
        <input
          autoFocus
          value={newGroupName}
          onChange={e => setNewGroupName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') createGroupAndAdd() }}
          placeholder="e.g. Lakshmi Family"
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 0.85rem', fontSize: '0.9rem', fontFamily: 'var(--sans)', background: 'var(--cream)', color: 'var(--text)', boxSizing: 'border-box', marginBottom: '1rem' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => setShowCreateGroupModal(false)}
            disabled={creatingGroup}
            style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.55rem 1rem', cursor: creatingGroup ? 'default' : 'pointer', fontSize: '0.85rem' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={createGroupAndAdd}
            disabled={creatingGroup}
            style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, padding: '0.55rem 1.25rem', fontWeight: 600, cursor: creatingGroup ? 'default' : 'pointer', fontSize: '0.85rem' }}
          >
            {creatingGroup ? 'Creating…' : 'Create & add →'}
          </button>
        </div>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════
  //  AUDIO MEMORY LAYOUT
  // ══════════════════════════════════════════════════════
  if (audio) {
    const displayTags = (memory.tags ?? []).filter(t => t !== 'audio' && t !== 'tale')
    const typeLabel: Record<string, string> = { song: 'Song', story: 'Story', fable: 'Fable', wisdom: 'Words of wisdom', poem: 'Poem' }
    const typeBg: Record<string, string> = { song: 'rgba(139,92,246,0.1)', story: 'rgba(245,158,11,0.1)', fable: 'rgba(236,72,153,0.1)', wisdom: 'rgba(59,130,246,0.1)', poem: 'rgba(16,185,129,0.1)' }
    const typeFg: Record<string, string> = { song: '#7C3AED', story: '#B45309', fable: '#BE185D', wisdom: '#1D4ED8', poem: '#065F46' }
    const memType = memory.type ?? 'song'
    const transcript = memory.transcript_english || memory.transcript_raw

    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.25rem 1.5rem 3rem' }}>
        {justSavedBanner}

        {/* ── Back nav (hidden for bare non-owner share links) ── */}
        {showBackLink && (
          <Link href={backHref} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text2)', textDecoration: 'none', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 500 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="15 18 9 12 15 6"/></svg>
            {backLabel}
          </Link>
        )}

        {/* ── Hero banner ── */}
        <div style={{
          background: 'linear-gradient(135deg, var(--gold-light) 0%, #EFDFB8 60%, #EAD9AE 100%)',
          borderRadius: 20, overflow: 'hidden', marginBottom: '1.25rem',
          position: 'relative',
          border: '1px solid rgba(201,148,31,0.18)',
          boxShadow: '0 8px 32px rgba(45,27,14,0.09)',
          padding: 'clamp(1.5rem,4vw,2.25rem)',
        }}>
          {/* Waveform watermark */}
          <svg aria-hidden style={{ position: 'absolute', right: -8, bottom: -6, opacity: 0.07, pointerEvents: 'none' }} width="160" height="90" viewBox="0 0 160 90" fill="none">
            {[3,5,8,6,11,9,7,13,10,8,14,9,6,11,8,12,7,10,6,9,11,7,8,13,9,6,10,8,12,7,9,11,6,8,10,7,13,9,5,8].map((h, i) => (
              <rect key={i} x={i * 4} y={(45 - h * 2.5)} width="3" height={h * 5} rx="1.5" fill="var(--amber)" />
            ))}
          </svg>

          {/* Type badge */}
          {memory.type && memory.type !== 'recipe' && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              background: typeBg[memType] ?? 'rgba(255,255,255,0.45)',
              border: `1px solid ${typeFg[memType] ?? 'var(--border)'}33`,
              borderRadius: 20, padding: '0.25rem 0.75rem',
              marginBottom: '0.85rem',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: typeFg[memType] ?? 'var(--text2)' }}>
                {memType === 'song' && <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>}
                {memType === 'story' && <><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></>}
                {memType === 'poem' && <><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></>}
                {memType === 'fable' && <><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></>}
                {memType === 'wisdom' && <><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></>}
              </svg>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: typeFg[memType] ?? 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {typeLabel[memType] ?? memType}
              </span>
            </div>
          )}

          {/* Title — editable (owner only) */}
          {isOwner && editingTitle ? (
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
              {isOwner && (
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
              )}
            </div>
          )}

          {/* Narrator + date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {!isOwner ? (
              <span style={{ fontSize: '0.88rem', color: 'var(--text2)' }}>
                Narrated by <strong>{memory.narrator || 'Unknown'}</strong>
              </span>
            ) : editingNarrator ? (
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

              {/* Volume — desktop only; iOS ignores software volume */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }} className="rk-desktop-only">
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

        {/* ── Primary actions: Share + Family Collection (owner only) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isOwner ? '1fr 1fr' : '1fr', gap: '0.65rem', marginBottom: '0.65rem' }}>
          <button
            onClick={openWhatsApp}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              background: '#25D366', border: 'none',
              borderRadius: 12, padding: '0.72rem 0.5rem', cursor: 'pointer',
              fontSize: '0.88rem', fontWeight: 700, color: 'white',
              boxShadow: '0 3px 10px rgba(37,211,102,0.25)',
            }}
          >
            <WaIcon /> Share
          </button>
          {isOwner && isInGroup && (
            <button
              onClick={togglePortal}
              disabled={portalBusy}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                background: inPortal ? 'var(--accent-light)' : 'var(--surface)',
                border: `1.5px solid ${inPortal ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 12, padding: '0.72rem 0.5rem', cursor: portalBusy ? 'default' : 'pointer',
                fontSize: '0.82rem', fontWeight: 600,
                color: inPortal ? 'var(--accent)' : 'var(--text2)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
              {inPortal ? 'In Family Collection' : 'Family Collection'}
            </button>
          )}
          {isOwner && !isInGroup && (
            <button
              type="button"
              onClick={() => setShowCreateGroupModal(true)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                background: 'var(--surface)', border: '1.5px solid var(--border)',
                borderRadius: 12, padding: '0.72rem 0.5rem', cursor: 'pointer',
                fontSize: '0.82rem', fontWeight: 600, color: 'var(--text2)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
              Family Collection
            </button>
          )}
        </div>
        {isOwner && isInGroup && familyCollectionCaption}
        {isOwner && isInGroup && familyCollectionToast}

        {/* ── Secondary actions: Favorites (owner only) + Delete (owner only) ── */}
        {isOwner && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
          <button
            onClick={toggleFavorite}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              background: favorite ? 'var(--gold-light)' : 'transparent',
              border: `1.5px solid ${favorite ? 'var(--amber)' : 'var(--border)'}`,
              borderRadius: 10, padding: '0.45rem 1rem', cursor: 'pointer',
              fontSize: '0.82rem', fontWeight: 600,
              color: favorite ? 'var(--amber)' : 'var(--text2)',
            }}
          >
            <span className={heartPopping ? 'rk-heart-pop' : undefined} style={{ fontSize: '0.95rem', display: 'inline-block' }}>{favorite ? '♥' : '♡'}</span>
            {favorite ? 'Saved' : 'Add to favorites'}
          </button>

          <button
            onClick={() => setShowDeleteModal(true)}
            disabled={deleting}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              background: 'none', border: 'none', cursor: deleting ? 'default' : 'pointer',
              fontSize: '0.8rem', color: 'var(--muted)', opacity: deleting ? 0.4 : 0.65,
              padding: '0.45rem 0.5rem', fontFamily: 'var(--sans)',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
        )}

        {/* ── Transcript block (read-only) ── */}
        <section style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.65rem' }}>Transcript</h2>
          {transcript ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem' }}>
              <p style={{ fontSize: '0.88rem', color: 'var(--text2)', lineHeight: 1.85, fontFamily: 'var(--serif)', fontStyle: 'italic', margin: 0, whiteSpace: 'pre-wrap' }}>
                {transcript}
              </p>
            </div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', textAlign: 'center' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>No transcript yet</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0, opacity: 0.8 }}>Captured recordings generate one automatically</p>
            </div>
          )}
        </section>

        {/* ── Notes (owner only — no per-viewer notes storage exists) ── */}
        {isOwner && (
        <section style={{ marginBottom: '1.75rem' }}>
          <h2 style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.65rem' }}>Your notes</h2>
          <textarea
            value={notes}
            onChange={e => {
              setNotes(e.target.value)
              scheduleAutoSave({ user_notes: e.target.value })
            }}
            onBlur={() => patchField({ user_notes: notes })}
            placeholder={
              memType === 'song' ? 'What does this song remind you of? A place, a person, a moment…'
              : memType === 'story' ? 'What did this story mean to you? What will you pass on?'
              : memType === 'poem' ? 'What feelings does this poem bring up for you?'
              : memType === 'wisdom' ? 'How has this wisdom shaped you?'
              : `A memory about this ${typeLabel[memType]?.toLowerCase() ?? 'recording'}…`
            }
            rows={4}
            style={{
              width: '100%', border: '1px solid var(--border)', borderRadius: 10,
              padding: '0.7rem', fontSize: '0.85rem', fontFamily: 'var(--sans)',
              color: 'var(--text)', background: 'var(--gold-light)', resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
            Saves automatically when you stop typing.
          </p>
        </section>
        )}

        {/* ── Tags ── */}
        {displayTags.length > 0 && (
          <div style={{ marginBottom: '1.75rem' }}>
            <p style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Tags</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {displayTags.map(tag => (
                <span key={tag} style={{
                  padding: '0.3rem 0.85rem', borderRadius: 20,
                  background: 'var(--accent-light)', border: '1px solid rgba(24,107,94,0.2)',
                  fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600,
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {onboardingBanner}

        {showCreateGroupModal && createGroupModal}

        {/* ── Delete confirmation modal (audio layout) ── */}
        {showDeleteModal && (
          <div
            onClick={() => setShowDeleteModal(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '1.5rem',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--surface)', borderRadius: 12,
                maxWidth: 520, width: '100%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>Delete Memory</h2>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--muted)', flexShrink: 0 }}
                  aria-label="Close"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div style={{ height: 1, background: 'var(--border)' }} />
              <div style={{ padding: '1.5rem' }}>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.6 }}>
                  Are you sure you want to delete <strong>{memory?.title}</strong>?
                </p>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                  This memory will be permanently removed from your archive.
                </p>
                <button
                  type="button"
                  onClick={deleteMemory}
                  style={{ marginTop: '1.5rem', padding: '0.65rem 1.25rem', borderRadius: 8, border: 'none', background: '#B91C1C', color: 'white', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'var(--sans)' }}
                >
                  Delete Memory
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════
  //  RECIPE MEMORY LAYOUT
  // ══════════════════════════════════════════════════════
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 2rem' }}>
      {justSavedBanner}

      {/* ── Back nav (hidden for bare non-owner share links) ── */}
      {showBackLink && (
        <Link href={backHref} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text2)', textDecoration: 'none', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 500 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="15 18 9 12 15 6"/></svg>
          {backLabel}
        </Link>
      )}

      {/* ── Identity block ── */}
      <div style={{ marginBottom: '1.25rem' }}>
        {/* Compact meta row: category pill · language switcher · type badge · saved */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.7rem', flexWrap: 'wrap' }}>
          {isOwner ? (
            <select
              value={category}
              onChange={e => changeCategory(e.target.value)}
              disabled={savingCategory}
              style={{
                border: '1px solid var(--border)', borderRadius: 20,
                padding: '0.28rem 1.6rem 0.28rem 0.85rem', fontSize: '0.78rem', fontWeight: 600,
                background: category ? 'var(--accent)' : 'var(--surface)',
                color: category ? 'white' : 'var(--muted)',
                cursor: savingCategory ? 'default' : 'pointer', opacity: savingCategory ? 0.6 : 1,
                fontFamily: 'var(--sans)', appearance: 'none', WebkitAppearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${category ? 'white' : '%23999'}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.55rem center',
              }}
            >
              <option value="">Uncategorised</option>
              {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          ) : category ? (
            <span style={{
              display: 'inline-block', padding: '3px 12px', borderRadius: 12,
              background: 'var(--accent)', color: 'white',
              fontSize: 12, fontWeight: 600,
            }}>
              {category}
            </span>
          ) : null}
          {memory.type && memory.type !== 'recipe' && (
            <span style={{
              display: 'inline-block', padding: '3px 12px', borderRadius: 12,
              background: 'var(--surface)', border: '1px solid var(--border)',
              fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize',
            }}>
              {memory.type}
            </span>
          )}
          <SavedBadge show={savedFlash} />
        </div>

        {/* Title + edit pencil + heart */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.35rem' }}>
          {isOwner && editingTitle ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, flexWrap: 'wrap' }}>
              <input
                autoFocus
                value={titleValue}
                onChange={e => setTitleValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') handleTitleCancel() }}
                style={{
                  fontFamily: 'var(--serif)', fontSize: '1.75rem', fontWeight: 700,
                  color: 'var(--text)', border: '1px solid var(--accent)', borderRadius: 8,
                  background: 'rgba(255,255,255,0.7)', outline: 'none',
                  flex: 1, padding: '0.2rem 0.5rem', minWidth: 0,
                }}
              />
              <button onClick={handleTitleSave} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, padding: '0.3rem 0.8rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Save
              </button>
              <button onClick={handleTitleCancel} style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.82rem' }}>Cancel</button>
            </div>
          ) : (
            <>
              <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.8rem', color: 'var(--text)', margin: 0, flex: 1, lineHeight: 1.2 }}>
                {titleValue || 'Untitled'}
              </h1>
              {isOwner && (
                <button
                  onClick={() => setEditingTitle(true)}
                  aria-label="Edit title"
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--muted)', flexShrink: 0, marginTop: 6 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              )}
            </>
          )}
          {isOwner && (
            <button
              onClick={toggleFavorite}
              aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
              className={heartPopping ? 'rk-heart-pop' : undefined}
              style={{ background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, fontSize: '1.4rem', lineHeight: 1, padding: '4px', color: favorite ? 'var(--amber)' : 'var(--muted)', marginTop: 4 }}
            >
              {favorite ? '♥' : '♡'}
            </button>
          )}
        </div>

        {/* Narrator + date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {!isOwner ? (
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              Narrated by <strong style={{ color: 'var(--text2)' }}>{memory.narrator || 'Unknown'}</strong>
            </span>
          ) : editingNarrator ? (
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
              style={{ fontSize: '0.82rem', border: '1px solid var(--border)', borderRadius: 7, padding: '0.2rem 0.5rem', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--sans)', width: 140 }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingNarrator(true)}
              title="Edit narrator"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                Narrated by <strong style={{ color: 'var(--text2)' }}>{memory.narrator || 'Unknown'}</strong>
              </span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)', opacity: 0.5 }} aria-hidden>
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
          <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            · {new Date(memory.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* ── Hero photo (upload/change is owner only) ── */}
      {(isOwner || memory.image_url) && (
      <div style={{ marginBottom: '1.25rem' }}>
        {isOwner && <input id="detail-photo-input" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoChange} />}
        {(localImageUrl ?? memory.image_url) ? (
          <div>
            <div style={{ borderRadius: 14, overflow: 'hidden', aspectRatio: '16/9', background: 'var(--cream2)', opacity: photoUploading ? 0.5 : 1, transition: 'opacity 0.2s', boxShadow: '0 0 28px rgba(24,107,94,0.18)' }}>
              <img src={localImageUrl ?? memory.image_url ?? ''} alt={(display as Memory).title ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            {isOwner && (
              <button
                type="button"
                onClick={() => (document.getElementById('detail-photo-input') as HTMLInputElement)?.click()}
                disabled={photoUploading}
                style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text2)' }}
              >
                {photoUploading ? 'Uploading…' : 'Change photo'}
              </button>
            )}
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
      )}

      {/* ── Recipe content: cook notes → ingredients → method ── */}
      {(!memory.type || memory.type === 'recipe') && (
        <>
          {(display as Memory).cook_notes && (
            <div style={{ background: 'var(--accent-light)', borderLeft: '3px solid var(--accent)', borderRadius: '0 10px 10px 0', padding: '0.85rem 1rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent)', marginBottom: '0.35rem' }}>
                {memory.narrator ? `${memory.narrator}'s notes` : `Cook's notes`}
              </p>
              <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--text2)', fontSize: '0.9rem', margin: 0 }}>
                {(display as Memory).cook_notes}
              </p>
            </div>
          )}

          {((display as Memory).ingredients?.length ?? 0) > 0 && (
            <section style={{ marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.65rem' }}>Ingredients</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(display as Memory).ingredients.map((ing, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.9rem', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text)', fontWeight: 500 }}>{ing.item}</span>
                    <span style={{ color: 'var(--muted)', fontSize: '0.84rem' }}>{ing.quantity}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {((display as Memory).steps?.length ?? 0) > 0 && (
            <section style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.65rem' }}>Method</h2>
              <ol style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 0, listStyle: 'none' }}>
                {(display as Memory).steps.map((step, i) => (
                  <li key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', fontSize: '0.88rem', color: 'var(--text2)', lineHeight: 1.65 }}>
                    <span style={{ background: 'var(--accent)', color: 'white', borderRadius: '50%', width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, marginTop: 2 }}>{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      {/* ── Actions strip: family collection (owner only) · share · delete (owner only) ── */}
      <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1.75rem' }}>
        {isOwner && isInGroup && (
          <button
            onClick={togglePortal}
            disabled={portalBusy}
            style={{
              flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
              padding: '0.6rem 0.75rem', borderRadius: 12, fontSize: '0.82rem', fontWeight: 600,
              border: `1.5px solid ${inPortal ? 'var(--accent)' : 'var(--border)'}`,
              background: inPortal ? 'var(--accent-light)' : 'var(--surface)',
              color: inPortal ? 'var(--accent)' : 'var(--text2)',
              cursor: portalBusy ? 'default' : 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
            {inPortal ? 'In Family Collection' : 'Add to Family Collection'}
          </button>
        )}
        {isOwner && !isInGroup && (
          <button
            type="button"
            onClick={() => setShowCreateGroupModal(true)}
            style={{
              flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
              padding: '0.6rem 0.75rem', borderRadius: 12, fontSize: '0.82rem', fontWeight: 600,
              border: '1.5px solid var(--border)', cursor: 'pointer',
              background: 'var(--surface)', color: 'var(--text2)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
            Family Collection
          </button>
        )}
        <button
          onClick={openWhatsApp}
          style={{
            flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            background: 'var(--surface)', border: '1.5px solid #25D366',
            borderRadius: 12, padding: '0.6rem 0.75rem', cursor: 'pointer',
            fontSize: '0.82rem', fontWeight: 600, color: '#25D366',
          }}
        >
          <WaIcon /> Share
        </button>
        {isOwner && (
          <button
            onClick={() => setShowDeleteModal(true)}
            disabled={deleting}
            style={{
              flex: '0 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
              background: 'var(--surface)', border: '1.5px solid var(--border)',
              borderRadius: 12, padding: '0.6rem 0.85rem', cursor: 'pointer',
              fontSize: '0.82rem', fontWeight: 600, color: 'var(--muted)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </div>
      {isOwner && isInGroup && familyCollectionCaption}
      {isOwner && isInGroup && familyCollectionToast}

      {/* ── Original recording ── */}
      {memory.audio_url && (
        <section style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.65rem' }}>Original recording</h2>
          <AudioPlayer src={memory.audio_url} onExpired={refreshAudioUrl} />
        </section>
      )}

      {/* ── Transcript ── */}
      {(memory.transcript_raw || memory.transcript_english) && (
        <details open={isNonRecipe(memory)} style={{ marginBottom: '1.25rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>{isNonRecipe(memory) ? 'Transcript' : 'Full transcript'}</summary>
          {memory.transcript_raw && (
            <>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginTop: '0.75rem', marginBottom: '0.35rem' }}>Original</p>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem', fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.85 }}>
                {memory.transcript_raw.split(/(?<=[.!?])\s+/).map((s, i) => (
                  <p key={i} style={{ margin: '0 0 0.35rem' }}>{s}</p>
                ))}
              </div>
            </>
          )}
          {memory.transcript_english && (
            <>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginTop: '0.75rem', marginBottom: '0.35rem' }}>English translation</p>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.85rem', fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.85 }}>
                {memory.transcript_english.split(/(?<=[.!?])\s+/).map((s, i) => (
                  <p key={i} style={{ margin: '0 0 0.35rem' }}>{s}</p>
                ))}
              </div>
            </>
          )}
        </details>
      )}

      {/* ── Your notes (owner only — no per-viewer notes storage exists) ── */}
      {isOwner && (
      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.65rem' }}>Your notes</h2>
        <textarea
          value={notes}
          onChange={e => { setNotes(e.target.value); scheduleAutoSave({ user_notes: e.target.value }) }}
          onBlur={() => patchField({ user_notes: notes })}
          placeholder="Add your personal notes…"
          rows={3}
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '0.7rem', fontSize: '0.85rem', fontFamily: 'var(--sans)', color: 'var(--text)', background: 'var(--gold-light)', resize: 'vertical', boxSizing: 'border-box' }}
        />
        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.35rem' }}>Saves automatically when you stop typing.</p>
      </section>
      )}

      {onboardingBanner}

      {showCreateGroupModal && createGroupModal}

      {/* ── Delete confirmation modal ── */}
      {showDeleteModal && (
        <div
          onClick={() => setShowDeleteModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 12,
              maxWidth: 520, width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>
                Delete Memory
              </h2>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  border: '1.5px solid var(--border)', background: 'var(--surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--muted)', flexShrink: 0,
                }}
                aria-label="Close"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div style={{ height: 1, background: 'var(--border)' }} />

            {/* Body */}
            <div style={{ padding: '1.5rem' }}>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.6 }}>
                Are you sure you want to delete{' '}
                <strong>{memory?.title}</strong>?
              </p>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                This memory will be permanently removed from your archive.
              </p>

              <button
                type="button"
                onClick={deleteMemory}
                style={{
                  marginTop: '1.5rem',
                  padding: '0.65rem 1.25rem', borderRadius: 8,
                  border: 'none', background: '#B91C1C',
                  color: 'white', fontWeight: 600, fontSize: '0.875rem',
                  cursor: 'pointer', fontFamily: 'var(--sans)',
                }}
              >
                Delete Memory
              </button>
            </div>
          </div>
        </div>
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
