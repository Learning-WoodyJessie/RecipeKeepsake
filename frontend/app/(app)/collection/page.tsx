// Family Collection — authenticated view of every memory (recipe or moment)
// any member of the family group has opted into the shared collection
// (portal_visible). Distinct from the public portal (/family?p=...), which
// is the no-login surface for sharing outside the app.

'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import WaveformBars from '@/components/WaveformBars'
import FavoriteHeart from '@/components/FavoriteHeart'
import { SkeletonRow } from '@/components/Skeleton'
import { readFavorites, toggleFavorite as toggleFav } from '@/lib/favorites'

type Memory = {
  token: string
  title: string | null
  narrator: string | null
  recorded_at: string
  tags: string[] | null
  type: string | null
  recorded_by_name: string | null
  portal_visible?: boolean
}

function isAudio(m: Memory) { return (m.tags ?? []).some(t => t === 'tale' || t === 'audio') }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const TYPE_LABELS: Record<string, string> = {
  recipe: '🍲 Recipes',
  song: '🎵 Songs',
  story: '📖 Stories',
  fable: '✨ Fables',
  wisdom: '🙏 Wisdom',
  poem: '🖊️ Poems',
}
const TYPE_ORDER = ['recipe', 'song', 'story', 'fable', 'wisdom', 'poem'] as const

const TYPE_ICON: Record<string, React.ReactNode> = {
  recipe: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 2h18l-2 7H5L3 2z"/><path d="M5 9s0 5 7 5 7-5 7-5"/>
      <line x1="12" y1="14" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>
    </svg>
  ),
  song: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  ),
  story: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
    </svg>
  ),
  fable: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  wisdom: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  poem: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  ),
}

function typeAccent(type: string | null) {
  return (type === 'recipe' || !type) ? 'var(--amber)' : 'var(--accent)'
}
function typeBg(type: string | null) {
  return (type === 'recipe' || !type) ? 'var(--gold-light)' : 'var(--accent-light)'
}

function MemoryRow({ memory, isFav, onToggle }: { memory: Memory; isFav: boolean; onToggle: () => void }) {
  const narr = memory.narrator ?? 'Narrator'
  const title = memory.title ?? 'Untitled memory'
  const t = memory.type ?? 'recipe'
  const audio = isAudio(memory)

  return (
    <div
      className="rk-card-hoverable"
      style={{
        display: 'flex', alignItems: 'center', gap: '0.85rem',
        padding: '0.85rem 1rem', minHeight: 80,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, position: 'relative',
        borderLeft: `3px solid ${typeAccent(memory.type)}`,
      }}
    >
      <Link
        href={`/memory?token=${memory.token}&from=collection`}
        aria-label={`Open ${title}`}
        style={{ position: 'absolute', inset: 0, borderRadius: 14, zIndex: 2 }}
      />

      <div style={{ width: 44, height: 44, borderRadius: 12, background: typeBg(memory.type), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {TYPE_ICON[t] ?? TYPE_ICON.recipe}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </p>
        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: audio ? 5 : 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {narr} · {fmtDate(memory.recorded_at)}
          {memory.recorded_by_name && (
            <span style={{ marginLeft: 6, fontSize: 10 }}>by {memory.recorded_by_name}</span>
          )}
        </p>
        {audio && <WaveformBars token={memory.token} barCount={18} />}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: typeAccent(memory.type), textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {t === 'recipe' ? 'Recipe' : t}
        </span>
        <FavoriteHeart favorite={isFav} onToggle={onToggle} style={{ position: 'relative', zIndex: 3 }} />
      </div>
    </div>
  )
}

// ─── Right panel ─────────────────────────────────────────────────────────────
function RightPanel() {
  const items = [
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
      ),
      title: 'One archive, whole family',
      desc: 'Every memory added here is instantly visible to everyone in your group. No links to share, no apps to install.',
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/>
        </svg>
      ),
      title: 'Their voice, unchanged',
      desc: 'Recipes, songs, and stories stay exactly as they were captured. Grandma\'s words, not a summary of them.',
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
        </svg>
      ),
      title: 'A gift that outlasts you',
      desc: 'The memories you share here become a living keepsake, something children and grandchildren can return to.',
    },
  ]

  const quote = {
    text: '"The stories we tell ourselves about our families are the most important stories we will ever hear."',
    attr: 'Chitra Banerjee Divakaruni',
  }

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.25rem' }}>
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: '1rem' }}>
          Why share with your family?
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

      <div style={{ background: 'var(--gold-light)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.25rem' }}>
        <p style={{ fontFamily: 'var(--serif)', fontSize: '0.88rem', color: 'var(--text2)', lineHeight: 1.65, marginBottom: '0.6rem', fontStyle: 'italic' }}>
          {quote.text}
        </p>
        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600 }}>{quote.attr}</p>
      </div>
    </aside>
  )
}

export default function CollectionPage() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeType, setActiveType] = useState<'all' | typeof TYPE_ORDER[number]>('all')
  const [favTick, setFavTick] = useState(0)

  useEffect(() => {
    api.family.recipes()
      .then((rows) => setMemories((rows as Memory[]).filter(m => m.portal_visible)))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const favTokens = useMemo(() => readFavorites(), [favTick])
  const toggleFavorite = (token: string) => { toggleFav(token); setFavTick(x => x + 1) }

  const presentTypes = useMemo(() => {
    const present = new Set(memories.map(m => m.type ?? 'recipe'))
    return TYPE_ORDER.filter(t => present.has(t))
  }, [memories])

  const displayed = useMemo(() => {
    if (activeType === 'all') return memories
    return memories.filter(m => (m.type ?? 'recipe') === activeType)
  }, [memories, activeType])

  return (
    <div style={{ padding: '1.5rem 1.75rem 2.5rem' }}>
      <style>{`
        .rk-col-wrap { max-width: 1200px; margin: 0 auto; }
        .rk-col-cols { display: grid; grid-template-columns: 1fr; gap: 1.25rem; }
        .rk-col-cols > * { min-width: 0; }
        @media (min-width: 860px) { .rk-col-cols { grid-template-columns: 1fr 272px; align-items: start; } }
      `}</style>
      <div className="rk-col-wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.35rem' }}>
        <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
          <circle cx="26" cy="26" r="26" fill="var(--gold-light)" />
          {/* Left person */}
          <circle cx="16" cy="22" r="5.5" fill="var(--amber)" opacity="0.6" />
          <path d="M7 40c0-4.97 4.03-8 9-8s9 3.03 9 8" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6" />
          {/* Right person */}
          <circle cx="36" cy="22" r="5.5" fill="var(--accent)" opacity="0.45" />
          <path d="M27 40c0-4.97 4.03-8 9-8s9 3.03 9 8" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.45" />
          {/* Centre person */}
          <circle cx="26" cy="19" r="6.5" fill="var(--amber)" />
          <path d="M13.5 42c0-6.35 5.6-10.5 12.5-10.5S38.5 35.65 38.5 42" stroke="var(--amber)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          {/* Heart above centre */}
          <path d="M26 11.5c0 0-1.2-1 -1.2-1.8a1.2 1.2 0 012.4 0c0 .8-1.2 1.8-1.2 1.8z" fill="var(--accent)" opacity="0.85" />
          <path d="M26 12c-.5-.45-2-1.6-2-3a2 2 0 014 0c0 1.4-1.5 2.55-2 3z" fill="var(--accent)" opacity="0.85" />
        </svg>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
          Family Collection
        </h1>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1.5rem', paddingLeft: '0.1rem' }}>
        Memories your family has chosen to share with everyone in the group.
      </p>

      <div className="rk-col-cols">
      <div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {Array.from({ length: 4 }, (_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : error ? (
        <div style={{ padding: '2rem', color: 'var(--accent)' }}>{error}</div>
      ) : memories.length === 0 ? (
        <div style={{ padding: '2rem 1.5rem', borderRadius: 14, background: 'var(--surface)', border: '1px dashed var(--border2)', textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.7, marginBottom: '1.1rem' }}>
            No memories in your Family Collection yet.<br />
            Add it here from any memory by clicking{' '}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', verticalAlign: 'middle', background: 'var(--accent-light)', border: '1px solid rgba(24,107,94,0.2)', borderRadius: 8, padding: '2px 8px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
              Family Collection
            </span>
          </p>
          <Link
            href="/capture"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              background: 'var(--accent)', color: 'white', textDecoration: 'none',
              padding: '0.55rem 1.2rem', borderRadius: 10,
              fontSize: '0.85rem', fontWeight: 700,
              boxShadow: '0 2px 8px rgba(24,107,94,0.22)',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
            </svg>
            Capture your first one
          </Link>
        </div>
      ) : (
        <>
          {presentTypes.length > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
              <button
                type="button"
                onClick={() => setActiveType('all')}
                style={{
                  padding: '0.28rem 0.75rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600,
                  border: `1.5px solid ${activeType === 'all' ? 'var(--accent)' : 'var(--border)'}`,
                  background: activeType === 'all' ? 'var(--accent-light)' : 'transparent',
                  color: activeType === 'all' ? 'var(--accent)' : 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                All
              </button>
              {presentTypes.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveType(t)}
                  style={{
                    padding: '0.28rem 0.75rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600,
                    border: `1.5px solid ${activeType === t ? 'var(--accent)' : 'var(--border)'}`,
                    background: activeType === t ? 'var(--accent-light)' : 'transparent',
                    color: activeType === t ? 'var(--accent)' : 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {displayed.map(m => (
              <MemoryRow
                key={m.token}
                memory={m}
                isFav={favTokens.includes(m.token)}
                onToggle={() => toggleFavorite(m.token)}
              />
            ))}
          </div>
        </>
      )}
      </div>
      <RightPanel />
      </div>
      </div>
    </div>
  )
}
