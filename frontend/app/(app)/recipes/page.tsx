// All Recipes page — aligned to Echoes of Home product mockup.
// Two-column: main (hero, count/sort, 4-col grid, CTA) | right (filter pills + why recipes matter).

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
const RECIPE_CATEGORIES = ['Breakfast', 'Lunch', 'Sweets', 'Pickles', 'Snacks', 'Drinks', 'Other']
const MOMENT_CATEGORIES = ['Song', 'Story', 'Fable', 'Wisdom', 'Poem', 'Other']
const KNOWN_MOMENT_TYPES = ['song', 'story', 'fable', 'wisdom', 'poem']

// "tale" covers Tales & Songs entries with or without audio (e.g. a typed
// poem with no recording). "audio" alone is kept for back-compat with rows
// saved before the tale/text-only split existed.
function isAudio(m: Memory) { return (m.tags ?? []).some(t => t === 'tale' || t === 'audio') }

// ─── Right panel ────────────────────────────────────────────────────────
function RightPanel({
  isAudioMode,
  searchActive,
  narratorParam,
}: {
  isAudioMode: boolean
  searchActive: boolean
  narratorParam: string
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

  const WHY_MIXED = [
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
        </svg>
      ),
      title: 'Their voice, forever',
      desc: 'A recording carries warmth and love that words on a page never can.',
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
          <path d="M12 6c0 0-4 3.5-4 7a4 4 0 008 0c0-1.5-.5-3-2-4.5 0 2-1 3-2 3s-2-1-2-2.5c0-1 .5-2 2-3.5z"/>
        </svg>
      ),
      title: 'Recipes & moments',
      desc: 'Every dish has a story. Every song holds a memory. Keep them together.',
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
      ),
      title: 'Pass it forward',
      desc: 'Give the next generation a living keepsake they can return to.',
    },
  ]

  const WHY = (searchActive || narratorParam) ? WHY_MIXED : isAudioMode ? WHY_AUDIO : WHY_RECIPE

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Why panel */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.25rem', boxShadow: '0 4px 16px rgba(45,27,14,0.05)' }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          {(searchActive || narratorParam) ? 'Why every memory matters' : isAudioMode ? 'Why voices matter' : 'Why recipes matter'}
        </h3>
        {WHY.map((item) => (
          <div key={item.title} style={{ display: 'flex', gap: '0.7rem', marginBottom: '0.95rem' }}>
            {/* Flat, no circle — informational only (matches Tips panels) */}
            <div style={{ width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', flexShrink: 0 }}>
              {item.icon}
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text)', marginBottom: 3 }}>{item.title}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.5 }}>{item.desc}</p>
            </div>
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.25rem', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '0.88rem', color: 'var(--text2)', lineHeight: 1.65, marginBottom: '0.65rem' }}>
            {(searchActive || narratorParam)
              ? `”Every family carries a world. Don’t let it fade.”`
              : isAudioMode
              ? `”Some memories are meant to be heard.”`
              : `”A recipe is more than ingredients. It’s a story we live and share.”`}
          </p>
          <span style={{ color: 'var(--muted)', fontSize: '1rem' }}>♡</span>
        </div>
      </div>
    </aside>
  )
}

// ─── Audio card ──────────────────────────────────────────────────────────
const WA_ICON = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="white" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

function CardShareButton({ token, title, type, top = 8, right = 38 }: { token: string; title: string | null; type?: string | null; top?: number; right?: number }) {
  const emoji = type === 'song' ? '🎵' : type === 'story' ? '📖' : type === 'poem' ? '🖊️' : type === 'wisdom' ? '🙏' : type === 'fable' ? '✨' : '🍽️'
  return (
    <button
      type="button"
      onClick={e => {
        e.preventDefault()
        const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://www.theechoesofhome.com'}/memory?token=${token}`
        window.open(`https://wa.me/?text=${encodeURIComponent(`${emoji} "${title ?? 'this memory'}" on Echoes of Home:\n${shareUrl}`)}`, '_blank')
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
    <Link
      href={`/memory?token=${memory.token}`}
      className="rk-card-hoverable"
      style={{ textDecoration: 'none', display: 'block', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 10px rgba(45,27,14,0.06)' }}
    >
      {/* Waveform banner */}
      <div style={{ position: 'relative', background: 'linear-gradient(135deg, var(--gold-light) 0%, #EAD9AE 100%)', padding: '1.25rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 80 }}>
        {[4,7,11,9,14,10,6,13,8,11,6,9,12,7,5].map((h, i) => (
          <div key={i} style={{ width: 3, height: h * 3, borderRadius: 2, background: 'var(--accent)', opacity: 0.6 }} />
        ))}
        <div style={{ position: 'absolute', width: 40, height: 40, borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(45,27,14,0.15)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
        <CardShareButton token={memory.token} title={memory.title} type={memory.type} top={8} right={38} />
        <BookmarkToggle inCollection={inCollection} onToggle={e => { e.preventDefault(); onToggleCollection() }} />
        <FavoriteHeart
          favorite={isFav}
          onToggle={onToggleFav}
          size="0.85rem"
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

// ─── Animated bowl placeholder ───────────────────────────────────────────
function BowlPlaceholder({ token }: { token: string }) {
  // Stable per-card stagger so lids don't all lift simultaneously
  let h = 0
  for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) & 0xffffff
  const base = (h % 36) / 10
  const d1 = `${base}s`, d2 = `${base + 0.32}s`, d3 = `${base + 0.64}s`

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(140deg, #F2E5CE 0%, #E4C898 55%, #D4AD72 100%)' }}>
      <svg viewBox="0 0 100 88" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '62%', maxWidth: 150, overflow: 'visible' }}>
        {/* Steam — synced with lid open phase */}
        <path className="rk-bowl-steam" style={{ animationDelay: d1 }} d="M 36 36 C 32 27 40 20 36 11 C 33 4 39 -1 36 -7" stroke="rgba(255,255,255,0.82)" strokeWidth="2.3" strokeLinecap="round"/>
        <path className="rk-bowl-steam" style={{ animationDelay: d2 }} d="M 50 33 C 46 24 54 17 50 8 C 47 1 53 -4 50 -10" stroke="rgba(255,255,255,0.82)" strokeWidth="2.3" strokeLinecap="round"/>
        <path className="rk-bowl-steam" style={{ animationDelay: d3 }} d="M 64 36 C 60 27 68 20 64 11 C 61 4 67 -1 64 -7" stroke="rgba(255,255,255,0.82)" strokeWidth="2.3" strokeLinecap="round"/>
        {/* Shadow */}
        <ellipse cx="50" cy="83" rx="24" ry="5" fill="rgba(100,60,10,0.12)"/>
        {/* Bowl body */}
        <path d="M 14 40 Q 12 70 30 78 Q 50 85 70 78 Q 88 70 86 40" fill="#C8924A"/>
        <path d="M 14 40 Q 12 64 26 74 Q 20 58 18 40 Z" fill="rgba(255,220,150,0.15)"/>
        {/* Rim */}
        <ellipse cx="50" cy="40" rx="36" ry="9.5" fill="#D4A060"/>
        <ellipse cx="50" cy="40" rx="29" ry="7.5" fill="#A86B22"/>
        {/* Food surface */}
        <ellipse cx="50" cy="40" rx="24" ry="5.8" fill="#D4960E" opacity="0.85"/>
        <ellipse cx="44" cy="38.5" rx="8" ry="2.5" fill="rgba(255,230,120,0.3)"/>
        {/* Base */}
        <path d="M 32 78 Q 32 84 50 84 Q 68 84 68 78" fill="#A86222"/>
        <ellipse cx="50" cy="84" rx="18" ry="4" fill="#B87030"/>
        {/* Lid (animated) */}
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

// ─── Recipe card ─────────────────────────────────────────────────────────
function RecipeCard({
  memory,
  isFav,
  onToggleFav,
  inCollection,
  onToggleCollection,
  narratorPhoto,
  narratorRelationship,
}: {
  memory: Memory
  isFav: boolean
  onToggleFav: () => void
  inCollection: boolean
  onToggleCollection: () => void
  narratorPhoto: string
  narratorRelationship: string
}) {
  return (
    <div className="rk-card-hoverable" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 10px rgba(45,27,14,0.06), 0 0 22px rgba(24,107,94,0.14)', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Food photo */}
      <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden', flexShrink: 0 }}>
        <Link href={`/memory?token=${memory.token}`} style={{ display: 'block', height: '100%' }}>
          {memory.image_url
            ? <img src={memory.image_url} alt={memory.title ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <BowlPlaceholder token={memory.token} />
          }
        </Link>
        <CardShareButton token={memory.token} title={memory.title} type={memory.type} top={8} right={38} />
        <BookmarkToggle inCollection={inCollection} onToggle={e => { e.preventDefault(); onToggleCollection() }} />
        {/* Heart toggle */}
        <FavoriteHeart
          favorite={isFav}
          onToggle={onToggleFav}
          size="0.85rem"
          style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}
        />
      </div>

      <div style={{ padding: '0.85rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Name */}
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '0.98rem', color: 'var(--text)', marginBottom: '0.55rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {memory.title ?? 'Untitled'}
        </p>

        {/* Narrator row — no wrap; name truncates if too long */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.4rem', overflow: 'hidden' }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-light)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid var(--border)' }}>
            {narratorPhoto
              ? <img src={narratorPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)' }}>{(memory.narrator ?? '?')[0]?.toUpperCase()}</span>
            }
          </div>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', minWidth: 0 }}>{memory.narrator ?? 'Narrator'}</span>
          {narratorRelationship && (
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-light)', borderRadius: 20, padding: '0.15rem 0.5rem', border: '1px solid rgba(24,107,94,0.15)', flexShrink: 0, whiteSpace: 'nowrap' }}>
              {narratorRelationship}
            </span>
          )}
        </div>

        {/* View memory link — pinned to bottom */}
        <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
          <Link
            href={`/memory?token=${memory.token}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none', color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 600 }}
          >
            <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem' }}>▶</div>
            View memory
          </Link>
        </div>
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
          /* Soft jade glow, not a hard border, ties the warm illustration
             into the palette ambiently */
          box-shadow: 0 0 32px rgba(24,107,94,0.22);
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
  const collectionParam = searchParams.get('collection')
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

  const isAudioMode = typeParam === 'audio'

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
    } else {
      if (isAudioMode) list = list.filter(isAudio)
      else list = list.filter(m => !isAudio(m))
    }
    // Quick filter pill
    if (quickFilter === 'Favorites') list = list.filter(m => favTokens.includes(m.token))
    else if (quickFilter === 'Family Collection') list = list.filter(m => collectionSet.has(m.token))
    // Category dropdown
    if (categoryFilter) {
      if (categoryFilter === 'Other') {
        if (isAudioMode) list = list.filter(m => !KNOWN_MOMENT_TYPES.includes(m.type ?? ''))
        else list = list.filter(m => !RECIPE_CATEGORIES.slice(0, -1).some(c => (m.tags ?? []).includes(c)))
      } else if (isAudioMode) {
        list = list.filter(m => m.type === categoryFilter.toLowerCase())
      } else {
        list = list.filter(m => (m.tags ?? []).includes(categoryFilter))
      }
    }
    // Sort
    if (sort === 'Recently added') list = list.slice().sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
    else if (sort === 'Oldest first') list = list.slice().sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
    else if (sort === 'A–Z') list = list.slice().sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
    return list
  }, [memories, quickFilter, categoryFilter, sort, q, narratorParam, favTick, isAudioMode])

  if (loading) return (
    <div style={{ padding: '1.5rem 1.75rem 2.5rem', maxWidth: 1200, margin: '0 auto' }}>
      <div className="rk-recipe-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
        {Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
  if (error) return <div style={{ padding: '2rem', color: 'var(--accent)' }}>{error}</div>

  return (
    <div style={{ padding: '1.5rem 1.75rem 2.5rem' }}>
      <style>{`
        .rk-mem-wrap { max-width: 1200px; margin: 0 auto; }
        .rk-mem-cols { display: grid; grid-template-columns: 1fr; gap: 1.25rem; }
        @media (min-width: 860px) { .rk-mem-cols { grid-template-columns: 1fr 272px; align-items: start; } }
        .rk-recipe-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
        @media (min-width: 640px) { .rk-recipe-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (min-width: 900px) { .rk-recipe-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
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
        .rk-bowl-lid {
          animation: rk-lid-up 3.6s cubic-bezier(0.45,0,0.55,1) infinite;
          transform-box: fill-box;
          transform-origin: center bottom;
        }
        .rk-bowl-steam {
          animation: rk-steam-appear 3.6s ease-out infinite;
          transform-box: fill-box;
          transform-origin: bottom center;
        }
      `}</style>

      <div className="rk-mem-wrap">
        <div className="rk-mem-cols">
          {/* ── Main ── */}
          <div>
            {/* Hero */}
            {narratorParam ? (
              /* ── Narrator hero — shows all their memories regardless of tab ── */
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.6rem, 3vw, 2rem)', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                      {narratorParam}&rsquo;s memories <span style={{ color: 'var(--muted)' }}>♡</span>
                    </h1>
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.6, maxWidth: 380 }}>
                    Recipes, songs, stories. Everything saved from {narratorParam}.
                  </p>
                </div>
                <HeroIllustration />
              </div>
            ) : q ? (
              /* ── Search hero ── */
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
                  Showing recipes and moments across all narrators.
                </p>
              </div>
            ) : isAudioMode ? (
              /* ── Audio hero ── */
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
                      href={narratorParam ? `/capture?narrator=${encodeURIComponent(narratorParam)}` : '/capture'}
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
                      href={narratorParam ? `/upload?narrator=${encodeURIComponent(narratorParam)}` : '/upload'}
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
                      href={narratorParam ? `/upload?narrator=${encodeURIComponent(narratorParam)}&mode=text` : '/upload?mode=text'}
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
            ) : (
              /* ── Recipe hero ── */
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.6rem, 3vw, 2rem)', fontWeight: 700, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      All Recipes <span style={{ color: 'var(--muted)' }}>♡</span>
                    </h1>
                    <Link href={narratorParam ? `/capture?narrator=${encodeURIComponent(narratorParam)}` : '/capture'} style={{ background: 'var(--accent)', color: 'white', textDecoration: 'none', padding: '0.45rem 1rem', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 2px 8px rgba(24,107,94,0.22)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      + Add Memory
                    </Link>
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.6, maxWidth: 360 }}>
                    Every recipe lovingly shared by the people who made your world.
                  </p>
                </div>
                <HeroIllustration />
              </div>
            )}

            {/* Count + sort bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {isAudioMode && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="2" y1="12" x2="4" y2="12"/><line x1="5" y1="8" x2="5" y2="16"/><line x1="8" y1="5" x2="8" y2="19"/><line x1="11" y1="9" x2="11" y2="15"/><line x1="14" y1="6" x2="14" y2="18"/><line x1="17" y1="10" x2="17" y2="14"/><line x1="20" y1="8" x2="20" y2="16"/><line x1="22" y1="12" x2="24" y2="12"/>
                  </svg>
                )}
                {`${displayed.length} ${(q || narratorParam) ? `Memor${displayed.length !== 1 ? 'ies' : 'y'}` : isAudioMode ? `Memor${displayed.length !== 1 ? 'ies' : 'y'}` : `Recipe${displayed.length !== 1 ? 's' : ''}`}`}
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

            {/* Compact filter row — hidden during search / narrator view */}
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
                  <option value="">{isAudioMode ? 'All types' : 'All categories'}</option>
                  {(isAudioMode ? MOMENT_CATEGORIES : RECIPE_CATEGORIES).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Grid */}
            {displayed.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: 14, border: '1px dashed var(--border)', fontSize: '0.88rem' }}>
                {q
                  ? `No memories matching "${q}"`
                  : quickFilter === 'Favorites'
                  ? 'No favorites yet. Heart one to add it here.'
                  : quickFilter === 'Family Collection'
                  ? 'No memories in your Family Collection yet. Bookmark one from any memory card.'
                  : narratorParam
                  ? `No memories saved for ${narratorParam} yet.`
                  : isAudioMode ? 'No recordings yet.' : 'No recipes yet.'}
                {' '}
                {!narratorParam && (
                  <Link href={isAudioMode ? '/upload' : '/capture'} style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    {isAudioMode ? 'Upload the first one' : 'Capture the first one'}
                  </Link>
                )}
              </div>
            ) : (
              <div className="rk-recipe-grid">
                {displayed.map(m => {
                  const info = peopleMap[m.narrator?.toLowerCase() ?? ''] ?? { photo: '', relationship: '' }
                  return (
                    <div key={m.token} style={{ position: 'relative', minWidth: 0 }}>
                      {isAudio(m) ? (
                        <AudioCard
                          memory={m}
                          isFav={favTokens.includes(m.token)}
                          onToggleFav={() => toggleFav(m.token)}
                          inCollection={collectionSet.has(m.token)}
                          onToggleCollection={() => toggleCollection(m.token)}
                          narratorPhoto={info.photo}
                        />
                      ) : (
                        <RecipeCard
                          memory={m}
                          isFav={favTokens.includes(m.token)}
                          onToggleFav={() => toggleFav(m.token)}
                          inCollection={collectionSet.has(m.token)}
                          onToggleCollection={() => toggleCollection(m.token)}
                          narratorPhoto={info.photo}
                          narratorRelationship={info.relationship}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Right panel ── */}
          <RightPanel isAudioMode={isAudioMode} searchActive={!!q} narratorParam={narratorParam} />
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
            background: 'linear-gradient(135deg, var(--gold-light) 0%, #EAD9AE 100%)',
            border: '2px solid #E8C9A8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: '0 4px 12px rgba(45,27,14,0.1)',
          }}>
            <span style={{ fontSize: '1.6rem', color: 'var(--accent)', lineHeight: 1 }}>✦</span>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)', marginBottom: '0.3rem' }}>
              {isAudioMode ? 'Have a moment worth keeping?' : 'Have a memory to preserve?'}
            </p>
            <p style={{ fontSize: '0.83rem', color: 'var(--muted)', lineHeight: 1.55 }}>
              {isAudioMode
                ? 'Record it now or upload an audio file. Every voice deserves to be heard again.'
                : 'Record it, write it or upload it. Keep every recipe, song and story alive for generations to come.'}
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
