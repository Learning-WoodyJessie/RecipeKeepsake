'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import MemoryCard from '@/components/MemoryCard'

type Memory = { token: string; dish_name: string | null; narrator: string | null; recorded_at: string; image_url: string | null }

export default function HomePage() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.recipes.list()
      .then(setMemories)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function getFavorites(): string[] {
    try { return JSON.parse(localStorage.getItem('rk_favorites') ?? '[]') } catch { return [] }
  }

  const favTokens = getFavorites()
  const favorites = memories.filter(m => favTokens.includes(m.token))
  const recent = memories.slice(0, 6)

  if (loading) return <div style={{ padding: '2rem', color: 'var(--muted)' }}>Loading…</div>
  if (error) return <div style={{ padding: '2rem', color: 'var(--accent)' }}>{error}</div>

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', color: 'var(--text)', marginBottom: '1.5rem' }}>
        Your Family Archive
      </h1>

      {favorites.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.75rem' }}>Favourites</h2>
          <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
            {favorites.map(m => (
              <div key={m.token} style={{ minWidth: 200 }}>
                <MemoryCard memory={m} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Recent Memories</h2>
          <Link href="/memories" style={{ fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none' }}>View all</Link>
        </div>
        {memories.length === 0
          ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
              No memories yet — <Link href="/capture" style={{ color: 'var(--accent)' }}>record the first one</Link>
            </div>
          )
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
              {recent.map(m => <MemoryCard key={m.token} memory={m} />)}
            </div>
          )
        }
      </section>
    </div>
  )
}
