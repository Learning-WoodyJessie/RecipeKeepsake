'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '../../lib/api'

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
}

type PortalData = {
  group: { name: string }
  memories: PortalMemory[]
  join_url?: string
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

  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeType, setActiveType] = useState<string>('all')
  const [playingId, setPlayingId] = useState<string | null>(null)

  useEffect(() => {
    if (!portalToken) {
      setError('Invalid portal link.')
      setLoading(false)
      return
    }
    api.portal.get(portalToken)
      .then((d: PortalData) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        setError('This family portal could not be found.')
        setLoading(false)
      })
  }, [portalToken])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sans)' }}>
        <p style={{ color: 'var(--muted)' }}>Loading family portal…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sans)' }}>
        <p style={{ color: 'var(--muted)' }}>{error || 'Something went wrong.'}</p>
      </div>
    )
  }

  const memories = data.memories ?? []
  const types = Array.from(new Set(memories.map(m => m.type ?? 'recipe').filter(Boolean)))
  const filtered = activeType === 'all' ? memories : memories.filter(m => (m.type ?? 'recipe') === activeType)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'var(--sans)' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
          {data.group.name}
        </h1>
        <p style={{ color: 'var(--muted)', marginTop: 8, fontSize: 15 }}>
          Family memories — shared with love
        </p>
      </div>

      {/* Type filter tabs */}
      {types.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {['all', ...types].map(t => (
            <button
              key={t}
              onClick={() => setActiveType(t)}
              style={{
                padding: '5px 14px',
                borderRadius: 20,
                border: '1px solid var(--border)',
                background: activeType === t ? 'var(--accent)' : 'transparent',
                color: activeType === t ? 'white' : 'var(--muted)',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'var(--sans)',
              }}
            >
              {t === 'all' ? 'All' : (TYPE_LABELS[t] ?? t)}
            </button>
          ))}
        </div>
      )}

      {/* Memory cards */}
      {filtered.length === 0 ? (
        <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: '3rem' }}>
          No memories here yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {filtered.map(m => (
            <div
              key={m.id}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {m.image_url && (
                <img
                  src={m.image_url}
                  alt={m.title}
                  style={{ width: '100%', height: 180, objectFit: 'cover' }}
                />
              )}
              <div style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>
                    {m.title}
                  </h2>
                  {m.type && m.type !== 'recipe' && (
                    <span style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      color: 'var(--muted)',
                      textTransform: 'capitalize',
                    }}>
                      {m.type}
                    </span>
                  )}
                </div>
                {(m.narrator || m.recorded_by_name) && (
                  <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 0.75rem' }}>
                    {m.narrator ?? m.recorded_by_name}
                    {m.recorded_at && ` · ${new Date(m.recorded_at).toLocaleDateString()}`}
                  </p>
                )}

                {m.audio_url && (
                  <div>
                    {playingId === m.id ? (
                      <audio
                        src={m.audio_url}
                        autoPlay
                        controls
                        style={{ width: '100%', marginTop: 4 }}
                        onEnded={() => setPlayingId(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setPlayingId(m.id)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '6px 14px', borderRadius: 20, fontSize: 13,
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--foreground)',
                          cursor: 'pointer',
                          fontFamily: 'var(--sans)',
                        }}
                      >
                        ▶ Play voice
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Join nudge */}
      {data.join_url && (
        <div style={{
          marginTop: '3rem',
          padding: '1.25rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          textAlign: 'center',
        }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', marginBottom: '0.75rem' }}>
            Want to add your own memories to this family archive?
          </p>
          <a
            href={data.join_url}
            style={{
              display: 'inline-block',
              padding: '8px 20px',
              borderRadius: 20,
              background: 'var(--accent)',
              color: 'white',
              fontSize: 14,
              textDecoration: 'none',
              fontFamily: 'var(--sans)',
            }}
          >
            Join the family
          </a>
        </div>
      )}
    </div>
  )
}

export default function FamilyPortalPage() {
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
