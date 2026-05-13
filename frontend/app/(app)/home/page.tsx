// Home dashboard — aligned to Echoes of Home product mockup.
// Layout: 2-column (main content | right panel). Main has hero card, favorites scroll, recent memories.
// Right panel has quote card + tips.

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api, type Person } from '@/lib/api'
import WaveformBars from '@/components/WaveformBars'
import { supabase } from '@/lib/supabase'
import { readFavorites, toggleFavorite as toggleFav } from '@/lib/favorites'

type Memory = {
  token: string
  dish_name: string | null
  narrator: string | null
  recorded_at: string
  image_url: string | null
}

function firstName(user: { user_metadata?: Record<string, unknown>; email?: string } | null): string {
  if (!user) return 'friend'
  const meta = user?.user_metadata ?? {}
  const full = meta.full_name ?? meta.name
  if (typeof full === 'string' && full.trim()) return (full.split(/\s+/)[0] ?? full).trim()
  return user.email?.split('@')[0] ?? 'friend'
}


function pseudoDuration(token: string): string {
  let n = 0
  for (let i = 0; i < token.length; i++) n += token.charCodeAt(i)
  const sec = 95 + (n % 220)
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Sub-components ────────────────────────────────────────────────────────

function HeroCard({ userName }: { userName: string }) {
  return (
    <>
      <style>{`
        .rk-hero-card {
          display: flex;
          flex-direction: row;
          align-items: stretch;
        }
        .rk-hero-text {
          flex: 1;
          padding: clamp(1.25rem, 3vw, 2rem);
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-width: 0;
        }
        .rk-hero-img-wrap {
          width: clamp(200px, 32vw, 340px);
          flex-shrink: 0;
          overflow: hidden;
          background: var(--cream);
        }
        /* Mobile: stack vertically, image on top */
        @media (max-width: 600px) {
          .rk-hero-card { flex-direction: column; }
          .rk-hero-img-wrap {
            width: 100%;
            height: 200px;
            order: 0 !important;
          }
          .rk-hero-text {
            padding: 1rem 1.1rem;
            order: 1 !important;
          }
        }
      `}</style>
      <section
        className="rk-hero-card"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          overflow: 'hidden',
          marginBottom: '1.75rem',
          boxShadow: '0 8px 32px rgba(45,27,14,0.07)',
        }}
      >
        {/* Image — top on mobile, right on desktop */}
        <div className="rk-hero-img-wrap" style={{ order: 2 }}>
          <img
            src="/hero-home.png"
            alt=""
            className="rk-hero-img"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '65% center' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <style>{`.rk-hero-img { object-position: 65% center; } @media (max-width: 600px) { .rk-hero-img { object-position: 70% 40%; } }`}</style>
        </div>

        {/* Text + action tiles */}
        <div className="rk-hero-text" style={{ order: 1 }}>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.35rem, 3vw, 2rem)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, marginBottom: '0.5rem' }}>
            Welcome home, {userName}!{' '}
            <span aria-hidden style={{ color: '#D4895A' }}>♡</span>
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.55, marginBottom: '1.2rem' }}>
            Every recipe has a story.<br />Every memory keeps her close.
          </p>
          <div className="rk-action-tiles">
            <ActionTile
              href="/capture"
              icon={<MicIcon />}
              label="Record a memory"
              desc="Capture a voice, a story, a moment"
              iconBg="rgba(196, 82, 42, 0.14)"
            />
            <ActionTile
              href="/upload"
              icon={<UploadIcon />}
              label="Upload audio"
              desc="Use an existing recording"
              iconBg="rgba(196, 138, 26, 0.13)"
            />
          </div>
        </div>
      </section>
    </>
  )
}

const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C4522A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
    <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
  </svg>
)

const UploadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C48A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16"/>
    <line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
  </svg>
)

function ActionTile({
  href, icon, label, desc, iconBg,
}: {
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
        transition: 'box-shadow 0.15s',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: iconBg ?? 'var(--accent-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)', marginBottom: 3 }}>{label}</p>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.4 }}>{desc}</p>
      </div>
    </Link>
  )
}

function FavoritesScroll({
  memories,
  favTokens,
  onToggle,
  sortBy,
  onSortChange,
  peopleMap,
}: {
  memories: Memory[]
  favTokens: string[]
  onToggle: (token: string) => void
  sortBy: 'favorites' | 'recent'
  onSortChange: (v: 'favorites' | 'recent') => void
  peopleMap: Record<string, string>
}) {
  const sorted = useMemo(() => {
    if (sortBy === 'favorites') {
      const favs = memories.filter((m) => favTokens.includes(m.token))
      const rest = memories.filter((m) => !favTokens.includes(m.token))
      return [...favs, ...rest]
    }
    return [...memories]
  }, [memories, favTokens, sortBy])

  return (
    <section style={{ marginBottom: '1.75rem' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          Your favorites <span aria-hidden style={{ color: 'var(--accent)' }}>♡</span>
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            Sort by:
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as 'favorites' | 'recent')}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.25rem 0.55rem',
                fontSize: '0.75rem',
                background: 'var(--surface)',
                color: 'var(--accent)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <option value="favorites">Favorites</option>
              <option value="recent">Recent</option>
            </select>
          </label>
          <Link href="/memories" style={{ fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}>
            View all ›
          </Link>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div style={{ padding: '1.5rem', borderRadius: 14, background: 'var(--surface)', border: '1px dashed var(--border2)', color: 'var(--muted)', fontSize: '0.88rem', textAlign: 'center' }}>
          No memories yet —{' '}
          <Link href="/capture" style={{ color: 'var(--accent)', fontWeight: 600 }}>capture the first one</Link>
        </div>
      ) : (
        <div className="rk-favscroll-wrap">
          {sorted.map((m) => (
            <FavoriteCard key={m.token} memory={m} isFav={favTokens.includes(m.token)} onToggle={() => onToggle(m.token)} narratorPhoto={peopleMap[m.narrator?.toLowerCase() ?? ''] ?? ''} />
          ))}
        </div>
      )}
    </section>
  )
}

function FavoriteCard({ memory, isFav, onToggle, narratorPhoto }: { memory: Memory; isFav: boolean; onToggle: () => void; narratorPhoto: string }) {
  return (
    <div style={{ flexShrink: 0, width: 180, borderRadius: 16, overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(45,27,14,0.06)' }}>
      <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--cream2)', overflow: 'hidden' }}>
        <Link href={`/memory?token=${memory.token}`} style={{ display: 'block', height: '100%' }}>
          {memory.image_url
            ? <img src={memory.image_url} alt={memory.dish_name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem' }}>🍽️</div>
          }
        </Link>
        {/* Heart toggle overlay */}
        <button
          type="button"
          aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
          onClick={onToggle}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.88)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.95rem',
            boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
            color: isFav ? '#C4522A' : '#C4A882',
          }}
        >
          {isFav ? '♥' : '♡'}
        </button>
      </div>
      <div style={{ padding: '0.65rem 0.75rem' }}>
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 5 }}>
          {memory.dish_name ?? 'Untitled'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-light)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid var(--border)' }}>
            {narratorPhoto
              ? <img src={narratorPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--accent)' }}>{(memory.narrator ?? '?')[0]?.toUpperCase()}</span>
            }
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {memory.narrator ?? 'Narrator'}
          </p>
        </div>
      </div>
    </div>
  )
}

function RecentMemoriesSection({
  memories,
  favTokens,
  onToggle,
  peopleMap,
}: {
  memories: Memory[]
  favTokens: string[]
  onToggle: (token: string) => void
  peopleMap: Record<string, string>
}) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)' }}>Recent memories</h2>
        <Link href="/memories" style={{ fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>View all ›</Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {memories.map((m) => (
          <MemoryRow
            key={m.token}
            memory={m}
            isFav={favTokens.includes(m.token)}
            onToggle={() => onToggle(m.token)}
            photoUrl={peopleMap[m.narrator?.toLowerCase() ?? ''] ?? ''}
          />
        ))}
      </div>
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
  const duration = pseudoDuration(memory.token)
  const narr = memory.narrator ?? 'Narrator'
  const title = memory.dish_name ?? 'Untitled memory'
  const initial = narr[0]?.toUpperCase() ?? '?'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.85rem',
        padding: '0.75rem 1rem',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
      }}
    >
      {/* Narrator avatar */}
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
        {photoUrl
          ? <img src={photoUrl} alt={narr} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontFamily: 'var(--serif)', fontWeight: 700, color: 'var(--accent)', fontSize: '1.1rem' }}>{initial}</span>
        }
      </div>
      {/* Name + waveform */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 600, color: 'var(--text)', fontSize: '0.95rem', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 6 }}>{narr} · {fmtDate(memory.recorded_at)}</p>
        <WaveformBars token={memory.token} barCount={22} />
      </div>
      {/* Duration */}
      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{duration}</span>
      {/* Heart */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.05rem', lineHeight: 1, color: isFav ? 'var(--accent)' : 'var(--muted)', flexShrink: 0 }}
      >
        {isFav ? '♥' : '♡'}
      </button>
      {/* Play — outline circle */}
      <Link
        href={`/memory?token=${memory.token}`}
        aria-label={`Play ${title}`}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '2px solid var(--accent)',
          color: 'var(--accent)',
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
          fontSize: '0.75rem',
          flexShrink: 0,
        }}
      >
        ▶
      </Link>
    </div>
  )
}

function QuotePanel() {
  return (
    <>
      {/* Quote card */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          padding: '1.5rem 1.25rem',
          marginBottom: '1rem',
          boxShadow: '0 4px 16px rgba(45,27,14,0.05)',
        }}
      >
        <p style={{ fontFamily: 'var(--serif)', fontSize: '2rem', color: 'var(--accent)', lineHeight: 1, marginBottom: '0.65rem' }}>&ldquo;</p>
        <p style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', fontStyle: 'italic', color: 'var(--text2)', lineHeight: 1.6, marginBottom: '1rem' }}>
          The stories she tells today are the recipes you&apos;ll cherish forever.
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span aria-hidden style={{ color: 'var(--accent)' }}>♥</span>
          Share a memory. Keep the echoes alive.
        </p>
      </div>

      {/* Tips */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          padding: '1.25rem',
          boxShadow: '0 4px 16px rgba(45,27,14,0.05)',
        }}
      >
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
            title: 'Ask for her tips and little secrets',
            desc: 'Those little details make it priceless.',
          },
          {
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
            title: 'Let her talk naturally',
            desc: 'The more she shares, the better!',
          },
        ].map((tip) => (
          <div key={tip.title} style={{ display: 'flex', gap: '0.65rem', marginBottom: '0.9rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
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
  const [sortBy, setSortBy] = useState<'favorites' | 'recent'>('favorites')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserName(firstName(user)))
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([api.recipes.list().catch((e: Error) => { throw e }), api.people.list().catch(() => [])])
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

  // Build narrator → photo_url lookup from people list
  const peopleMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of people) {
      if (p.photo_url) map[p.name.toLowerCase()] = p.photo_url
    }
    return map
  }, [people])

  const recentRows = memories.slice(0, 4)

  if (loading) {
    return <div style={{ padding: '2.5rem 1.5rem', color: 'var(--muted)', fontSize: '0.9rem' }}>Loading your home…</div>
  }
  if (error) {
    return <div style={{ padding: '2rem 1.5rem', color: 'var(--accent)' }}>{error}</div>
  }

  return (
    <div style={{ padding: 'clamp(1rem, 3vw, 1.75rem) clamp(0.85rem, 3vw, 1.75rem) 2.5rem', overflowX: 'hidden' }}>
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
        .rk-hero-photo { display: none; }
        @media (min-width: 700px) { .rk-hero-photo { display: block !important; } }
        .rk-action-tiles {
          display: flex;
          gap: 0.65rem;
          flex-wrap: wrap;
        }
        @media (max-width: 480px) {
          .rk-action-tiles { flex-direction: column; gap: 0.5rem; }
          .rk-action-tile { max-width: 100% !important; min-width: 0 !important; flex: 0 0 auto !important; padding: 0.6rem 0.85rem !important; }
        }
        .rk-favscroll-wrap {
          display: flex;
          gap: 0.85rem;
          overflow-x: auto;
          padding-bottom: 0.5rem;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .rk-favscroll-wrap::-webkit-scrollbar { display: none; }
      `}</style>

      <div className="rk-home-cols">
        {/* ── Left: main content ── */}
        <div>
          <HeroCard userName={userName} />
          <FavoritesScroll
            memories={memories}
            favTokens={favTokens}
            onToggle={toggleFavorite}
            sortBy={sortBy}
            onSortChange={setSortBy}
            peopleMap={peopleMap}
          />
          {recentRows.length > 0 && (
            <RecentMemoriesSection
              memories={recentRows}
              favTokens={favTokens}
              onToggle={toggleFavorite}
              peopleMap={peopleMap}
            />
          )}
        </div>

        {/* ── Right: quote + tips ── */}
        <aside>
          <QuotePanel />
        </aside>
      </div>

      {/* Bottom tagline */}
      <p style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.88rem', color: 'var(--muted)', maxWidth: 1200, margin: '2rem auto 0' }}>
        Memories fade with time, but love keeps them alive. Capture today. <span style={{ color: 'var(--accent)' }}>❤️</span>
      </p>
    </div>
  )
}
