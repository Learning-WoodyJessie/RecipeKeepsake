'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { EchoesLogoMark } from '@/components/EchoesLogoMark'
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
  bowl: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c-1 2-1 3 0 4s1 2 0 4"/><path d="M8 2c-1 2-1 3 0 4s1 2 0 4"/><path d="M16 2c-1 2-1 3 0 4s1 2 0 4"/><path d="M4 14h16"/><path d="M4 14c0 4 3.6 7 8 7s8-3 8-7"/>
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
  sparkle: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M5 3l.75 2.25L8 6l-2.25.75L5 9l-.75-2.25L2 6l2.25-.75z"/><path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75z"/>
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

export default function Sidebar({ isOpen = false, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const path = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [profile, setProfile] = useState({ initial: '?', label: 'Account' })
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)

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

  function navLinkAudio(href: string, label: string, icon: React.ReactNode) {
    const active = pathMatches(path, '/recipes') && searchParams.get('type') === 'audio'
    return (
      <Link
        key={href}
        href={href}
        onClick={onClose}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.52rem 0.75rem',
          borderRadius: 10,
          fontSize: '0.85rem',
          fontWeight: active ? 600 : 500,
          color: active ? 'var(--accent)' : 'var(--text2)',
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

  function navLink(href: string, label: string, icon: React.ReactNode, danger = false) {
    const isAudioMode = searchParams.get('type') === 'audio'
    const isSearchPage = path === '/search'
    const active = pathMatches(path, href)
      && !(href === '/recipes' && isAudioMode)
      && !isSearchPage
    return (
      <Link
        key={href}
        href={href}
        onClick={onClose}
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
    <>
      <style>{`
        .rk-sidebar {
          width: 240px;
          flex-shrink: 0;
          background: var(--surface);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow-y: auto;
        }
        @media (max-width: 699px) {
          .rk-sidebar {
            position: fixed;
            top: 0; left: 0; bottom: 0;
            z-index: 50;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            box-shadow: 4px 0 24px rgba(0,0,0,0.18);
          }
          .rk-sidebar.open {
            transform: translateX(0);
          }
        }
      `}</style>
    <aside className={`rk-sidebar${isOpen ? ' open' : ''}`}>
      {/* ── Logo ── */}
      <div
        style={{
          padding: '1.5rem 1rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
          position: 'relative',
        }}
      >
        {/* Mobile close button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rk-sidebar-close"
            aria-label="Close menu"
            style={{
              display: 'none',
              position: 'absolute', top: 12, right: 12,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', padding: '0.25rem',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
        <style>{`@media (max-width: 699px) { .rk-sidebar-close { display: block !important; } }`}</style>
        <EchoesLogoMark size={80} />

        {/* Brand name */}
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)', textAlign: 'center', lineHeight: 1.2, letterSpacing: '0.01em' }}>
          Echoes of Home
        </p>

        {/* Tagline */}
        <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '0.72rem', color: 'var(--muted)', textAlign: 'center', letterSpacing: '0.04em', margin: '-0.1rem 0 0' }}>
          Keepsake of memories
        </p>

        {/* Decorative divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: 0.5 }}>
          <div style={{ width: 28, height: 1, background: 'var(--amber)' }}/>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="var(--amber)">
            <path d="M4 0L4.8 3.2L8 4L4.8 4.8L4 8L3.2 4.8L0 4L3.2 3.2Z"/>
          </svg>
          <div style={{ width: 28, height: 1, background: 'var(--amber)' }}/>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav style={{ padding: '0.5rem 0.65rem', flex: 1 }}>
        {navLink('/home', 'Home', Icon.home)}
        {navLink('/people', 'Our People', Icon.people)}

        <div style={GROUP_LABEL}>Memories</div>
        {navLink('/recipes', 'All Recipes', Icon.bowl)}
        {navLinkAudio('/moments', 'Moments', Icon.sparkle)}

        <div style={GROUP_LABEL}>Record</div>
        {navLink('/capture', 'Capture a Memory', Icon.mic)}
        {navLink('/upload', 'Upload a Memory', Icon.upload)}

        {navLink('/faq', 'Help & FAQ', (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        ))}
      </nav>

      {/* ── Profile footer ── */}
      <div style={{ margin: '0 0.75rem 1rem', position: 'relative' }}>
        {/* Dropdown menu */}
        {profileMenuOpen && (
          <>
            {/* Backdrop to close on outside click */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              onClick={() => setProfileMenuOpen(false)}
            />
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                zIndex: 50,
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => { setProfileMenuOpen(false); router.push('/account') }}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: '0.6rem',
                  padding: '0.65rem 0.9rem', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem',
                  fontWeight: 500, color: 'var(--text2)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.65, flexShrink: 0 }}>
                  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
                Account settings
              </button>
              <button
                type="button"
                onClick={() => { setProfileMenuOpen(false); supabase.auth.signOut() }}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: '0.6rem',
                  padding: '0.65rem 0.9rem', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem',
                  fontWeight: 500, color: 'var(--text2)',
                }}
              >
                <span style={{ opacity: 0.65, flexShrink: 0 }}>{Icon.signout}</span>
                Sign out
              </button>
            </div>
          </>
        )}

        {/* Profile button */}
        <button
          type="button"
          onClick={() => setProfileMenuOpen(o => !o)}
          style={{
            width: '100%',
            padding: '0.6rem 0.75rem',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: profileMenuOpen ? 'var(--accent-light)' : 'var(--cream)',
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
          <span style={{ opacity: 0.4, flexShrink: 0, transform: profileMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>{Icon.chevron}</span>
        </button>
      </div>
    </aside>
    </>
  )
}
