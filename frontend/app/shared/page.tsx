// Read-only archive view for the viewer role (Phase 5, Epic 16) — a family
// member pre-approved by an owner. No capture, edit, delete, or People
// management here; just browse and listen to what's been shared.

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { EchoesLogoMark } from '@/components/EchoesLogoMark'

type Memory = {
  token: string
  title: string | null
  narrator: string | null
  recorded_at: string
  image_url: string | null
  audio_url: string | null
  tags: string[] | null
}

function isTale(m: Memory) { return (m.tags ?? []).some(t => t === 'tale' || t === 'audio') }

function SharedContent() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.viewers.sharedWithMe()
      .then((data: { recipes: Memory[]; is_viewer: boolean }) => setMemories(data.recipes ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <EchoesLogoMark size={32} />
          <div>
            <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>Echoes of Home</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Shared with you · view only</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 10, padding: '0.5rem 1rem', fontSize: '0.82rem', color: 'var(--text2)', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </header>

      <div style={{ padding: '1.5rem', maxWidth: 1000, margin: '0 auto' }}>
        {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
        {error && <p style={{ color: 'var(--accent)' }}>{error}</p>}
        {!loading && !error && memories.length === 0 && (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: 14, border: '1px dashed var(--border)' }}>
            Nothing has been shared with you yet.
          </div>
        )}
        {!loading && memories.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
            {memories.map(m => (
              <Link key={m.token} href={`/shared/detail?token=${m.token}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ aspectRatio: '4/3', background: isTale(m) ? 'linear-gradient(135deg, var(--gold-light) 0%, #EAD9AE 100%)' : 'var(--cream2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isTale(m)
                      ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                      : m.image_url
                      ? <img src={m.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '2rem' }}>🍽️</span>}
                  </div>
                  <div style={{ padding: '0.75rem' }}>
                    <p style={{ fontFamily: 'var(--serif)', fontWeight: 600, color: 'var(--text)', fontSize: '0.92rem', marginBottom: '0.25rem' }}>{m.title ?? 'Untitled'}</p>
                    {m.narrator && <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{m.narrator}</p>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function SharedPage() {
  return (
    <AuthGuard>
      <SharedContent />
    </AuthGuard>
  )
}
