// Home dashboard — aligned to Echoes of Home product mockup.
// Layout: 2-column (main content | right panel). Main has hero card, favorites scroll, recent memories.
// Right panel has quote card + tips.

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api, type Person } from '@/lib/api'
import WaveformBars from '@/components/WaveformBars'
import { supabase } from '@/lib/supabase'

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

function readFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem('rk_favorites') ?? '[]') } catch { return [] }
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
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'stretch',
        marginBottom: '1.75rem',
        boxShadow: '0 8px 32px rgba(45,27,14,0.07)',
        minHeight: 220,
      }}
    >
      {/* Left: text + action tiles */}
      <div style={{ flex: 1, padding: 'clamp(1.25rem, 3vw, 2rem)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.15, marginBottom: '0.55rem' }}>
          Welcome home, {userName}! <span aria-hidden style={{ color: 'var(--accent)' }}>♡</span>
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.5, marginBottom: '1.35rem' }}>
          Every recipe has a story.<br />Every memory keeps her close.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <ActionTile
            href="/capture"
            icon="🎙️"
            label="Record a memory"
            desc="Capture a voice, a story, a moment"
          />
          <ActionTile
            href="/upload"
            icon="☁️"
            label="Upload audio"
            desc="Use an existing recording"
          />
        </div>
      </div>
      {/* Right: grandmother photo */}
      <div
        className="rk-hero-photo"
        style={{
          width: 280,
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--cream2)',
        }}
      >
        <img
          src="/landing-hero-photo.png"
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </div>
    </section>
  )
}

function ActionTile({ href, icon, label, desc }: { href: string; icon: string; label: string; desc: string }) {
  return (
    <Link
      href={href}
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
          background: 'var(--accent-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.05rem',
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
}: {
  memories: Memory[]
  favTokens: string[]
  onToggle: (token: string) => void
  sortBy: 'favorites' | 'recent'
  onSortChange: (v: 'favorites' | 'recent') => void
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
        <div style={{ display: 'flex', gap: '0.85rem', overflowX: 'auto', paddingBottom: '0.5rem', scrollbarWidth: 'none' }}>
          {sorted.map((m) => (
            <FavoriteCard key={m.token} memory={m} isFav={favTokens.includes(m.token)} onToggle={() => onToggle(m.token)} />
          ))}
        </div>
      )}
    </section>
  )
}

function FavoriteCard({ memory, isFav, onToggle }: { memory: Memory; isFav: boolean; onToggle: () => void }) {
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
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
            {(memory.narrator ?? '?')[0]?.toUpperCase()}
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
          { icon: '🎙️', title: 'Ask what makes the recipe special', desc: 'Capture the stories behind the dish.' },
          { icon: '♥', title: 'Ask for her tips and little secrets', desc: 'Those little details make it priceless.' },
          { icon: '✨', title: 'Let her talk naturally', desc: 'The more she shares, the better!' },
        ].map((tip) => (
          <div key={tip.title} style={{ display: 'flex', gap: '0.65rem', marginBottom: '0.9rem' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0 }}>
              {tip.icon}
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text)', marginBottom: 3 }}>{tip.title}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.45 }}>{tip.desc}</p>
            </div>
          </div>
        ))}
        <Link href="/capture" style={{ fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
          Learn more ›
        </Link>
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
    const set = new Set(readFavorites())
    if (set.has(token)) set.delete(token)
    else set.add(token)
    localStorage.setItem('rk_favorites', JSON.stringify([...set]))
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
    <div style={{ padding: '1.25rem 1.5rem 2.75rem' }}>
      <style>{`
        .rk-home-cols {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.25rem;
          max-width: 1200px;
          margin: 0 auto;
        }
        @media (min-width: 1024px) {
          .rk-home-cols { grid-template-columns: 1fr 272px; align-items: start; }
        }
        .rk-hero-photo { display: none; }
        @media (min-width: 720px) { .rk-hero-photo { display: block !important; } }
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
    </div>
  )
}
