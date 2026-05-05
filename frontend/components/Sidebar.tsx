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

// SVG icons matching the mockup line-art style
const Icon = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  people: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  book: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  ),
  mic: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    </svg>
  ),
  upload: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
    </svg>
  ),
  signout: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  trash: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  ),
  chevron: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
}

const GROUP_LABEL: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  padding: '0.6rem 0.75rem 0.25rem',
  marginTop: '0.25rem',
}

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const [profile, setProfile] = useState({ initial: '?', label: 'Account' })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const meta = user?.user_metadata ?? {}
      const name =
        (typeof meta.full_name === 'string' && meta.full_name) ||
        (typeof meta.name === 'string' && meta.name) ||
        user?.email?.split('@')[0] ||
        'You'
      setProfile({ initial: name.slice(0, 1).toUpperCase(), label: name })
    })
  }, [])

  function navLink(href: string, label: string, icon: React.ReactNode, danger = false) {
    const active = pathMatches(path, href)
    return (
      <Link
        key={href}
        href={href}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.52rem 0.75rem',
          borderRadius: 10,
          fontSize: '0.85rem',
          fontWeight: active ? 600 : 500,
          color: danger ? 'var(--accent)' : active ? 'var(--accent)' : 'var(--text2)',
          background: active ? 'var(--accent-light)' : 'transparent',
          textDecoration: 'none',
          marginBottom: 2,
        }}
      >
        <span style={{ opacity: active ? 1 : 0.65, flexShrink: 0 }}>{icon}</span>
        {label}
      </Link>
    )
  }

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflowY: 'auto',
      }}
    >
      {/* ── Logo ── */}
      <div
        style={{
          padding: '1.5rem 1rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.6rem',
        }}
      >
        {/* Orange circle logo */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(196,82,42,0.28)',
            overflow: 'hidden',
          }}
        >
          <img
            src="/echoes-logo.png"
            alt="Echoes of Home"
            style={{ width: '170%', height: '170%', objectFit: 'cover', objectPosition: '50% 32%' }}
            onError={(e) => {
              // Fallback: show waveform SVG if image fails
              const el = e.currentTarget
              el.style.display = 'none'
              el.parentElement!.innerHTML = `<svg width="32" height="22" viewBox="0 0 32 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="0" y="6" width="3" height="10" rx="1.5" fill="white"/>
                <rect x="5" y="2" width="3" height="18" rx="1.5" fill="white"/>
                <rect x="10" y="0" width="3" height="22" rx="1.5" fill="white"/>
                <rect x="15" y="4" width="3" height="14" rx="1.5" fill="white"/>
                <rect x="20" y="1" width="3" height="20" rx="1.5" fill="white"/>
                <rect x="25" y="5" width="3" height="12" rx="1.5" fill="white"/>
                <rect x="0" y="8" width="3" height="6" rx="1.5" fill="rgba(255,255,255,0.4)"/>
              </svg>`
            }}
          />
        </div>
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>
          Echoes of Home
        </p>
      </div>

      {/* ── Nav ── */}
      <nav style={{ padding: '0.5rem 0.65rem', flex: 1 }}>
        {navLink('/home', 'Home', Icon.home)}
        {navLink('/people', 'Our People', Icon.people)}

        <div style={GROUP_LABEL}>Memories</div>
        {navLink('/memories', 'All Recipes', Icon.book)}

        <div style={GROUP_LABEL}>Record</div>
        {navLink('/capture', 'Capture a Memory', Icon.mic)}
        {navLink('/upload', 'Upload Recording', Icon.upload)}

        <div style={GROUP_LABEL}>Account</div>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          style={{
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.52rem 0.75rem',
            borderRadius: 10,
            fontSize: '0.85rem',
            fontWeight: 500,
            color: 'var(--text2)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            marginBottom: 2,
          }}
        >
          <span style={{ opacity: 0.65, flexShrink: 0 }}>{Icon.signout}</span>
          Sign out
        </button>
        <Link
          href="/account"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.52rem 0.75rem',
            borderRadius: 10,
            fontSize: '0.85rem',
            fontWeight: 500,
            color: 'var(--accent)',
            textDecoration: 'none',
          }}
        >
          <span style={{ flexShrink: 0 }}>{Icon.trash}</span>
          Delete account
        </Link>
      </nav>

      {/* ── Profile footer ── */}
      <button
        type="button"
        onClick={() => router.push('/account')}
        style={{
          margin: '0 0.75rem 1rem',
          padding: '0.6rem 0.75rem',
          borderRadius: 12,
          border: '1px solid var(--border)',
          background: 'var(--cream)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--accent)',
            color: 'white',
            fontFamily: 'var(--serif)',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.95rem',
            flexShrink: 0,
          }}
        >
          {profile.initial}
        </div>
        <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {profile.label}
        </span>
        <span style={{ opacity: 0.4, flexShrink: 0 }}>{Icon.chevron}</span>
      </button>
    </aside>
  )
}
