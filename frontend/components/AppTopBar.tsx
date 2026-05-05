'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function displayName(user: { user_metadata?: Record<string, unknown>; email?: string } | null): string {
  if (!user) return 'friend'
  const meta = user.user_metadata ?? {}
  const full = meta.full_name ?? meta.name
  if (typeof full === 'string' && full.trim()) return full.split(' ')[0] ?? full
  const email = user.email
  if (email) return email.split('@')[0] ?? 'friend'
  return 'friend'
}

export default function AppTopBar() {
  const router = useRouter()
  const [name, setName] = useState('friend')
  const [initial, setInitial] = useState('?')
  const [q, setQ] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setName(displayName(user))
      const n = displayName(user)
      setInitial(n.slice(0, 1).toUpperCase())
    })
  }, [])

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    const s = q.trim()
    if (s) router.push(`/memories?q=${encodeURIComponent(s)}`)
    else router.push('/memories')
  }

  return (
    <header
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.85rem 1.5rem',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <form onSubmit={submitSearch} style={{ flex: 1, maxWidth: 520, display: 'flex' }}>
        <label style={{ position: 'relative', flex: 1, display: 'flex' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.45, fontSize: '0.95rem' }} aria-hidden>🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search memories, recipes, people…"
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem 0.65rem 2.5rem',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--cream)',
              fontSize: '0.88rem',
              fontFamily: 'var(--sans)',
              outline: 'none',
            }}
          />
        </label>
      </form>
      <p className="rk-greeting-desktop" style={{ fontFamily: 'var(--serif)', fontSize: '0.95rem', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
        Namaste, {name} <span aria-hidden>❤️</span>
      </p>
      <style>{`
        .rk-greeting-desktop { display: none; }
        @media (min-width: 900px) {
          .rk-greeting-desktop { display: block !important; }
        }
      `}</style>
      <button type="button" aria-label="Notifications" style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', opacity: 0.55 }}>
        🔔
      </button>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: 'var(--accent-light)',
          border: '2px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--serif)',
          fontWeight: 700,
          color: 'var(--accent)',
          fontSize: '0.95rem',
        }}
        title={name}
      >
        {initial}
      </div>
    </header>
  )
}
