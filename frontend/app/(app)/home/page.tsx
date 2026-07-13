// Home dashboard — recent memories primary, ♥ filter pill for favorites.
// Layout: 2-column (main | right panel). Main has hero card + unified memory list.

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api, type Person } from '@/lib/api'
import WaveformBars from '@/components/WaveformBars'
import FavoriteHeart from '@/components/FavoriteHeart'
import { SkeletonRow } from '@/components/Skeleton'
import { supabase } from '@/lib/supabase'
import { readFavorites, toggleFavorite as toggleFav } from '@/lib/favorites'
import HomeParticles from '@/components/HomeParticles'

type Memory = {
  token: string
  title: string | null
  narrator: string | null
  recorded_at: string
  image_url: string | null
  tags: string[] | null
  type: string | null
  recorded_by_name: string | null
}

// "tale" covers Tales & Songs entries with or without audio; "audio" alone
// is kept for back-compat with rows saved before the text-only split existed.
function isAudio(m: Memory) { return (m.tags ?? []).some(t => t === 'tale' || t === 'audio') }

function firstName(user: { user_metadata?: Record<string, unknown>; email?: string } | null): string {
  if (!user) return 'friend'
  const meta = user?.user_metadata ?? {}
  const full = meta.full_name ?? meta.name
  if (typeof full === 'string' && full.trim()) return (full.split(/\s+/)[0] ?? full).trim()
  return user.email?.split('@')[0] ?? 'friend'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Sub-components ────────────────────────────────────────────────────────

function HeroCard({ userName }: { userName: string }) {
  return (
    <>
      <style>{`
        .rk-hero-card { display: flex; flex-direction: row; align-items: stretch; }
        .rk-hero-text {
          flex: 1;
          padding: clamp(1.25rem, 3vw, 2rem);
          display: flex; flex-direction: column; justify-content: center; min-width: 0;
        }
        .rk-hero-img-wrap {
          width: clamp(200px, 32vw, 340px);
          flex-shrink: 0; overflow: hidden; background: var(--cream);
        }
        @media (max-width: 600px) {
          .rk-hero-card { flex-direction: column; }
          .rk-hero-img-wrap { width: 100%; height: 190px; order: 0 !important; }
          .rk-hero-text { padding: 1rem 1.1rem; order: 1 !important; }
        }
      `}</style>
      <section
        className="rk-hero-card"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          overflow: 'hidden',
          marginBottom: '1.5rem',
          /* Soft jade-tinted glow instead of a hard border around the warm
             illustration inside — ties it to the palette ambiently. The
             image itself can't carry its own shadow here since the card's
             overflow:hidden (needed to clip the image into rounded corners)
             would clip the shadow too, so the glow lives on the card. */
          boxShadow: '0 8px 32px rgba(45,27,14,0.07), 0 0 40px rgba(24,107,94,0.18)',
        }}
      >
        <div className="rk-hero-img-wrap" style={{ order: 2 }}>
          <img
            src="/hero-home.png"
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '65% center' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
        <div className="rk-hero-text" style={{ order: 1 }}>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.35rem, 3vw, 2rem)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, marginBottom: '0.5rem' }}>
            Welcome home, {userName}!{' '}
            <span aria-hidden style={{ color: 'var(--muted)' }}>♡</span>
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.65, marginBottom: '1.2rem' }}>
            Some things are priceless. The way they said it, the voice behind every memory. A recipe. A lullaby. A story told just once. Keep it alive, across generations.
          </p>
          <div className="rk-action-tiles">
            <ActionTile
              href="/capture"
              icon={<MicIcon />}
              label="Record a memory"
              desc="Capture a voice, a story, a moment"
              iconBg="rgba(24, 107, 94, 0.14)"
            />
            <ActionTile
              href="/upload"
              icon={<UploadIcon />}
              label="Upload a Memory"
              desc="Use an existing recording"
              iconBg="rgba(201, 148, 31, 0.13)"
            />
          </div>
        </div>
      </section>
    </>
  )
}

const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
    <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
  </svg>
)

const UploadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16"/>
    <line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
  </svg>
)

function ActionTile({ href, icon, label, desc, iconBg }: {
  href: string; icon: React.ReactNode; label: string; desc: string; iconBg?: string
}) {
  return (
    <Link
      href={href}
      className="rk-action-tile"
      style={{
        textDecoration: 'none',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.65rem',
        background: 'var(--cream)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '0.75rem 1rem',
        minWidth: 180,
        flex: '1 1 180px',
        maxWidth: 240,
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: iconBg ?? 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)', marginBottom: 3 }}>{label}</p>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.4 }}>{desc}</p>
      </div>
    </Link>
  )
}

// ─── Unified memories list ─────────────────────────────────────────────────

function MemoriesSection({
  memories,
  favTokens,
  onToggle,
  peopleMap,
  isFamily,
}: {
  memories: Memory[]
  favTokens: string[]
  isFamily?: boolean
  onToggle: (token: string) => void
  peopleMap: Record<string, string>
}) {
  const [showFavsOnly, setShowFavsOnly] = useState(false)

  const displayed = useMemo(() => {
    const list = showFavsOnly ? memories.filter(m => favTokens.includes(m.token)) : memories.slice(0, 6)
    return list
  }, [memories, favTokens, showFavsOnly])

  const hasFavs = favTokens.some(t => memories.find(m => m.token === t))

  return (
    <section>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)' }}>
          {showFavsOnly ? 'Your favorites' : isFamily ? 'Family Memories' : 'Recent memories'}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* ♥ Favorites toggle pill */}
          <button
            type="button"
            onClick={() => setShowFavsOnly(v => !v)}
            title={showFavsOnly ? 'Show all recent' : 'Show favorites only'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.28rem 0.7rem',
              borderRadius: 20,
              border: `1.5px solid ${showFavsOnly ? 'var(--amber)' : 'var(--border)'}`,
              background: showFavsOnly ? 'var(--gold-light)' : 'transparent',
              color: showFavsOnly ? 'var(--amber)' : 'var(--muted)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {showFavsOnly ? '♥' : '♡'} Favorites
          </button>
          {/* Family Collection link pill */}
          <Link
            href="/recipes?collection=1"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.28rem 0.7rem',
              borderRadius: 20,
              border: '1.5px solid var(--border)',
              background: 'transparent',
              color: 'var(--muted)',
              fontSize: '0.78rem',
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
            Family Collection
          </Link>
          <Link href="/recipes" style={{ fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}>
            View all ›
          </Link>
        </div>
      </div>

      {/* List */}
      {displayed.length === 0 ? (
        <div style={{ padding: '1.25rem 1rem', borderRadius: 14, background: 'var(--surface)', border: '1px dashed var(--border2)', color: 'var(--muted)', fontSize: '0.85rem', textAlign: 'center', lineHeight: 1.6 }}>
          {showFavsOnly
            ? <>Tap ♡ on any memory to add it to your favorites</>
            : <>No memories yet. <Link href="/capture" style={{ color: 'var(--accent)', fontWeight: 600 }}>Capture the first one</Link></>
          }
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {displayed.map(m => (
            <MemoryRow
              key={m.token}
              memory={m}
              isFav={favTokens.includes(m.token)}
              onToggle={() => onToggle(m.token)}
              photoUrl={peopleMap[m.narrator?.toLowerCase() ?? ''] ?? ''}
            />
          ))}
        </div>
      )}

      {/* Subtle hint when viewing favorites and there are none yet */}
      {!showFavsOnly && !hasFavs && memories.length > 0 && (
        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.65rem', textAlign: 'center' }}>
          Tap ♡ on any memory to save it to favorites
        </p>
      )}
    </section>
  )
}

function MemoryRow({
  memory,
  isFav,
  onToggle,
  photoUrl,
}: {
  memory: Memory
  isFav: boolean
  onToggle: () => void
  photoUrl: string
}) {
  const narr = memory.narrator ?? 'Narrator'
  const title = memory.title ?? 'Untitled memory'
  const initial = narr[0]?.toUpperCase() ?? '?'

  return (
    <div
      className="rk-card-hoverable"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.7rem 0.85rem',
        minHeight: 76,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        position: 'relative',
      }}
    >
      {/* Whole-card tap target */}
      <Link
        href={`/memory?token=${memory.token}`}
        aria-label={`Open ${title}`}
        style={{ position: 'absolute', inset: 0, borderRadius: 14, zIndex: 0 }}
      />

      {/* Narrator avatar */}
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, zIndex: 1 }}>
        {photoUrl
          ? <img src={photoUrl} alt={narr} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontFamily: 'var(--serif)', fontWeight: 700, color: 'var(--accent)', fontSize: '1.05rem' }}>{initial}</span>
        }
      </div>

      {/* Title + meta + waveform */}
      <div style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          {isAudio(memory) && <span style={{ fontSize: '0.72rem', color: 'var(--accent)', flexShrink: 0 }}>✦</span>}
          {title}
        </p>
        <p style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {narr} · {fmtDate(memory.recorded_at)}
          {memory.type && memory.type !== 'recipe' && (
            <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 10, textTransform: 'capitalize', verticalAlign: 'middle' }}>{memory.type}</span>
          )}
          {memory.recorded_by_name && (
            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--muted)' }}>by {memory.recorded_by_name}</span>
          )}
        </p>
        <WaveformBars token={memory.token} barCount={18} />
      </div>

      {/* Heart */}
      <FavoriteHeart favorite={isFav} onToggle={onToggle} style={{ flexShrink: 0, zIndex: 1 }} />

      {/* Play circle (visual only — card Link handles tap) */}
      <div
        aria-hidden
        style={{
          width: 34, height: 34, borderRadius: '50%',
          border: '2px solid var(--accent)', color: 'var(--accent)',
          background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.7rem', flexShrink: 0, zIndex: 1, pointerEvents: 'none',
        }}
      >
        ▶
      </div>
    </div>
  )
}

// ─── Right panel ───────────────────────────────────────────────────────────

function QuotePanel() {
  return (
    <>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.5rem 1.25rem', marginBottom: '1rem', boxShadow: '0 4px 16px rgba(45,27,14,0.05)' }}>
        <p style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', fontStyle: 'italic', color: 'var(--text2)', lineHeight: 1.6, marginBottom: '0.75rem' }}>
          &ldquo;The moments shared today are the memories you&apos;ll cherish forever.&rdquo;
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', letterSpacing: '0.01em' }}>
          Echoes of Home
        </p>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.25rem', boxShadow: '0 4px 16px rgba(45,27,14,0.05)' }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span aria-hidden>💡</span> Tips for a great memory
        </h3>
        {[
          {
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>,
            title: 'Ask what makes the recipe special',
            desc: 'Capture the stories behind the dish.',
          },
          {
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
            title: 'Ask for their tips and little secrets',
            desc: 'Those little details make it priceless.',
          },
          {
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
            title: 'Let them talk naturally',
            desc: 'The more they share, the better!',
          },
        ].map((tip) => (
          <div key={tip.title} style={{ display: 'flex', gap: '0.65rem', marginBottom: '0.9rem' }}>
            {/* No circle background here, unlike the Record/Upload CTAs above —
                these are informational, not actionable, and shouldn't compete
                visually with the icon-in-circle pattern used for real actions. */}
            <div style={{ width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', flexShrink: 0 }}>
              {tip.icon}
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text)', marginBottom: 3 }}>{tip.title}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.45 }}>{tip.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [userName, setUserName] = useState('friend')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [favTick, setFavTick] = useState(0)
  const [isFamily, setIsFamily] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserName(firstName(user)))
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      // Try family recipes first; fall back to own
      api.family.recipes()
        .then((rows) => {
          if (Array.isArray(rows) && rows.length > 0) { setIsFamily(true); return rows }
          return api.recipes.list()
        })
        .catch(() => api.recipes.list()),
      api.people.list().catch(() => []),
    ])
      .then(([m, p]) => {
        if (!cancelled) { setMemories(m as Memory[]); setPeople(p as Person[]) }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const favTokens = useMemo(() => readFavorites(), [favTick, memories])

  const toggleFavorite = useCallback((token: string) => {
    toggleFav(token)
    setFavTick((x) => x + 1)
  }, [])

  const peopleMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of people) {
      if (p.photo_url) map[p.name.toLowerCase()] = p.photo_url
    }
    return map
  }, [people])

  if (loading) {
    return (
      <div style={{ padding: 'clamp(0.85rem, 3vw, 1.75rem)', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {Array.from({ length: 4 }, (_, i) => <SkeletonRow key={i} />)}
        </div>
      </div>
    )
  }
  if (error) {
    return <div style={{ padding: '2rem 1.5rem', color: 'var(--accent)' }}>{error}</div>
  }

  return (
    <div style={{ padding: 'clamp(0.85rem, 3vw, 1.75rem) clamp(0.75rem, 3vw, 1.75rem) 2.5rem', overflowX: 'hidden', position: 'relative', zIndex: 1 }}>
      <HomeParticles />
      <style>{`
        .rk-home-cols {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.25rem;
          max-width: 1200px;
          margin: 0 auto;
        }
        @media (min-width: 860px) {
          .rk-home-cols { grid-template-columns: 1fr 272px; align-items: start; }
        }
        .rk-action-tiles { display: flex; gap: 0.65rem; flex-wrap: wrap; }
        @media (max-width: 480px) {
          .rk-action-tiles { flex-direction: column; gap: 0.5rem; }
          .rk-action-tile { max-width: 100% !important; min-width: 0 !important; flex: 0 0 auto !important; padding: 0.6rem 0.85rem !important; }
        }
      `}</style>

      <div className="rk-home-cols">
        {/* ── Left: main content ── */}
        <div>
          <HeroCard userName={userName} />
          <MemoriesSection
            memories={memories}
            favTokens={favTokens}
            onToggle={toggleFavorite}
            peopleMap={peopleMap}
            isFamily={isFamily}
          />
        </div>

        {/* ── Right: quote + tips ── */}
        <aside>
          <QuotePanel />
        </aside>
      </div>

      <p style={{ textAlign: 'center', fontSize: '0.88rem', color: 'var(--muted)', maxWidth: 1200, margin: '2rem auto 0', letterSpacing: '0.01em' }}>
        Keep the echoes alive. <span style={{ color: 'var(--accent)' }}>♥</span>
      </p>
    </div>
  )
}
