'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { signOut as authSignOut } from '@/lib/auth'

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

function displayName(user: { user_metadata?: Record<string, unknown>; email?: string } | null): string {
  if (!user) return 'friend'
  const meta = user.user_metadata ?? {}
  const full = meta.full_name ?? meta.name
  if (typeof full === 'string' && full.trim()) return cap(full.split(' ')[0] ?? full)
  const email = user.email
  if (email) return cap(email.split('@')[0] ?? 'friend')
  return 'friend'
}

export default function AppTopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [name, setName] = useState('friend')
  const [initial, setInitial] = useState('?')
  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // dirtyRef is set only by real user input (typing or the clear button) —
  // see the debounced navigate effect below for why this matters.
  const dirtyRef = useRef(false)

  // Keep input in sync with URL (back-nav, direct links). This is a URL-
  // driven change, not user input — clear dirtyRef so the debounced navigate
  // effect below doesn't treat it as a real edit. Without this, once a user
  // has typed in search even once this session, dirtyRef stays permanently
  // true, so navigating to ANY other page (which resets q via this effect)
  // re-arms the debounce and silently redirects to /recipes or /search
  // shortly after landing, regardless of what the user actually clicked.
  useEffect(() => {
    dirtyRef.current = false
    setQ(searchParams.get('q') ?? '')
  }, [searchParams])

  useEffect(() => {
    if (!menuOpen) return
    function onOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [menuOpen])

  async function signOut() {
    setMenuOpen(false)
    await authSignOut()
    router.replace('/')
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const n = displayName(user)
      setName(n)
      setInitial(n.slice(0, 1).toUpperCase())
    })
  }, [])

  // Live search — debounced 300ms, no submit needed
  const navigate = useCallback((val: string) => {
    const s = val.trim()
    if (s) {
      // Live search uses replace() (not push) so typing doesn't spam history —
      // that means the page you searched FROM isn't a distinct history entry,
      // so Search's own back-link can't rely on router.back(). Record it
      // explicitly the first time we leave a non-search page.
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/search')) {
        sessionStorage.setItem('searchOrigin', window.location.pathname + window.location.search)
      }
      router.replace(`/search?q=${encodeURIComponent(s)}`)
    }
    else router.replace('/recipes')
  }, [router])

  useEffect(() => {
    if (!dirtyRef.current) return
    const t = setTimeout(() => navigate(q), 300)
    return () => clearTimeout(t)
  }, [q, navigate])

  return (
    <header
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.85rem 1.75rem',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Hamburger — mobile only */}
      <button
        type="button"
        onClick={onMenuClick}
        className="rk-hamburger"
        aria-label="Open menu"
        style={{
          display: 'none',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.25rem',
          color: 'var(--text2)',
          flexShrink: 0,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <style>{`
        @media (max-width: 699px) { .rk-hamburger { display: block !important; } }
      `}</style>

      {/* Search — live, no submit button needed */}
      <div style={{ flex: 1, maxWidth: 520, position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.45, fontSize: '0.95rem', pointerEvents: 'none' }} aria-hidden>🔍</span>
        <input
          type="text"
          value={q}
          onChange={(e) => { dirtyRef.current = true; setQ(e.target.value) }}
          placeholder="Search by title or narrator…"
          style={{
            width: '100%',
            padding: q ? '0.65rem 2.4rem 0.65rem 2.5rem' : '0.65rem 0.85rem 0.65rem 2.5rem',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--cream)',
            fontSize: '0.88rem',
            fontFamily: 'var(--sans)',
            outline: 'none',
          }}
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => { dirtyRef.current = true; setQ('') }}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)', padding: '2px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {/* Greeting — hidden on small mobile */}
      <p
        className="rk-greeting"
        style={{
          fontFamily: 'var(--serif)',
          fontSize: '0.95rem',
          fontWeight: 600,
          color: 'var(--text)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Welcome home, {name}
      </p>
      <style>{`
        .rk-greeting { display: none; }
        @media (min-width: 700px) { .rk-greeting { display: block !important; } }
      `}</style>

      {/* Avatar with dropdown */}
      <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          aria-label="Account menu"
          title={name}
          onClick={() => setMenuOpen(o => !o)}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--serif)',
            fontWeight: 700,
            color: 'white',
            fontSize: '1rem',
            border: 'none',
            boxShadow: '0 2px 8px rgba(24,107,94,0.3)',
            cursor: 'pointer',
          }}
        >
          {initial}
        </button>

        {menuOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            minWidth: 170, zIndex: 200, overflow: 'hidden',
          }}>
            <div style={{ padding: '0.65rem 1rem 0.5rem', borderBottom: '1px solid var(--border)' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>{name}</p>
            </div>
            <button
              type="button"
              onClick={() => { setMenuOpen(false); router.push('/account') }}
              style={menuItemStyle}
            >
              Account settings
            </button>
            <button
              type="button"
              onClick={signOut}
              style={{ ...menuItemStyle, color: 'var(--accent)', borderTop: '1px solid var(--border)' }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  padding: '0.7rem 1rem',
  fontSize: '0.85rem',
  color: 'var(--text)',
  cursor: 'pointer',
  fontFamily: 'var(--sans)',
}
