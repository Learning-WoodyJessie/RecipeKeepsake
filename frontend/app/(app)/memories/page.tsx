// All Recipes page — aligned to Echoes of Home product mockup.
// Two-column: main (hero, count/sort, 4-col grid, CTA) | right (filter pills + why recipes matter).

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api, type Person } from '@/lib/api'

type Memory = {
  token: string
  dish_name: string | null
  narrator: string | null
  recorded_at: string
  image_url: string | null
}

function readFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem('rk_favorites') ?? '[]') } catch { return [] }
}

const FILTER_TAGS = ['All', 'Favorites', 'Breakfast', 'Lunch', 'Sweets', 'Pickles', 'Snacks', 'Drinks', 'Recently added']
const SORT_OPTIONS = ['Recently added', 'Oldest first', 'A–Z']

// ─── Right panel ────────────────────────────────────────────────────────
function RightPanel({
  filter,
  setFilter,
  sort,
  setSort,
}: {
  filter: string
  setFilter: (f: string) => void
  sort: string
  setSort: (s: string) => void
}) {
  const WHY = [
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {/* Flame / keep alive */}
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
          <path d="M12 6c0 0-4 3.5-4 7a4 4 0 008 0c0-1.5-.5-3-2-4.5 0 2-1 3-2 3s-2-1-2-2.5c0-1 .5-2 2-3.5z"/>
        </svg>
      ),
      title: 'Keep traditions alive',
      desc: 'Every recipe carries the wisdom and love of our elders.',
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {/* Camera / relive moments */}
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      ),
      title: 'Relive precious moments',
      desc: 'Recipes bring back the sights, sounds and smells of our happiest times.',
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {/* People / share the love */}
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
      ),
      title: 'Share the love',
      desc: 'Pass down flavors and memories to the next generation.',
    },
  ]

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Filter box */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.25rem', boxShadow: '0 4px 16px rgba(45,27,14,0.05)' }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          Filter recipes
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
          {FILTER_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => setFilter(tag)}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: 20,
                fontSize: '0.78rem',
                fontWeight: 500,
                border: '1.5px solid',
                cursor: 'pointer',
                borderColor: filter === tag ? 'var(--accent)' : 'var(--border)',
                background: filter === tag ? 'var(--accent-light)' : 'transparent',
                color: filter === tag ? 'var(--accent)' : 'var(--text2)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              {tag === 'Favorites' && '♡ '}{tag}
            </button>
          ))}
        </div>
      </div>

      {/* Why recipes matter */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.25rem', boxShadow: '0 4px 16px rgba(45,27,14,0.05)' }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          Why recipes matter
        </h3>
        {WHY.map((item) => (
          <div key={item.title} style={{ display: 'flex', gap: '0.7rem', marginBottom: '0.95rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
              {item.icon}
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text)', marginBottom: 3 }}>{item.title}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.5 }}>{item.desc}</p>
            </div>
          </div>
        ))}

        {/* Quote */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.25rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1.5rem', color: 'var(--accent)', lineHeight: 1, marginBottom: '0.5rem' }}>&ldquo;</p>
          <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '0.88rem', color: 'var(--text2)', lineHeight: 1.65, marginBottom: '0.65rem' }}>
            A recipe is more than ingredients. It&apos;s a story we live and share.
          </p>
          <span style={{ color: 'var(--muted)' }}>♡</span>
        </div>
      </div>
    </aside>
  )
}

// ─── Recipe card ─────────────────────────────────────────────────────────
function RecipeCard({
  memory,
  isFav,
  onToggleFav,
  narratorPhoto,
  narratorRelationship,
}: {
  memory: Memory
  isFav: boolean
  onToggleFav: () => void
  narratorPhoto: string
  narratorRelationship: string
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 10px rgba(45,27,14,0.06)' }}>
      {/* Food photo */}
      <div style={{ position: 'relative', aspectRatio: '4/3', background: 'var(--cream2)', overflow: 'hidden' }}>
        <Link href={`/memory?token=${memory.token}`} style={{ display: 'block', height: '100%' }}>
          {memory.image_url
            ? <img src={memory.image_url} alt={memory.dish_name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>🍽️</div>
          }
        </Link>
        {/* Heart toggle */}
        <button
          type="button"
          onClick={onToggleFav}
          aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,255,255,0.9)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
            color: isFav ? 'var(--accent)' : 'var(--muted)',
          }}
        >
          {isFav ? '♥' : '♡'}
        </button>
      </div>

      <div style={{ padding: '0.85rem' }}>
        {/* Name */}
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.98rem', color: 'var(--text)', marginBottom: '0.55rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {memory.dish_name ?? 'Untitled'}
        </p>

        {/* Narrator row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-light)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid var(--border)' }}>
            {narratorPhoto
              ? <img src={narratorPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)' }}>{(memory.narrator ?? '?')[0]?.toUpperCase()}</span>
            }
          </div>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text2)' }}>{memory.narrator ?? 'Narrator'}</span>
          {narratorRelationship && (
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-light)', borderRadius: 20, padding: '0.15rem 0.5rem', border: '1px solid rgba(196,82,42,0.15)' }}>
              {narratorRelationship}
            </span>
          )}
        </div>

        {/* Memory count */}
        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '0.65rem' }}>1 memory</p>

        {/* View recipe */}
        <Link
          href={`/memory?token=${memory.token}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none', color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 600 }}
        >
          <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem' }}>▶</div>
          View recipe
        </Link>
      </div>
    </div>
  )
}

// ─── Hero illustration ────────────────────────────────────────────────────
function HeroIllustration() {
  return (
    <div style={{ position: 'relative', width: 240, height: 160, flexShrink: 0 }}>
      {/* Floating hearts */}
      <span style={{ position: 'absolute', top: 0, right: 30, fontSize: '0.75rem', color: 'var(--accent)', opacity: 0.7 }}>♥</span>
      <span style={{ position: 'absolute', top: 20, right: 10, fontSize: '0.5rem', color: '#F4A261', opacity: 0.8 }}>♥</span>
      {/* Book */}
      <div style={{ position: 'absolute', bottom: 10, left: 0, width: 120, height: 110, background: '#FDF5ED', border: '1px solid #E8C9A8', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(45,27,14,0.1)', padding: '0.75rem' }}>
        <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.5, textAlign: 'center' }}>
          Made with<br />love.<br />Shared with<br />memories.
        </p>
        <span style={{ color: 'var(--accent)', fontSize: '0.8rem', marginTop: '0.25rem' }}>♡</span>
      </div>
      {/* Grandmother portrait */}
      <div style={{ position: 'absolute', top: 10, right: 10, width: 90, height: 100, borderRadius: 8, background: 'linear-gradient(135deg, #F5E6D8 0%, #E8C9A8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', boxShadow: '0 4px 12px rgba(45,27,14,0.1)', overflow: 'hidden' }}>
        👵
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function MemoriesPage() {
  const searchParams = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const narratorParam = searchParams.get('narrator') ?? ''

  const [memories, setMemories] = useState<Memory[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All')
  const [sort, setSort] = useState('Recently added')
  const [favTick, setFavTick] = useState(0)

  useEffect(() => {
    Promise.all([api.recipes.list(), api.people.list().catch(() => [])])
      .then(([m, p]) => { setMemories(m as Memory[]); setPeople(p as Person[]) })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const favTokens = useMemo(() => readFavorites(), [favTick])

  const toggleFav = useCallback((token: string) => {
    const set = new Set(readFavorites())
    if (set.has(token)) set.delete(token); else set.add(token)
    localStorage.setItem('rk_favorites', JSON.stringify([...set]))
    setFavTick(x => x + 1)
  }, [])

  const peopleMap = useMemo(() => {
    const map: Record<string, { photo: string; relationship: string }> = {}
    for (const p of people) map[p.name.toLowerCase()] = { photo: p.photo_url ?? '', relationship: p.relationship ?? '' }
    return map
  }, [people])

  const displayed = useMemo(() => {
    let list = [...memories]
    // Narrator filter from ?narrator= param (coming from Our People page)
    if (narratorParam) list = list.filter(m => (m.narrator ?? '').toLowerCase() === narratorParam.toLowerCase())
    // Search
    if (q) list = list.filter(m => (m.dish_name ?? '').toLowerCase().includes(q.toLowerCase()) || (m.narrator ?? '').toLowerCase().includes(q.toLowerCase()))
    // Filter
    if (filter === 'Favorites') list = list.filter(m => favTokens.includes(m.token))
    else if (filter === 'Recently added') list = list.slice().sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
    // Sort
    if (sort === 'Recently added') list = list.slice().sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
    else if (sort === 'Oldest first') list = list.slice().sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
    else if (sort === 'A–Z') list = list.slice().sort((a, b) => (a.dish_name ?? '').localeCompare(b.dish_name ?? ''))
    return list
  }, [memories, filter, sort, q, narratorParam, favTick])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--muted)' }}>Loading…</div>
  if (error) return <div style={{ padding: '2rem', color: 'var(--accent)' }}>{error}</div>

  return (
    <div style={{ padding: '1.5rem 1.75rem 2.5rem' }}>
      <style>{`
        .rk-mem-wrap { max-width: 1200px; margin: 0 auto; }
        .rk-mem-cols { display: grid; grid-template-columns: 1fr; gap: 1.25rem; }
        @media (min-width: 860px) { .rk-mem-cols { grid-template-columns: 1fr 272px; align-items: start; } }
        .rk-recipe-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
        @media (min-width: 640px) { .rk-recipe-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 900px) { .rk-recipe-grid { grid-template-columns: repeat(4, 1fr); } }
      `}</style>

      <div className="rk-mem-wrap">
        <div className="rk-mem-cols">
          {/* ── Main ── */}
          <div>
            {/* Hero */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.6rem, 3vw, 2rem)', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  All Recipes <span style={{ color: 'var(--accent)' }}>♡</span>
                </h1>
                <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.6, maxWidth: 360 }}>
                  Timeless recipes, lovingly shared by the people who made our moments special.
                </p>
              </div>
              <HeroIllustration />
            </div>

            {/* Count + sort bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.65rem 1rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text2)' }}>{displayed.length} Recipe{displayed.length !== 1 ? 's' : ''}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                Sort by:
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value)}
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.25rem 0.55rem', fontSize: '0.78rem', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer' }}
                >
                  {SORT_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </label>
            </div>

            {/* Grid */}
            {displayed.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: 14, border: '1px dashed var(--border)', fontSize: '0.88rem' }}>
                {q ? `No recipes matching "${q}"` : filter === 'Favorites' ? 'No favorites yet — heart a recipe to add it here.' : 'No recipes yet.'}
                {' '}<Link href="/capture" style={{ color: 'var(--accent)', fontWeight: 600 }}>Capture the first one</Link>
              </div>
            ) : (
              <div className="rk-recipe-grid">
                {displayed.map(m => {
                  const info = peopleMap[m.narrator?.toLowerCase() ?? ''] ?? { photo: '', relationship: '' }
                  return (
                    <RecipeCard
                      key={m.token}
                      memory={m}
                      isFav={favTokens.includes(m.token)}
                      onToggleFav={() => toggleFav(m.token)}
                      narratorPhoto={info.photo}
                      narratorRelationship={info.relationship}
                    />
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Right panel ── */}
          <RightPanel filter={filter} setFilter={setFilter} sort={sort} setSort={setSort} />
        </div>

        {/* ── Full-width bottom CTA ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          marginTop: '1.75rem',
          background: 'var(--cream)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          padding: '1.35rem 1.75rem',
          flexWrap: 'wrap',
        }}>
          {/* Illustration */}
          <div style={{
            width: 70,
            height: 70,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #FAE8D4 0%, #F0C9A0 100%)',
            border: '2px solid #E8C9A8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            flexShrink: 0,
            boxShadow: '0 4px 12px rgba(45,27,14,0.1)',
          }}>
            🥘
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)', marginBottom: '0.3rem' }}>
              Have a family recipe to add?
            </p>
            <p style={{ fontSize: '0.83rem', color: 'var(--muted)', lineHeight: 1.55 }}>
              Record it, write it or upload it. Keep your family&apos;s stories and flavors alive for generations to come.
            </p>
          </div>

          {/* Button */}
          <Link
            href="/capture"
            style={{
              background: 'var(--accent)',
              color: 'white',
              textDecoration: 'none',
              padding: '0.7rem 1.4rem',
              borderRadius: 12,
              fontSize: '0.88rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              boxShadow: '0 3px 10px rgba(196,82,42,0.25)',
            }}
          >
            + Add Recipe
          </Link>
        </div>
      </div>
    </div>
  )
}
