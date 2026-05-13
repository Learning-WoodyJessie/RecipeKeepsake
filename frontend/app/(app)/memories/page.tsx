// All Recipes page — aligned to Echoes of Home product mockup.
// Two-column: main (hero, count/sort, 4-col grid, CTA) | right (filter pills + why recipes matter).

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api, type Person } from '@/lib/api'
import { readFavorites, toggleFavorite } from '@/lib/favorites'

type Memory = {
  token: string
  dish_name: string | null
  narrator: string | null
  recorded_at: string
  image_url: string | null
  tags: string[] | null
}


const FILTER_TAGS = ['All', 'Favorites', 'Breakfast', 'Lunch', 'Sweets', 'Pickles', 'Snacks', 'Drinks', 'Recently added']
const SORT_OPTIONS = ['Recently added', 'Oldest first', 'A–Z']

function isAudio(m: Memory) { return (m.tags ?? []).includes('audio') }

// ─── Right panel ────────────────────────────────────────────────────────
function RightPanel({
  filter,
  setFilter,
  isAudioMode,
}: {
  filter: string
  setFilter: (f: string) => void
  sort: string
  setSort: (s: string) => void
  isAudioMode: boolean
}) {
  const WHY_AUDIO = [
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

  const WHY_RECIPE = [
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
      ),
      title: 'Share the love',
      desc: 'Pass down flavors and memories to the next generation.',
    },
  ]

  const WHY = isAudioMode ? WHY_AUDIO : WHY_RECIPE

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Filter box — recipes only */}
      {!isAudioMode && (
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
                  padding: '0.3rem 0.75rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 500,
                  border: '1.5px solid', cursor: 'pointer',
                  borderColor: filter === tag ? 'var(--accent)' : 'var(--border)',
                  background: filter === tag ? 'var(--accent-light)' : 'transparent',
                  color: filter === tag ? 'var(--accent)' : 'var(--text2)',
                  display: 'flex', alignItems: 'center', gap: '0.25rem',
                }}
              >
                {tag === 'Favorites' && '♡ '}{tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Audio filter — favorites only */}
      {isAudioMode && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.25rem', boxShadow: '0 4px 16px rgba(45,27,14,0.05)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
            {['All', 'Favorites'].map((tag) => (
              <button key={tag} onClick={() => setFilter(tag)}
                style={{
                  padding: '0.3rem 0.75rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 500,
                  border: '1.5px solid', cursor: 'pointer',
                  borderColor: filter === tag ? 'var(--accent)' : 'var(--border)',
                  background: filter === tag ? 'var(--accent-light)' : 'transparent',
                  color: filter === tag ? 'var(--accent)' : 'var(--text2)',
                }}
              >
                {tag === 'Favorites' ? '♡ Favorites' : tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Why panel */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.25rem', boxShadow: '0 4px 16px rgba(45,27,14,0.05)' }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          {isAudioMode ? 'Why voices matter' : 'Why recipes matter'}
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
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.25rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1.5rem', color: 'var(--accent)', lineHeight: 1, marginBottom: '0.5rem' }}>&ldquo;</p>
          <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '0.88rem', color: 'var(--text2)', lineHeight: 1.65, marginBottom: '0.65rem' }}>
            {isAudioMode
              ? 'Some memories are meant to be heard.'
              : 'A recipe is more than ingredients. It\'s a story we live and share.'}
          </p>
          <span style={{ color: 'var(--accent)', fontSize: '1rem' }}>♡</span>
        </div>
      </div>
    </aside>
  )
}

// ─── Audio card ──────────────────────────────────────────────────────────
function AudioCard({
  memory,
  isFav,
  onToggleFav,
  narratorPhoto,
}: {
  memory: Memory
  isFav: boolean
  onToggleFav: () => void
  narratorPhoto: string
}) {
  return (
    <Link
      href={`/memory?token=${memory.token}`}
      style={{ textDecoration: 'none', display: 'block', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 10px rgba(45,27,14,0.06)', transition: 'box-shadow 0.15s' }}
    >
      {/* Waveform banner */}
      <div style={{ position: 'relative', background: 'linear-gradient(135deg, #FAE8D4 0%, #F0C9A0 100%)', padding: '1.25rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 80 }}>
        {[4,7,11,9,14,10,6,13,8,11,6,9,12,7,5].map((h, i) => (
          <div key={i} style={{ width: 3, height: h * 3, borderRadius: 2, background: 'var(--accent)', opacity: 0.6 }} />
        ))}
        <div style={{ position: 'absolute', width: 40, height: 40, borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(45,27,14,0.15)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
        <button
          type="button"
          onClick={e => { e.preventDefault(); onToggleFav() }}
          style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', color: isFav ? 'var(--accent)' : 'var(--muted)' }}
        >
          {isFav ? '♥' : '♡'}
        </button>
      </div>

      <div style={{ padding: '0.85rem' }}>
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: '0.45rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {memory.dish_name ?? 'Untitled'}
        </p>
        {memory.narrator && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-light)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {narratorPhoto
                ? <img src={narratorPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--accent)' }}>{memory.narrator[0]?.toUpperCase()}</span>
              }
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text2)' }}>{memory.narrator}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
          <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: 0 }}>
            {new Date(memory.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          {/* WhatsApp share — pre-generate URL before open to satisfy iOS Safari */}
          <button
            type="button"
            onClick={e => {
              e.preventDefault()
              const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://www.theechoesofhome.com'}/memory?token=${memory.token}`
              const waUrl = `https://wa.me/?text=${encodeURIComponent(`🎵 "${memory.dish_name ?? 'this memory'}" on Echoes of Home:\n${shareUrl}`)}`
              window.open(waUrl, '_blank')
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.25rem',
              background: '#25D366', border: 'none', borderRadius: 6,
              padding: '0.25rem 0.55rem', cursor: 'pointer',
              fontSize: '0.7rem', fontWeight: 600, color: 'white',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="white" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Share
          </button>
        </div>
      </div>
    </Link>
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
    <>
      <style>{`
        .rk-mem-hero-img-wrap {
          width: clamp(200px, 30vw, 340px);
          flex-shrink: 0;
          border-radius: 16px;
          overflow: hidden;
          height: 160px;
        }
        @media (max-width: 600px) {
          .rk-mem-hero-img-wrap {
            width: 100%;
            height: 180px;
            border-radius: 12px;
          }
        }
      `}</style>
      <div className="rk-mem-hero-img-wrap">
        <img
          src="/hero-memories.png"
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: '65% 45%',
          }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </div>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function MemoriesPage() {
  const searchParams = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const narratorParam = searchParams.get('narrator') ?? ''
  const typeParam = searchParams.get('type') ?? ''

  const [memories, setMemories] = useState<Memory[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState(typeParam === 'audio' ? 'audio' : 'All')
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
    toggleFavorite(token)
    setFavTick(x => x + 1)
  }, [])

  const peopleMap = useMemo(() => {
    const map: Record<string, { photo: string; relationship: string }> = {}
    for (const p of people) map[p.name.toLowerCase()] = { photo: p.photo_url ?? '', relationship: p.relationship ?? '' }
    return map
  }, [people])

  const isAudioMode = typeParam === 'audio'

  const displayed = useMemo(() => {
    let list = [...memories]
    // Separate recipe vs audio — never mix them
    if (isAudioMode) list = list.filter(isAudio)
    else list = list.filter(m => !isAudio(m))
    // Narrator filter from ?narrator= param (coming from Our People page)
    if (narratorParam) list = list.filter(m => (m.narrator ?? '').toLowerCase() === narratorParam.toLowerCase())
    // Search
    if (q) list = list.filter(m => (m.dish_name ?? '').toLowerCase().includes(q.toLowerCase()) || (m.narrator ?? '').toLowerCase().includes(q.toLowerCase()))
    // Filter
    if (filter === 'Favorites') list = list.filter(m => favTokens.includes(m.token))
    else if (filter === 'Recently added') list = list.slice().sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
    else if (filter !== 'All') list = list.filter(m => (m.tags ?? []).includes(filter))
    // Sort
    if (sort === 'Recently added') list = list.slice().sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
    else if (sort === 'Oldest first') list = list.slice().sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
    else if (sort === 'A–Z') list = list.slice().sort((a, b) => (a.dish_name ?? '').localeCompare(b.dish_name ?? ''))
    return list
  }, [memories, filter, sort, q, narratorParam, favTick, isAudioMode])

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
            {isAudioMode ? (
              /* ── Audio hero ── */
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)', fontWeight: 700, color: 'var(--text)', margin: '0 0 0.55rem', lineHeight: 1.15, display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    Tales &amp; Songs <span style={{ color: 'var(--accent)' }}>♪</span>
                  </h1>
                  <p style={{ fontSize: '0.92rem', color: 'var(--muted)', lineHeight: 1.65, maxWidth: 380, marginBottom: '1.2rem' }}>
                    A song. A story. A moment worth keeping.<br />
                    Saved forever, for the people who love it.
                  </p>
                  <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <Link
                      href="/capture"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                        background: 'var(--accent)', color: 'white', textDecoration: 'none',
                        padding: '0.6rem 1.2rem', borderRadius: 12, fontSize: '0.88rem', fontWeight: 700,
                        boxShadow: '0 3px 10px rgba(196,82,42,0.28)',
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
                      </svg>
                      Record Audio
                    </Link>
                    <Link
                      href="/upload"
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
                      Upload Audio
                    </Link>
                  </div>
                </div>
                <HeroIllustration />
              </div>
            ) : (
              /* ── Recipe hero ── */
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.6rem, 3vw, 2rem)', fontWeight: 700, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      All Recipes <span style={{ color: 'var(--accent)' }}>♡</span>
                    </h1>
                    <Link href="/capture" style={{ background: 'var(--accent)', color: 'white', textDecoration: 'none', padding: '0.45rem 1rem', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 2px 8px rgba(196,82,42,0.22)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      + Add Recipe
                    </Link>
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.6, maxWidth: 360 }}>
                    Timeless recipes, lovingly shared by the people who made our moments special.
                  </p>
                </div>
                <HeroIllustration />
              </div>
            )}

            {/* Count + sort bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.65rem 1rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {isAudioMode && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="2" y1="12" x2="4" y2="12"/><line x1="5" y1="8" x2="5" y2="16"/><line x1="8" y1="5" x2="8" y2="19"/><line x1="11" y1="9" x2="11" y2="15"/><line x1="14" y1="6" x2="14" y2="18"/><line x1="17" y1="10" x2="17" y2="14"/><line x1="20" y1="8" x2="20" y2="16"/><line x1="22" y1="12" x2="24" y2="12"/>
                  </svg>
                )}
                {displayed.length} {isAudioMode ? `Memory${displayed.length !== 1 ? 'ies' : ''}` : `Recipe${displayed.length !== 1 ? 's' : ''}`}
              </span>
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
                {q
                  ? `No ${isAudioMode ? 'recordings' : 'recipes'} matching "${q}"`
                  : filter === 'Favorites'
                  ? 'No favorites yet — heart one to add it here.'
                  : isAudioMode ? 'No recordings yet.' : 'No recipes yet.'}
                {' '}
                <Link href={isAudioMode ? '/upload' : '/capture'} style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  {isAudioMode ? 'Upload the first one' : 'Capture the first one'}
                </Link>
              </div>
            ) : (
              <div className="rk-recipe-grid">
                {displayed.map(m => {
                  const info = peopleMap[m.narrator?.toLowerCase() ?? ''] ?? { photo: '', relationship: '' }
                  return isAudioMode ? (
                    <AudioCard
                      key={m.token}
                      memory={m}
                      isFav={favTokens.includes(m.token)}
                      onToggleFav={() => toggleFav(m.token)}
                      narratorPhoto={info.photo}
                    />
                  ) : (
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
          <RightPanel filter={filter} setFilter={setFilter} sort={sort} setSort={setSort} isAudioMode={isAudioMode} />
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
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: 'linear-gradient(135deg, #FAE8D4 0%, #F0C9A0 100%)',
            border: '2px solid #E8C9A8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: '0 4px 12px rgba(45,27,14,0.1)',
          }}>
            {isAudioMode
              ? <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              : <span style={{ fontSize: '1.75rem' }}>🥘</span>
            }
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)', marginBottom: '0.3rem' }}>
              {isAudioMode ? 'Have a tale or song to preserve?' : 'Have a family recipe to add?'}
            </p>
            <p style={{ fontSize: '0.83rem', color: 'var(--muted)', lineHeight: 1.55 }}>
              {isAudioMode
                ? 'Record it now or upload an audio file. Keep the voice. Keep the feeling.'
                : 'Record it, write it or upload it. Keep your family\'s stories and flavors alive for generations to come.'}
            </p>
          </div>
          {/* Decorative floral — audio mode only */}
          {isAudioMode && (
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
          )}
        </div>
      </div>
    </div>
  )
}
