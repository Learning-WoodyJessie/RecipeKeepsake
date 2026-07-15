'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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

function isAudio(m: Memory) { return (m.tags ?? []).some(t => t === 'tale' || t === 'audio') }

const WA_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.107.549 4.087 1.508 5.814L.057 23.858a.5.5 0 00.608.637l6.265-1.648A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.016-1.374l-.36-.213-3.724.977.996-3.624-.234-.374A9.818 9.818 0 1112 21.818z"/>
  </svg>
)

function CardShareButton({ token, title, type, top = 8, right = 38 }: { token: string; title: string | null; type?: string | null; top?: number; right?: number }) {
  const text = title ? `${title} — shared from Echoes of Home` : 'Shared from Echoes of Home'
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/memory?token=${token}`
  const waUrl = `https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`
  return (
    <button
      type="button"
      title="Share on WhatsApp"
      onClick={e => { e.preventDefault(); window.open(waUrl, '_blank') }}
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

function BookmarkToggle({ inCollection, onToggle }: { inCollection: boolean; onToggle: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
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

// ─── Animated bowl placeholder ───────────────────────────────────────────
function BowlPlaceholder({ token }: { token: string }) {
  let h = 0
  for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) & 0xffffff
  const base = (h % 36) / 10
  const d1 = `${base}s`, d2 = `${base + 0.32}s`, d3 = `${base + 0.64}s`
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(140deg, #F5EBD6 0%, #ECD9AE 100%)' }}>
      <svg viewBox="0 0 100 88" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '36%', maxWidth: 90, overflow: 'visible' }}>
        <path className="rk-bowl-steam" style={{ animationDelay: d1 }} d="M 36 36 C 32 27 40 20 36 11 C 33 4 39 -1 36 -7" stroke="rgba(120,74,20,0.4)" strokeWidth="2.3" strokeLinecap="round"/>
        <path className="rk-bowl-steam" style={{ animationDelay: d2 }} d="M 50 33 C 46 24 54 17 50 8 C 47 1 53 -4 50 -10" stroke="rgba(120,74,20,0.4)" strokeWidth="2.3" strokeLinecap="round"/>
        <path className="rk-bowl-steam" style={{ animationDelay: d3 }} d="M 64 36 C 60 27 68 20 64 11 C 61 4 67 -1 64 -7" stroke="rgba(120,74,20,0.4)" strokeWidth="2.3" strokeLinecap="round"/>
        <ellipse cx="50" cy="83" rx="24" ry="5" fill="rgba(100,60,10,0.12)"/>
        <path d="M 14 40 Q 12 70 30 78 Q 50 85 70 78 Q 88 70 86 40" fill="#C8924A"/>
        <path d="M 14 40 Q 12 64 26 74 Q 20 58 18 40 Z" fill="rgba(255,220,150,0.15)"/>
        <ellipse cx="50" cy="40" rx="36" ry="9.5" fill="#D4A060"/>
        <ellipse cx="50" cy="40" rx="29" ry="7.5" fill="#A86B22"/>
        <ellipse cx="50" cy="40" rx="24" ry="5.8" fill="#D4960E" opacity="0.85"/>
        <ellipse cx="44" cy="38.5" rx="8" ry="2.5" fill="rgba(255,230,120,0.3)"/>
        <path d="M 32 78 Q 32 84 50 84 Q 68 84 68 78" fill="#A86222"/>
        <ellipse cx="50" cy="84" rx="18" ry="4" fill="#B87030"/>
        <g className="rk-bowl-lid" style={{ animationDelay: d1 }}>
          <path d="M 16 40 Q 16 10 50 6 Q 84 10 84 40" fill="#D4A060"/>
          <path d="M 16 40 Q 20 14 50 10 Q 24 12 18 40 Z" fill="rgba(255,220,150,0.15)"/>
          <path d="M 84 40 Q 80 14 50 10 Q 76 12 82 40 Z" fill="rgba(100,60,10,0.08)"/>
          <ellipse cx="50" cy="40" rx="36" ry="9.5" fill="#C8924A"/>
          <ellipse cx="50" cy="40" rx="36" ry="9.5" fill="none" stroke="#E0B070" strokeWidth="1"/>
          <ellipse cx="50" cy="40" rx="30" ry="7.8" fill="#B8801E"/>
          <ellipse cx="50" cy="7" rx="7" ry="3.5" fill="#B87030"/>
          <ellipse cx="50" cy="5.5" rx="5.5" ry="4" fill="#D4A060"/>
          <ellipse cx="50" cy="5.5" rx="3.5" ry="2.5" fill="#E0B878"/>
        </g>
      </svg>
    </div>
  )
}

// ─── Equalizer placeholder ────────────────────────────────────────────────
const EQ_BARS = [13, 19, 25, 29, 31, 29, 25, 19, 13]

function EqualizerPlaceholder() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(140deg, #EEF3F0 0%, #DDE8E2 100%)' }}>
      <svg viewBox="0 0 100 80" xmlns="http://www.w3.org/2000/svg" style={{ width: '58%', maxWidth: 150 }}>
        <line x1="4" y1="40" x2="96" y2="40" stroke="rgba(24,107,94,0.2)" strokeWidth="0.6"/>
        {EQ_BARS.map((halfH, i) => (
          <rect
            key={i}
            className="rk-eq-bar"
            x={7 + i * 10}
            y={40 - halfH}
            width={5}
            height={halfH * 2}
            rx={2}
            fill={i === 4 ? '#9EC4B8' : '#82AFA1'}
            opacity={i === 4 ? 0.95 : 0.8}
            style={{ animationDelay: `${i * 0.13}s` }}
          />
        ))}
      </svg>
    </div>
  )
}

// ─── Cards ────────────────────────────────────────────────────────────────
function RecipeCard({ memory, isFav, onToggleFav, inCollection, onToggleCollection, narratorPhoto, narratorRelationship }: {
  memory: Memory; isFav: boolean; onToggleFav: () => void
  inCollection: boolean; onToggleCollection: () => void
  narratorPhoto: string; narratorRelationship: string
}) {
  return (
    <div className="rk-card-hoverable" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 10px rgba(45,27,14,0.06)', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden', flexShrink: 0 }}>
        <Link href={`/memory?token=${memory.token}`} style={{ display: 'block', height: '100%' }}>
          {memory.image_url
            ? <img src={memory.image_url} alt={memory.title ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <BowlPlaceholder token={memory.token} />
          }
        </Link>
        <CardShareButton token={memory.token} title={memory.title} type={memory.type} top={8} right={38} />
        <BookmarkToggle inCollection={inCollection} onToggle={e => { e.preventDefault(); onToggleCollection() }} />
        <FavoriteHeart favorite={isFav} onToggle={onToggleFav} size="0.85rem"
          style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}
        />
      </div>
      <div style={{ padding: '0.85rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.98rem', color: 'var(--text)', marginBottom: '0.55rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {memory.title ?? 'Untitled'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.4rem', overflow: 'hidden' }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-light)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid var(--border)' }}>
            {narratorPhoto
              ? <img src={narratorPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)' }}>{(memory.narrator ?? '?')[0]?.toUpperCase()}</span>
            }
          </div>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', minWidth: 0 }}>{memory.narrator ?? 'Narrator'}</span>
          {narratorRelationship && (
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-light)', borderRadius: 20, padding: '0.15rem 0.5rem', border: '1px solid rgba(24,107,94,0.15)', flexShrink: 0 }}>
              {narratorRelationship}
            </span>
          )}
        </div>
        <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
          <Link href={`/memory?token=${memory.token}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none', color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 600 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem' }}>▶</div>
            View memory
          </Link>
        </div>
      </div>
    </div>
  )
}

function MomentCard({ memory, isFav, onToggleFav, inCollection, onToggleCollection, narratorPhoto }: {
  memory: Memory; isFav: boolean; onToggleFav: () => void
  inCollection: boolean; onToggleCollection: () => void
  narratorPhoto: string
}) {
  return (
    <Link href={`/memory?token=${memory.token}`} className="rk-card-hoverable"
      style={{ textDecoration: 'none', display: 'block', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 10px rgba(45,27,14,0.06)' }}
    >
      <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden', flexShrink: 0 }}>
        <EqualizerPlaceholder />
        <CardShareButton token={memory.token} title={memory.title} type={memory.type} top={8} right={38} />
        <BookmarkToggle inCollection={inCollection} onToggle={e => { e.preventDefault(); onToggleCollection() }} />
        <FavoriteHeart favorite={isFav} onToggle={onToggleFav} size="0.85rem"
          style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.9)' }}
        />
      </div>
      <div style={{ padding: '0.85rem' }}>
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: '0.45rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {memory.title ?? 'Untitled'}
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
        <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '0.5rem 0 0' }}>
          {new Date(memory.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────
type TypeTab = 'All' | 'Recipes' | 'Moments'

export default function SearchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const typeParam = (searchParams.get('kind') ?? 'All') as TypeTab
  // See AppTopBar's navigate() — records the page you searched from, since
  // router.back() can't be relied on here (search navigates via replace()).
  const backHref = (typeof window !== 'undefined' && sessionStorage.getItem('searchOrigin')) || '/recipes'

  const [memories, setMemories] = useState<Memory[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<TypeTab>(typeParam)
  const [sort, setSort] = useState('Recently added')
  const [favTick, setFavTick] = useState(0)
  const [collectionSet, setCollectionSet] = useState<Set<string>>(new Set())

  useEffect(() => {
    setActiveTab(typeParam)
  }, [typeParam])

  useEffect(() => {
    Promise.all([api.recipes.list(), api.people.list().catch(() => [])])
      .then(([m, p]) => {
        const mems = m as Memory[]
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
    const map: Record<string, { photo: string; relationship: string }> = {}
    for (const p of people) map[p.name.toLowerCase()] = { photo: p.photo_url ?? '', relationship: p.relationship ?? '' }
    return map
  }, [people])

  function switchTab(tab: TypeTab) {
    setActiveTab(tab)
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'All') params.delete('kind')
    else params.set('kind', tab)
    router.replace(`/search?${params.toString()}`)
  }

  const displayed = useMemo(() => {
    const ql = q.toLowerCase()
    let list = ql
      ? memories.filter(m =>
          (m.title ?? '').toLowerCase().includes(ql) ||
          (m.narrator ?? '').toLowerCase().includes(ql)
        )
      : [...memories]

    if (activeTab === 'Recipes') list = list.filter(m => !isAudio(m))
    else if (activeTab === 'Moments') list = list.filter(isAudio)

    if (sort === 'Recently added') list = list.slice().sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
    else if (sort === 'Oldest first') list = list.slice().sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
    else if (sort === 'A–Z') list = list.slice().sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
    return list
  }, [memories, q, activeTab, sort, favTick])

  const recipeCount = useMemo(() => displayed.filter(m => !isAudio(m)).length, [displayed])
  const momentCount = useMemo(() => displayed.filter(isAudio).length, [displayed])

  if (loading) return (
    <div style={{ padding: '1.5rem 1.75rem 2.5rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
        {Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
  if (error) return <div style={{ padding: '2rem', color: 'var(--accent)' }}>{error}</div>

  const tabCounts: Record<TypeTab, number> = {
    All: displayed.length,
    Recipes: recipeCount,
    Moments: momentCount,
  }

  const labelMap: Record<TypeTab, string> = {
    All: `${displayed.length} result${displayed.length !== 1 ? 's' : ''}`,
    Recipes: `${recipeCount} recipe${recipeCount !== 1 ? 's' : ''}`,
    Moments: `${momentCount} moment${momentCount !== 1 ? 's' : ''}`,
  }

  return (
    <div style={{ padding: '1.5rem 1.75rem 2.5rem' }}>
      <style>{`
        .rk-search-wrap { max-width: 1100px; margin: 0 auto; }
        .rk-search-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
        @media (min-width: 640px) { .rk-search-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (min-width: 900px) { .rk-search-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        @keyframes rk-lid-up {
          0%, 15%   { transform: translateY(0px); }
          28%, 62%  { transform: translateY(-16px); }
          75%, 100% { transform: translateY(0px); }
        }
        @keyframes rk-steam-appear {
          0%, 20%  { opacity: 0; transform: translateY(4px) scaleX(1); }
          30%      { opacity: 0.85; }
          65%      { opacity: 0.3; }
          75%, 100%{ opacity: 0; transform: translateY(-24px) scaleX(0.4); }
        }
        .rk-bowl-lid { animation: rk-lid-up 3.6s cubic-bezier(0.45,0,0.55,1) infinite; transform-box: fill-box; transform-origin: center bottom; }
        .rk-bowl-steam { animation: rk-steam-appear 3.6s ease-out infinite; transform-box: fill-box; transform-origin: bottom center; }
        @keyframes rk-eq-bounce {
          0%, 100% { transform: scaleY(0.18); }
          50%       { transform: scaleY(1); }
        }
        .rk-eq-bar {
          animation: rk-eq-bounce 1.3s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        .rk-card-hoverable { transition: transform 0.18s, box-shadow 0.18s; }
        .rk-card-hoverable:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(45,27,14,0.12) !important; }
        .rk-tab { background: none; border: 1.5px solid var(--border); border-radius: 20px; padding: 0.38rem 0.9rem; font-size: 0.82rem; font-weight: 600; cursor: pointer; color: var(--text2); font-family: var(--sans); transition: all 0.15s; white-space: nowrap; }
        .rk-tab:hover { border-color: var(--accent); color: var(--accent); }
        .rk-tab-active { background: var(--accent) !important; border-color: var(--accent) !important; color: white !important; }
      `}</style>

      <div className="rk-search-wrap">
        {/* Back — search is reached from the top bar on any page, not a
            sidebar destination. The top bar's live search uses router.replace()
            (not push) so typing doesn't spam history, which means router.back()
            skips past the page you actually searched from. AppTopBar records
            that page explicitly in sessionStorage before navigating here. */}
        <Link
          href={backHref}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            color: 'var(--text2)', textDecoration: 'none',
            fontSize: '0.85rem', fontWeight: 500, marginBottom: '1rem',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </Link>

        {/* Hero */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.4rem, 3vw, 1.8rem)', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {q
                ? <>Results for <span style={{ color: 'var(--accent)' }}>&ldquo;{q}&rdquo;</span></>
                : 'All memories'
              }
            </h1>
          </div>
          <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '1rem' }}>
            {q ? 'Searching across recipes, moments, and narrators.' : 'Everything saved across recipes and moments.'}
          </p>

          {/* Type tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(['All', 'Recipes', 'Moments'] as TypeTab[]).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => switchTab(tab)}
                className={`rk-tab${activeTab === tab ? ' rk-tab-active' : ''}`}
              >
                {tab}
                <span style={{ marginLeft: '0.35rem', opacity: activeTab === tab ? 0.8 : 0.55, fontWeight: 500 }}>
                  {tabCounts[tab]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Count + sort */}
        {displayed.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)', fontWeight: 500 }}>
              {labelMap[activeTab]}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Sort:</span>
              <select
                value={sort}
                onChange={e => setSort(e.target.value)}
                style={{ fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: 8, padding: '0.3rem 0.5rem', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--sans)', cursor: 'pointer' }}
              >
                {['Recently added', 'Oldest first', 'A–Z'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Grid */}
        {displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔍</div>
            <p style={{ fontFamily: 'var(--serif)', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '0.35rem' }}>
              {q ? `No results for "${q}"` : 'No memories yet'}
            </p>
            <p style={{ fontSize: '0.85rem' }}>
              {q ? 'Try a different word or check the spelling.' : 'Start by recording or uploading a memory.'}
            </p>
            {!q && (
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                <Link href="/capture" style={{ background: 'var(--accent)', color: 'white', textDecoration: 'none', padding: '0.6rem 1.25rem', borderRadius: 12, fontSize: '0.88rem', fontWeight: 700 }}>Record a memory</Link>
                <Link href="/upload" style={{ background: 'var(--surface)', color: 'var(--text)', textDecoration: 'none', padding: '0.6rem 1.25rem', borderRadius: 12, fontSize: '0.88rem', fontWeight: 600, border: '1px solid var(--border)' }}>Upload audio</Link>
              </div>
            )}
          </div>
        ) : (
          <div className="rk-search-grid">
            {displayed.map(memory => {
              const np = peopleMap[( memory.narrator ?? '').toLowerCase()] ?? { photo: '', relationship: '' }
              const isFav = favTokens.includes(memory.token)
              const inCol = collectionSet.has(memory.token)
              return isAudio(memory) ? (
                <MomentCard
                  key={memory.token}
                  memory={memory}
                  isFav={isFav}
                  onToggleFav={() => toggleFav(memory.token)}
                  inCollection={inCol}
                  onToggleCollection={() => toggleCollection(memory.token)}
                  narratorPhoto={np.photo}
                />
              ) : (
                <RecipeCard
                  key={memory.token}
                  memory={memory}
                  isFav={isFav}
                  onToggleFav={() => toggleFav(memory.token)}
                  inCollection={inCol}
                  onToggleCollection={() => toggleCollection(memory.token)}
                  narratorPhoto={np.photo}
                  narratorRelationship={np.relationship}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
