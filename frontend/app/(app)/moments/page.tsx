'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api, type Person } from '@/lib/api'
import { readFavorites, toggleFavorite } from '@/lib/favorites'
import FavoriteHeart from '@/components/FavoriteHeart'
import { SkeletonCard } from '@/components/Skeleton'
type Memory = {
  token: string
  title: string | null
  narrator: string | null
  recorded_at: string
  image_url: string | null
  tags: string[] | null
  type?: string | null
  portal_visible?: boolean
}

const SORT_OPTIONS = ['Recently added', 'Oldest first', 'A–Z']
const MOMENT_CATEGORIES = ['Song', 'Story', 'Fable', 'Wisdom', 'Poem', 'Other']
const KNOWN_MOMENT_TYPES = ['song', 'story', 'fable', 'wisdom', 'poem']

function isAudio(m: Memory) { return (m.tags ?? []).some(t => t === 'tale' || t === 'audio') }

const WA_ICON = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="white" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

function CardShareButton({ token, title, type, top = 8, right = 38 }: { token: string; title: string | null; type?: string | null; top?: number; right?: number }) {
  const emoji = type === 'song' ? '🎵' : type === 'story' ? '📖' : type === 'poem' ? '🖊️' : type === 'wisdom' ? '🙏' : type === 'fable' ? '✨' : '🎙️'
  return (
    <button
      type="button"
      onClick={e => {
        e.preventDefault()
        const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://www.theechoesofhome.com'}/memory?token=${token}`
        window.open(`https://wa.me/?text=${encodeURIComponent(`${emoji} "${title ?? 'this moment'}" on Echoes of Home:\n${shareUrl}`)}`, '_blank')
      }}
      title="Share on WhatsApp"
      style={{
        position: 'absolute', top, right,
        width: 26, height: 26, borderRadius: '50%',
        background: '#25D366', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)', zIndex: 2,
      }}
    >
      {WA_ICON}
    </button>
  )
}

// ─── Bookmark toggle ──────────────────────────────────────────────────────
function BookmarkToggle({ inCollection, onToggle }: { inCollection: boolean; onToggle: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onToggle}
      title={inCollection ? 'Remove from Family Collection' : 'Add to Family Collection'}
      style={{
        position: 'absolute', top: 8, left: 8, width: 26, height: 26, borderRadius: '50%',
        background: inCollection ? 'var(--accent)' : 'rgba(255,255,255,0.9)',
        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.15)', zIndex: 2, transition: 'background 0.15s',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={inCollection ? 'white' : 'var(--accent)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
      </svg>
    </button>
  )
}

// ─── Equalizer placeholder ────────────────────────────────────────────────
// 9 bars that go up and down from a centre axis independently (not connected)
const EQ_BARS = [13, 19, 25, 29, 31, 29, 25, 19, 13] // half-heights

function EqualizerPlaceholder() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg, #120F07 0%, #1C1810 60%, #110E06 100%)' }}>
      <svg viewBox="0 0 100 80" xmlns="http://www.w3.org/2000/svg" style={{ width: '88%', maxWidth: 220 }}>
        {/* Faint centre axis */}
        <line x1="4" y1="40" x2="96" y2="40" stroke="rgba(200,146,74,0.18)" strokeWidth="0.6"/>
        {EQ_BARS.map((halfH, i) => (
          <rect
            key={i}
            className="rk-eq-bar"
            x={7 + i * 10}
            y={40 - halfH}
            width={5}
            height={halfH * 2}
            rx={2}
            fill={i === 4 ? '#E0B070' : '#C8924A'}
            opacity={0.88}
            style={{ animationDelay: `${i * 0.13}s` }}
          />
        ))}
      </svg>
    </div>
  )
}

// ─── Audio card ───────────────────────────────────────────────────────────
function AudioCard({
  memory,
  isFav,
  onToggleFav,
  inCollection,
  onToggleCollection,
  narratorPhoto,
}: {
  memory: Memory
  isFav: boolean
  onToggleFav: () => void
  inCollection: boolean
  onToggleCollection: () => void
  narratorPhoto: string
}) {
  return (
    <div className="rk-card-hoverable" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 10px rgba(45,27,14,0.06), 0 0 22px rgba(24,107,94,0.14)', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Equalizer thumbnail */}
      <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden', flexShrink: 0 }}>
        <Link href={`/memory?token=${memory.token}&from=moments`} style={{ display: 'block', height: '100%' }}>
          <EqualizerPlaceholder />
        </Link>
        <CardShareButton token={memory.token} title={memory.title} type={memory.type} top={8} right={38} />
        <BookmarkToggle inCollection={inCollection} onToggle={e => { e.preventDefault(); onToggleCollection() }} />
        <FavoriteHeart
          favorite={isFav}
          onToggle={onToggleFav}
          size="0.85rem"
          style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}
        />
      </div>

      <div style={{ padding: '0.85rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.98rem', color: 'var(--text)', marginBottom: '0.55rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {memory.title ?? 'Untitled'}
        </p>
        {memory.narrator && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.4rem', overflow: 'hidden' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-light)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid var(--border)' }}>
              {narratorPhoto
                ? <img src={narratorPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)' }}>{memory.narrator[0]?.toUpperCase()}</span>
              }
            </div>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', minWidth: 0 }}>{memory.narrator}</span>
          </div>
        )}

        {/* Listen link — pinned to bottom, mirrors "View memory" on recipe cards */}
        <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
          <Link
            href={`/memory?token=${memory.token}&from=moments`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none', color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 600 }}
          >
            <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem' }}>▶</div>
            Listen to memory
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Right panel ──────────────────────────────────────────────────────────
function RightPanel() {
  const items = [
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/>
        </svg>
      ),
      title: 'Hear them again',
      desc: 'A voice carries warmth, laughter, and love in a way text never can.',
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
      ),
      title: 'Keep traditions alive',
      desc: 'Save lullabies, blessings, stories, and songs for the next generation.',
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
        </svg>
      ),
      title: 'Pass home forward',
      desc: 'Give your family a living keepsake they can return to again and again.',
    },
  ]

  return (
    <aside>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.25rem', marginBottom: '1rem' }}>
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: '1rem' }}>
          Why preserve moments?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--accent)' }}>
                {item.icon}
              </div>
              <div>
                <p style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.15rem' }}>{item.title}</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'linear-gradient(135deg, var(--gold-light) 0%, #EAD9AE 100%)', border: '1px solid #E8C9A8', borderRadius: 16, padding: '1.25rem' }}>
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', marginBottom: '0.5rem' }}>
          Record a voice
        </p>
        <p style={{ fontSize: '0.78rem', color: 'var(--text2)', lineHeight: 1.55, marginBottom: '0.85rem' }}>
          Ask a family member to share a song, story, or memory. You&rsquo;ll keep it forever.
        </p>
        <Link
          href="/capture?mode=direct"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            background: 'var(--accent)', color: 'white', textDecoration: 'none',
            padding: '0.55rem 1.1rem', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700,
            boxShadow: '0 3px 10px rgba(24,107,94,0.28)',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
          </svg>
          Start recording
        </Link>
      </div>
    </aside>
  )
}

// ─── Hero illustration ─────────────────────────────────────────────────────
function HeroIllustration() {
  return (
    <>
      <style>{`
        .rk-moments-hero-img-wrap {
          width: clamp(200px, 30vw, 340px);
          flex-shrink: 0;
          border-radius: 16px;
          overflow: hidden;
          height: 160px;
          box-shadow: 0 0 32px rgba(24,107,94,0.22);
        }
        @media (max-width: 600px) {
          .rk-moments-hero-img-wrap {
            width: 100%;
            height: 180px;
            border-radius: 12px;
          }
        }
      `}</style>
      <div className="rk-moments-hero-img-wrap">
        <img
          src="/hero-memories.png"
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '65% 45%' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </div>
    </>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function MomentsPage() {
  const searchParams = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const narratorParam = searchParams.get('narrator') ?? ''
  const collectionParam = searchParams.get('collection')

  const [memories, setMemories] = useState<Memory[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quickFilter, setQuickFilter] = useState<'All' | 'Favorites' | 'Family Collection'>(
    collectionParam === '1' ? 'Family Collection' : 'All'
  )
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sort, setSort] = useState('Recently added')
  const [favTick, setFavTick] = useState(0)
  const [collectionSet, setCollectionSet] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([api.recipes.list(), api.people.list().catch(() => [])])
      .then(([m, p]) => {
        const mems = (m as Memory[]).filter(isAudio)
        setMemories(mems)
        setPeople(p as Person[])
        setCollectionSet(new Set(mems.filter(x => x.portal_visible).map(x => x.token)))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const favTokens = useMemo(() => readFavorites(), [favTick])

  const toggleFav = useCallback((token: string) => {
    toggleFavorite(token)
    setFavTick(x => x + 1)
  }, [])

  const toggleCollection = useCallback(async (token: string) => {
    const next = new Set(collectionSet)
    const adding = !next.has(token)
    if (adding) next.add(token); else next.delete(token)
    setCollectionSet(next)
    try { await api.recipes.patch(token, { portal_visible: adding }) }
    catch { setCollectionSet(collectionSet) }
  }, [collectionSet])

  const peopleMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of people) map[p.name.toLowerCase()] = p.photo_url ?? ''
    return map
  }, [people])

  const displayed = useMemo(() => {
    let list = [...memories]
    const ql = q.toLowerCase()
    if (narratorParam) {
      list = list.filter(m => (m.narrator ?? '').toLowerCase() === narratorParam.toLowerCase())
    } else if (ql) {
      list = list.filter(m =>
        (m.title ?? '').toLowerCase().includes(ql) ||
        (m.narrator ?? '').toLowerCase().includes(ql)
      )
    }
    if (quickFilter === 'Favorites') list = list.filter(m => favTokens.includes(m.token))
    else if (quickFilter === 'Family Collection') list = list.filter(m => collectionSet.has(m.token))
    if (categoryFilter) {
      if (categoryFilter === 'Other') {
        list = list.filter(m => !KNOWN_MOMENT_TYPES.includes(m.type ?? ''))
      } else {
        list = list.filter(m => m.type === categoryFilter.toLowerCase())
      }
    }
    if (sort === 'Recently added') list = list.slice().sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
    else if (sort === 'Oldest first') list = list.slice().sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
    else if (sort === 'A–Z') list = list.slice().sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
    return list
  }, [memories, quickFilter, categoryFilter, sort, q, narratorParam, favTick])

  if (loading) return (
    <div style={{ padding: '1.5rem 1.75rem 2.5rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
        {Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
  if (error) return <div style={{ padding: '2rem', color: 'var(--accent)' }}>{error}</div>

  return (
    <div style={{ padding: '1.5rem 1.75rem 2.5rem' }}>
      <style>{`
        .rk-moments-wrap { max-width: 1200px; margin: 0 auto; }
        .rk-moments-cols { display: grid; grid-template-columns: 1fr; gap: 1.25rem; }
        .rk-moments-cols > * { min-width: 0; }
        @media (min-width: 860px) { .rk-moments-cols { grid-template-columns: 1fr 272px; align-items: start; } }
        .rk-moments-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
        @media (min-width: 640px) { .rk-moments-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (min-width: 900px) { .rk-moments-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        @keyframes rk-eq-bounce {
          0%, 100% { transform: scaleY(0.18); }
          50%       { transform: scaleY(1); }
        }
        .rk-eq-bar {
          animation: rk-eq-bounce 1.3s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
      `}</style>

      <div className="rk-moments-wrap">
        <div className="rk-moments-cols">
          {/* ── Main ── */}
          <div>
            {/* Hero */}
            {narratorParam ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.6rem, 3vw, 2rem)', fontWeight: 700, color: 'var(--text)', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {narratorParam}&rsquo;s moments <span style={{ color: 'var(--muted)' }}>♡</span>
                  </h1>
                  <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.6, maxWidth: 380 }}>
                    Songs, stories, and voices saved from {narratorParam}.
                  </p>
                </div>
                <HeroIllustration />
              </div>
            ) : q ? (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.4rem, 3vw, 1.8rem)', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                    Results for <span style={{ color: 'var(--accent)' }}>&ldquo;{q}&rdquo;</span>
                  </h1>
                </div>
                <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                  Searching moments across all narrators.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)', fontWeight: 700, color: 'var(--text)', margin: '0 0 0.55rem', lineHeight: 1.15, display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    Moments <span style={{ color: 'var(--accent)' }}>✦</span>
                  </h1>
                  <p style={{ fontSize: '0.92rem', color: 'var(--muted)', lineHeight: 1.75, maxWidth: 440, marginBottom: '1.2rem' }}>
                    A song an aunt sang at a family gathering. A lullaby at bedtime. A story told on a rainy afternoon. Wisdom shared by someone who knew. That one conversation you never want to forget.<br /><br />
                    <span style={{ color: 'var(--text2)', fontStyle: 'italic' }}>Songs, tales, fables, wisdom. Every kind of moment, kept.</span>
                  </p>
                  <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <Link
                      href="/capture?mode=direct"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                        background: 'var(--accent)', color: 'white', textDecoration: 'none',
                        padding: '0.6rem 1.2rem', borderRadius: 12, fontSize: '0.88rem', fontWeight: 700,
                        boxShadow: '0 3px 10px rgba(24,107,94,0.28)',
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
                      </svg>
                      Record a voice
                    </Link>
                    <Link
                      href="/upload?mode=direct"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                        background: 'transparent', color: 'var(--accent)', textDecoration: 'none',
                        padding: '0.6rem 1.2rem', borderRadius: 12, fontSize: '0.88rem', fontWeight: 700,
                        border: '1.5px solid var(--accent)',
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                        <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
                      </svg>
                      Upload audio
                    </Link>
                    <Link
                      href="/upload?mode=direct#no-recording"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                        background: 'transparent', color: 'var(--accent)', textDecoration: 'none',
                        padding: '0.6rem 1.2rem', borderRadius: 12, fontSize: '0.88rem', fontWeight: 700,
                        border: '1.5px solid var(--accent)',
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                      </svg>
                      Add in words
                    </Link>
                  </div>
                </div>
                <HeroIllustration />
              </div>
            )}

            {/* Count + sort bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="2" y1="12" x2="4" y2="12"/><line x1="5" y1="8" x2="5" y2="16"/><line x1="8" y1="5" x2="8" y2="19"/><line x1="11" y1="9" x2="11" y2="15"/><line x1="14" y1="6" x2="14" y2="18"/><line x1="17" y1="10" x2="17" y2="14"/><line x1="20" y1="8" x2="20" y2="16"/><line x1="22" y1="12" x2="24" y2="12"/>
                </svg>
                {`${displayed.length} Moment${displayed.length !== 1 ? 's' : ''}`}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--muted)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M7 12h10M11 18h2"/>
                </svg>
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value)}
                  style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--sans)', padding: 0, appearance: 'none', WebkitAppearance: 'none' }}
                >
                  {SORT_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none', flexShrink: 0 }}>
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </div>
            </div>

            {/* Filter row */}
            {!q && !narratorParam && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
                {(['All', 'Favorites', 'Family Collection'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setQuickFilter(f)}
                    style={{
                      padding: '0.28rem 0.75rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600,
                      border: '1.5px solid', cursor: 'pointer', transition: 'all 0.15s',
                      borderColor: quickFilter === f ? (f === 'Favorites' ? 'var(--amber)' : 'var(--accent)') : 'var(--border)',
                      background: quickFilter === f ? (f === 'Favorites' ? 'var(--gold-light)' : 'var(--accent-light)') : 'transparent',
                      color: quickFilter === f ? (f === 'Favorites' ? 'var(--amber)' : 'var(--accent)') : 'var(--text2)',
                    }}
                  >
                    {f === 'Favorites' ? '♥ Favorites' : f === 'Family Collection' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                        </svg>
                        Family Collection
                      </span>
                    ) : 'All'}
                  </button>
                ))}
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  style={{
                    border: `1.5px solid ${categoryFilter ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 20, padding: '0.28rem 0.75rem', fontSize: '0.78rem', fontWeight: 600,
                    background: categoryFilter ? 'var(--accent-light)' : 'transparent',
                    color: categoryFilter ? 'var(--accent)' : 'var(--text2)',
                    cursor: 'pointer', fontFamily: 'var(--sans)',
                  }}
                >
                  <option value="">All types</option>
                  {MOMENT_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Grid */}
            {displayed.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: 14, border: '1px dashed var(--border)', fontSize: '0.88rem' }}>
                {q
                  ? `No moments matching "${q}"`
                  : quickFilter === 'Favorites'
                  ? 'No favorites yet. Heart one to add it here.'
                  : quickFilter === 'Family Collection'
                  ? 'No moments in your Family Collection yet.'
                  : narratorParam
                  ? `No moments saved for ${narratorParam} yet.`
                  : 'No moments yet.'}{' '}
                {!narratorParam && (
                  <Link href="/upload?mode=direct" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    Add the first one
                  </Link>
                )}
              </div>
            ) : (
              <div className="rk-moments-grid">
                {displayed.map(m => {
                  const photo = peopleMap[m.narrator?.toLowerCase() ?? ''] ?? ''
                  return (
                    <div key={m.token} style={{ position: 'relative', minWidth: 0 }}>
                      <AudioCard
                        memory={m}
                        isFav={favTokens.includes(m.token)}
                        onToggleFav={() => toggleFav(m.token)}
                        inCollection={collectionSet.has(m.token)}
                        onToggleCollection={() => toggleCollection(m.token)}
                        narratorPhoto={photo}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Right panel ── */}
          <RightPanel />
        </div>

        {/* Bottom CTA */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '1.5rem',
          marginTop: '1.75rem', background: 'var(--cream)',
          border: '1px solid var(--border)', borderRadius: 20,
          padding: '1.35rem 1.75rem', flexWrap: 'wrap',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--gold-light) 0%, #EAD9AE 100%)',
            border: '2px solid #E8C9A8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: '0 4px 12px rgba(45,27,14,0.1)',
          }}>
            <span style={{ fontSize: '1.6rem', color: 'var(--accent)', lineHeight: 1 }}>✦</span>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)', marginBottom: '0.3rem' }}>
              Have a moment worth keeping?
            </p>
            <p style={{ fontSize: '0.83rem', color: 'var(--muted)', lineHeight: 1.55 }}>
              Record it now or upload an audio file. Every voice deserves to be heard again.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <Link
              href="/capture?mode=direct"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                background: 'var(--accent)', color: 'white', textDecoration: 'none',
                padding: '0.6rem 1.25rem', borderRadius: 12, fontSize: '0.88rem', fontWeight: 700,
                boxShadow: '0 3px 10px rgba(24,107,94,0.28)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
              </svg>
              Record a memory
            </Link>
            <Link
              href="/upload?mode=direct"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                background: 'transparent', color: 'var(--accent)', textDecoration: 'none',
                padding: '0.6rem 1.25rem', borderRadius: 12, fontSize: '0.88rem', fontWeight: 700,
                border: '1.5px solid var(--accent)',
              }}
            >
              Upload audio
            </Link>
            <Link
              href="/upload?mode=direct#no-recording"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                background: 'transparent', color: 'var(--accent)', textDecoration: 'none',
                padding: '0.6rem 1.25rem', borderRadius: 12, fontSize: '0.88rem', fontWeight: 700,
                border: '1.5px solid var(--accent)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              Add in words
            </Link>
          </div>
          <svg aria-hidden width="90" height="90" viewBox="0 0 100 100" fill="none" style={{ position: 'absolute', right: 16, bottom: -10, opacity: 0.18, flexShrink: 0 }}>
            <circle cx="50" cy="50" r="12" fill="var(--accent)"/>
            <ellipse cx="50" cy="26" rx="6" ry="16" fill="var(--accent)" transform="rotate(0 50 50)"/>
            <ellipse cx="50" cy="26" rx="6" ry="16" fill="var(--accent)" transform="rotate(45 50 50)"/>
            <ellipse cx="50" cy="26" rx="6" ry="16" fill="var(--accent)" transform="rotate(90 50 50)"/>
            <ellipse cx="50" cy="26" rx="6" ry="16" fill="var(--accent)" transform="rotate(135 50 50)"/>
            <circle cx="50" cy="8" r="4" fill="var(--accent)"/>
            <circle cx="78" cy="22" r="4" fill="var(--accent)"/>
            <circle cx="78" cy="78" r="4" fill="var(--accent)"/>
            <circle cx="22" cy="78" r="4" fill="var(--accent)"/>
            <circle cx="22" cy="22" r="4" fill="var(--accent)"/>
          </svg>
        </div>
      </div>
    </div>
  )
}
