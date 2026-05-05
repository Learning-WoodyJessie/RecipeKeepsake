// This file defines the Memories page in the application.
// Purpose: Displays all memories stored in the user's account.
// Why: Provides a comprehensive view of all family memories for browsing and management.
// How: Fetches memory data from the API and renders it in a grid layout.

'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import MemoryCard from '@/components/MemoryCard'

type Memory = { token: string; dish_name: string | null; narrator: string | null; recorded_at: string; image_url: string | null }

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.recipes.list()
      .then(setMemories)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '2rem', color: 'var(--muted)' }}>Loading…</div>
  if (error) return <div style={{ padding: '2rem', color: 'var(--accent)' }}>{error}</div>

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', color: 'var(--text)', marginBottom: '1.5rem' }}>
        All Memories <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '1rem' }}>({memories.length})</span>
      </h1>
      {memories.length === 0
        ? <p style={{ color: 'var(--muted)' }}>No memories yet.</p>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
            {memories.map(m => <MemoryCard key={m.token} memory={m} />)}
          </div>
        )
      }
    </div>
  )
}
