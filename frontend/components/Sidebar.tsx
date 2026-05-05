'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'

function pathMatches(path: string, href: string) {
  const a = (path.replace(/\/$/, '') || '/') || '/'
  const b = href.replace(/\/$/, '') || '/'
  return a === b
}

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const [profile, setProfile] = useState({ initial: '?', label: 'Account' })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const meta = user?.user_metadata ?? {}
      const name = (typeof meta.full_name === 'string' && meta.full_name) || (typeof meta.name === 'string' && meta.name) || user?.email?.split('@')[0] || 'You'
      setProfile({ initial: name.slice(0, 1).toUpperCase(), label: name })
    })
  }, [])

  const link = (href: string, label: string, icon: string, active?: boolean) => (
    <Link
      key={href}
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.55rem',
        padding: '0.52rem 0.75rem',
        borderRadius: 10,
        fontSize: '0.84rem',
        fontWeight: 500,
        color: active ? 'var(--accent)' : 'var(--text2)',
        background: active ? 'var(--accent-light)' : 'transparent',
        textDecoration: 'none',
        marginBottom: 2,
      }}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </Link>
  )

  return (
    <aside
      style={{
        width: 238,
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
      }}
    >
      <div style={{ padding: '1.15rem 1.2rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--accent-light)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
            }}
            aria-hidden
          >
            〰
          </div>
          <div>
            <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1.02rem', color: 'var(--text)', lineHeight: 1.2 }}>Echoes of Home</p>
            <p style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2 }}>♥ family memory keeper</p>
          </div>
        </div>
      </div>

      <nav style={{ padding: '0.55rem 0.65rem', flex: 1, overflowY: 'auto' }}>
        {link('/home', 'Home', '🏠', pathMatches(path, '/home'))}
        {link('/people', 'Our People', '👥', pathMatches(path, '/people'))}

        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', padding: '0.55rem 0.5rem 0.2rem', marginTop: '0.35rem' }}>
          Memories
        </div>
        {link('/memories', 'All Recipes', '📖', pathMatches(path, '/memories'))}

        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', padding: '0.55rem 0.5rem 0.2rem', marginTop: '0.35rem' }}>
          Record
        </div>
        {link('/capture', 'Capture a memory', '🎙️', pathMatches(path, '/capture'))}
        {link('/upload', 'Upload recording', '📤', pathMatches(path, '/upload'))}

        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', padding: '0.55rem 0.5rem 0.2rem', marginTop: '0.35rem' }}>
          Account
        </div>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          style={{
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            gap: '0.55rem',
            padding: '0.52rem 0.75rem',
            borderRadius: 10,
            fontSize: '0.84rem',
            fontWeight: 500,
            color: 'var(--text2)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            marginBottom: 2,
          }}
        >
          <span aria-hidden>🚪</span>
          Sign out
        </button>
        <Link
          href="/account"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.55rem',
            padding: '0.52rem 0.75rem',
            borderRadius: 10,
            fontSize: '0.84rem',
            fontWeight: 500,
            color: 'var(--accent)',
            textDecoration: 'none',
          }}
        >
          <span aria-hidden>🗑️</span>
          Delete account
        </Link>
      </nav>

      <button
        type="button"
        onClick={() => router.push('/account')}
        style={{
          margin: '0 0.75rem 0.85rem',
          padding: '0.65rem 0.75rem',
          borderRadius: 12,
          border: '1px solid var(--border)',
          background: 'var(--cream)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--accent-light)',
            color: 'var(--accent)',
            fontFamily: 'var(--serif)',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.9rem',
          }}
        >
          {profile.initial}
        </div>
        <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {profile.label}
        </span>
        <span style={{ opacity: 0.35, fontSize: '0.75rem' }} aria-hidden>
          ⌄
        </span>
      </button>
    </aside>
  )
}
