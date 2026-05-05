// Home dashboard — layout aligned with Echoes of Home product mock (hero, quote, memories, recipes, people, CTA).

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api, type Person } from '@/lib/api'
import MemoryCard from '@/components/MemoryCard'
import MemoryListRow from '@/components/MemoryListRow'
import { supabase } from '@/lib/supabase'

type Memory = { token: string; dish_name: string | null; narrator: string | null; recorded_at: string; image_url: string | null }

const HERO_IMG =
  'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=1400&q=80'

function firstName(user: { user_metadata?: Record<string, unknown>; email?: string } | null): string {
  if (!user) return 'friend'
  const meta = user?.user_metadata ?? {}
  const full = meta.full_name ?? meta.name
  if (typeof full === 'string' && full.trim()) return (full.split(/\s+/)[0] ?? full).trim()
  return user.email?.split('@')[0] ?? 'friend'
}

function readFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem('rk_favorites') ?? '[]')
  } catch {
    return []
  }
}

function sectionTitle(title: string, href: string) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
      <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)' }}>{title}</h2>
      <Link href={href} style={{ fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
        View all
      </Link>
    </div>
  )
}

export default function HomePage() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [userName, setUserName] = useState('friend')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [favTick, setFavTick] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserName(firstName(user)))
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([api.recipes.list().catch((e: Error) => { throw e }), api.people.list().catch(() => [])])
      .then(([m, p]) => {
        if (!cancelled) {
          setMemories(m as Memory[])
          setPeople(p as Person[])
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const favTokens = useMemo(() => readFavorites(), [favTick, memories])

  const toggleFavorite = useCallback((token: string) => {
    const set = new Set(readFavorites())
    if (set.has(token)) set.delete(token)
    else set.add(token)
    localStorage.setItem('rk_favorites', JSON.stringify([...set]))
    setFavTick((x) => x + 1)
  }, [])

  const cherished = useMemo(() => {
    const favs = memories.filter((m) => favTokens.includes(m.token))
    const pool = favs.length ? favs : memories
    return pool.slice(0, 3)
  }, [memories, favTokens])

  const recentRows = memories.slice(0, 4)
  const peopleShow = people.slice(0, 3)

  if (loading) {
    return (
      <div style={{ padding: '2.5rem 1.5rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
        Loading your home…
      </div>
    )
  }
  if (error) {
    return <div style={{ padding: '2rem 1.5rem', color: 'var(--accent)' }}>{error}</div>
  }

  return (
    <div style={{ padding: '1.25rem 1.5rem 2.75rem', maxWidth: 1180, margin: '0 auto' }}>
      <style>{`
        .rk-hero-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; margin-bottom: 2rem; }
        @media (min-width: 960px) {
          .rk-hero-grid { grid-template-columns: minmax(0, 1fr) minmax(240px, 300px); align-items: stretch; }
        }
        .rk-mid-grid { display: grid; grid-template-columns: 1fr; gap: 1.75rem; margin-bottom: 2rem; }
        @media (min-width: 900px) {
          .rk-mid-grid { grid-template-columns: 1fr 1fr; align-items: start; }
        }
      `}</style>

      {/* Hero + quote */}
      <div className="rk-hero-grid">
        <section
          style={{
            position: 'relative',
            borderRadius: 20,
            overflow: 'hidden',
            minHeight: 300,
            border: '1px solid var(--border)',
            boxShadow: '0 16px 48px rgba(45, 27, 14, 0.08)',
          }}
        >
          <img
            src={HERO_IMG}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.92)' }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(105deg, rgba(253, 248, 243, 0.94) 0%, rgba(253, 248, 243, 0.78) 42%, rgba(253, 248, 243, 0.25) 100%)',
            }}
          />
          <div style={{ position: 'relative', zIndex: 1, padding: 'clamp(1.25rem, 3vw, 2rem)', maxWidth: 520 }}>
            <h1
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 'clamp(1.65rem, 3.5vw, 2.15rem)',
                fontWeight: 700,
                color: 'var(--text)',
                lineHeight: 1.15,
                marginBottom: '0.65rem',
              }}
            >
              Welcome home, {userName}! <span aria-hidden>♡</span>
            </h1>
            <p style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(0.95rem, 1.8vw, 1.05rem)', fontStyle: 'italic', color: 'var(--text2)', lineHeight: 1.55, marginBottom: '1.35rem' }}>
              Every story has a scent, every recipe a memory, every moment a heartbeat. Let&apos;s keep them alive.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
              <Link
                href="/capture"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  background: 'var(--accent)',
                  color: 'white',
                  textDecoration: 'none',
                  padding: '0.65rem 1.15rem',
                  borderRadius: 12,
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(196, 82, 42, 0.35)',
                }}
              >
                <span aria-hidden>🎙️</span>
                Record a memory
              </Link>
              <Link
                href="/upload"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  background: 'var(--surface)',
                  color: 'var(--accent)',
                  border: '2px solid var(--accent)',
                  textDecoration: 'none',
                  padding: '0.6rem 1.1rem',
                  borderRadius: 12,
                  fontSize: '0.88rem',
                  fontWeight: 600,
                }}
              >
                <span aria-hidden>📤</span>
                Upload audio
              </Link>
            </div>
          </div>
        </section>

        <aside
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: '1.35rem 1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            boxShadow: '0 8px 28px rgba(45, 27, 14, 0.05)',
          }}
        >
          <p style={{ fontFamily: 'var(--serif)', fontSize: '1.08rem', fontStyle: 'italic', color: 'var(--text2)', lineHeight: 1.55, marginBottom: '1rem' }}>
            &ldquo;The stories we tell today become the treasures of tomorrow.&rdquo;
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span aria-hidden>♥</span>
            Share a memory. Keep the echoes alive.
          </p>
        </aside>
      </div>

      {/* Recent memories | Cherished recipes */}
      <div className="rk-mid-grid">
        <section>
          {sectionTitle('Recent memories', '/memories')}
          {memories.length === 0 ? (
            <div
              style={{
                padding: '1.5rem',
                borderRadius: 14,
                background: 'var(--surface)',
                border: '1px dashed var(--border2)',
                color: 'var(--muted)',
                fontSize: '0.88rem',
                textAlign: 'center',
              }}
            >
              No memories yet —{' '}
              <Link href="/capture" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                capture the first one
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {recentRows.map((m) => (
                <MemoryListRow
                  key={m.token}
                  memory={m}
                  favorite={favTokens.includes(m.token)}
                  onToggleFavorite={() => toggleFavorite(m.token)}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          {sectionTitle('Cherished recipes', '/memories')}
          {cherished.length === 0 ? (
            <div style={{ padding: '1.5rem', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '0.88rem' }}>
              Save favourites with the heart on any memory to fill this shelf.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.65rem' }}>
              {cherished.map((m) => (
                <MemoryCard key={m.token} memory={m} variant="poster" />
              ))}
            </div>
          )}
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem 1.15rem',
              borderRadius: 14,
              background: 'var(--accent-light)',
              border: '1px solid rgba(196, 82, 42, 0.2)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
            }}
          >
            <p style={{ fontSize: '0.82rem', color: 'var(--text2)', maxWidth: 280, lineHeight: 1.45 }}>
              Every recipe holds a story. Add details, memories, and little secrets.
            </p>
            <Link
              href="/capture"
              style={{
                background: 'var(--accent)',
                color: 'white',
                textDecoration: 'none',
                padding: '0.5rem 1rem',
                borderRadius: 10,
                fontSize: '0.8rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              Add a recipe
            </Link>
          </div>
        </section>
      </div>

      {/* Your people */}
      <section style={{ marginBottom: '2rem' }}>
        {sectionTitle('Your people', '/people')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem', maxWidth: 720 }}>
          {peopleShow.map((p) => (
            <Link
              key={p.id}
              href="/people"
              style={{
                textDecoration: 'none',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: '1rem 0.75rem',
                textAlign: 'center',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  margin: '0 auto 0.65rem',
                  background: 'var(--cream2)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                }}
              >
                {p.photo_url ? (
                  <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span aria-hidden>{p.emoji ?? '👤'}</span>
                )}
              </div>
              <p style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: '0.92rem', color: 'var(--text)' }}>{p.name}</p>
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>{p.relationship}</p>
            </Link>
          ))}
          <Link
            href="/people"
            style={{
              textDecoration: 'none',
              background: 'var(--cream2)',
              border: '2px dashed var(--border2)',
              borderRadius: 16,
              padding: '1rem 0.75rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 160,
              color: 'var(--muted)',
            }}
          >
            <span style={{ fontSize: '1.75rem', marginBottom: 6 }}>+</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text2)' }}>Add someone</span>
          </Link>
        </div>
      </section>

      {/* Bottom prompt */}
      <section
        style={{
          borderRadius: 18,
          border: '1px solid var(--border)',
          background: 'linear-gradient(90deg, var(--surface) 0%, var(--cream2) 55%, #FAF4EE 100%)',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          boxShadow: '0 8px 24px rgba(45, 27, 14, 0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', maxWidth: 560 }}>
          <span style={{ fontSize: '1.35rem', lineHeight: 1 }} aria-hidden>
            ♥
          </span>
          <div>
            <p style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: '1.02rem', color: 'var(--text)', marginBottom: 6 }}>
              Capture today. Cherish forever.
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>
              Not sure where to begin? Start with a gentle prompt and let the story unfold.
            </p>
          </div>
        </div>
        <Link
          href="/capture"
          style={{
            background: 'var(--accent)',
            color: 'white',
            textDecoration: 'none',
            padding: '0.65rem 1.25rem',
            borderRadius: 12,
            fontSize: '0.85rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          Start with a prompt
        </Link>
      </section>
    </div>
  )
}
