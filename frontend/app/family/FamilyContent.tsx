'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import ReactionBar from '../../components/ReactionBar'

type Ingredient = { item: string; quantity?: string }

type PortalMemory = {
  id: string
  token: string
  title: string
  narrator?: string
  recorded_at?: string
  image_url?: string
  audio_url?: string
  tags?: string[]
  type?: string
  recorded_by_name?: string
  ingredients?: Ingredient[]
  steps?: string[]
  cook_notes?: string
}

type PortalData = {
  group_name: string
  recipes: PortalMemory[]
  invite_url?: string
}

const TYPE_LABELS: Record<string, string> = {
  recipe: '🍲 Recipes',
  song:   '🎵 Songs',
  story:  '📖 Stories',
  fable:  '✨ Fables',
  wisdom: '🙏 Wisdom',
  poem:   '🖊️ Poems',
}

function PortalContent() {
  const params = useSearchParams()
  const portalToken = params.get('p')
  const router = useRouter()

  const [authed, setAuthed] = useState(false)
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeType, setActiveType] = useState<string>('all')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reactions, setReactions] = useState<Record<string, { counts: Record<string, number>; user_reactions: string[] }>>({})
  const [hasOwnGroup, setHasOwnGroup] = useState(false)
  const emptyReaction = { counts: { '😊': 0, '🥹': 0, '🏆': 0, '🙏': 0 }, user_reactions: [] }

  // Gate: require login before showing family memories
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        const here = window.location.pathname + window.location.search
        localStorage.setItem('returnTo', here)
        router.replace(`/?next=${encodeURIComponent(here)}`)
      } else {
        setAuthed(true)
      }
    })
  }, [router])

  useEffect(() => {
    if (!authed) return
    api.family.getMyGroup()
      .then((d: { group: unknown }) => { if (d.group) setHasOwnGroup(true) })
      .catch(() => {})
    if (!portalToken) { setError('Invalid portal link.'); setLoading(false); return }
    api.portal.get(portalToken)
      .then(async (d: PortalData) => {
        setData(d)
        setLoading(false)
        // Batch-fetch reactions for all memories (non-blocking, errors are swallowed)
        const tokens = (d.recipes ?? []).map((m: PortalMemory) => m.token)
        const results = await Promise.all(
          tokens.map((t: string) =>
            (api.reactions.get(t) as Promise<{ counts: Record<string, number>; user_reactions: string[] }>)
              .catch(() => ({ counts: { '😊': 0, '🥹': 0, '🏆': 0, '🙏': 0 }, user_reactions: [] }))
          )
        )
        const map: Record<string, { counts: Record<string, number>; user_reactions: string[] }> = {}
        tokens.forEach((t: string, i: number) => { map[t] = results[i] })
        setReactions(map)
      })
      .catch(() => { setError('This family portal could not be found.'); setLoading(false) })
  }, [authed, portalToken])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sans)' }}>
      <p style={{ color: 'var(--muted)' }}>Loading family memories…</p>
    </div>
  )

  if (error || !data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sans)' }}>
      <p style={{ color: 'var(--muted)' }}>{error || 'Something went wrong.'}</p>
    </div>
  )

  const memories = data.recipes ?? []
  const types = Array.from(new Set(memories.map(m => m.type ?? 'recipe').filter(Boolean)))
  const filtered = activeType === 'all' ? memories : memories.filter(m => (m.type ?? 'recipe') === activeType)

  return (
    <div style={{ fontFamily: 'var(--sans)', paddingBottom: '6rem' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', padding: '2.5rem 1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.4rem' }}>
          Family Archive
        </p>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 700, color: 'var(--text)', margin: '0 0 0.4rem' }}>
          {data.group_name}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
          Family memories, shared with love
        </p>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '1.5rem 1rem' }}>

        {/* Type filter tabs */}
        {types.length > 1 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {['all', ...types].map(t => (
              <button key={t} onClick={() => setActiveType(t)} style={{
                padding: '5px 14px', borderRadius: 20, border: '1px solid var(--border)',
                background: activeType === t ? 'var(--accent)' : 'transparent',
                color: activeType === t ? 'white' : 'var(--muted)',
                fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)',
              }}>
                {t === 'all' ? 'All' : (TYPE_LABELS[t] ?? t)}
              </button>
            ))}
          </div>
        )}

        {/* Memory cards */}
        {filtered.length === 0 ? (
          <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: '3rem' }}>No memories here yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {filtered.map(m => {
              const ingredients = m.ingredients ?? []
              const steps = m.steps ?? []
              const isExpanded = expandedId === m.id
              const hasContent = ingredients.length > 0 || steps.length > 0 || m.cook_notes

              return (
                <div key={m.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                  {m.image_url && (
                    <img src={m.image_url} alt={m.title} style={{ width: '100%', height: 200, objectFit: 'cover' }} />
                  )}
                  <div style={{ padding: '1rem 1.1rem' }}>
                    {/* Title row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <h2 style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                        {m.title}
                      </h2>
                      {m.type && m.type !== 'recipe' && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', textTransform: 'capitalize' }}>
                          {m.type}
                        </span>
                      )}
                    </div>

                    {/* Narrator + date */}
                    {(m.narrator || m.recorded_by_name) && (
                      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 0.85rem' }}>
                        {m.narrator ?? m.recorded_by_name}
                        {m.recorded_at && ` · ${new Date(m.recorded_at).toLocaleDateString()}`}
                      </p>
                    )}

                    {/* Audio */}
                    {m.audio_url && (
                      <div style={{ marginBottom: hasContent ? '0.85rem' : 0 }}>
                        {playingId === m.id ? (
                          <audio src={m.audio_url} autoPlay controls style={{ width: '100%' }} onEnded={() => setPlayingId(null)} />
                        ) : (
                          <button onClick={() => setPlayingId(m.id)} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '6px 14px', borderRadius: 20, fontSize: 13,
                            border: '1px solid var(--border)', background: 'transparent',
                            color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--sans)',
                          }}>
                            ▶ Play voice recording
                          </button>
                        )}
                      </div>
                    )}

                    {/* Recipe content — expandable */}
                    {hasContent && (
                      <>
                        <button onClick={() => setExpandedId(isExpanded ? null : m.id)} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          background: 'none', border: 'none', padding: '0.4rem 0',
                          fontSize: 13, color: 'var(--accent)', fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'var(--sans)',
                        }}>
                          {isExpanded ? '▲ Hide recipe' : '▼ See recipe'}
                        </button>

                        {isExpanded && (
                          <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                            {ingredients.length > 0 && (
                              <div style={{ marginBottom: '1rem' }}>
                                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '0.4rem' }}>
                                  Ingredients
                                </p>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {ingredients.map((ing, i) => (
                                    <li key={i} style={{ fontSize: 14, color: 'var(--text)', display: 'flex', gap: 8 }}>
                                      <span style={{ color: 'var(--accent)', flexShrink: 0 }}>·</span>
                                      <span>
                                        {ing.quantity && <span style={{ fontWeight: 600 }}>{ing.quantity} </span>}
                                        {ing.item}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {steps.length > 0 && (
                              <div style={{ marginBottom: m.cook_notes ? '1rem' : 0 }}>
                                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '0.4rem' }}>
                                  Steps
                                </p>
                                <ol style={{ padding: '0 0 0 1.25rem', margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {steps.map((s, i) => (
                                    <li key={i} style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{s}</li>
                                  ))}
                                </ol>
                              </div>
                            )}

                            {m.cook_notes && (
                              <div style={{ marginTop: steps.length > 0 ? '1rem' : 0, background: 'var(--cream)', borderRadius: 8, padding: '0.65rem 0.85rem' }}>
                                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '0.3rem' }}>
                                  Cook's notes
                                </p>
                                <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.6, fontStyle: 'italic' }}>{m.cook_notes}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    {/* Reaction bar */}
                    <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                      <ReactionBar
                        token={m.token}
                        initialData={reactions[m.token] ?? emptyReaction}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Sticky bottom banner — only for users who don't have their own group */}
      {!hasOwnGroup && <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        padding: '0.85rem 1.25rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '1rem', zIndex: 50,
        boxShadow: '0 -4px 20px rgba(0,0,0,0.07)',
      }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text2)', lineHeight: 1.4 }}>
          Want to preserve your family's memories?<br />
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>Start your own free archive.</span>
        </p>
        <a
          href={data.invite_url ?? '/'}
          style={{
            flexShrink: 0,
            display: 'inline-block',
            padding: '0.6rem 1.25rem',
            borderRadius: 10,
            background: 'var(--accent)',
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            fontFamily: 'var(--sans)',
            whiteSpace: 'nowrap',
          }}
        >
          Start yours free →
        </a>
      </div>}
    </div>
  )
}

export default function FamilyContent() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--muted)', fontFamily: 'var(--sans)' }}>Loading…</p>
      </div>
    }>
      <PortalContent />
    </Suspense>
  )
}
