'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const NAV = [
  { group: 'Memories', items: [
    { label: 'Home', icon: '🏠', href: '/home' },
    { label: 'All Memories', icon: '📚', href: '/memories' },
  ]},
  { group: 'Capture', items: [
    { label: 'Record', icon: '🎙️', href: '/capture' },
    { label: 'Upload', icon: '📤', href: '/upload' },
  ]},
  { group: 'People', items: [
    { label: 'Narrators', icon: '👤', href: '/people' },
  ]},
  { group: 'Settings', items: [
    { label: 'Account', icon: '⚙️', href: '/account' },
    { label: 'Privacy', icon: '🔒', href: '/privacy' },
  ]},
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside style={{ width: 220, flexShrink: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '1.1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <p style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>Echoes of Home</p>
        <p style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 2 }}>Family memory keeper</p>
      </div>
      <nav style={{ padding: '0.6rem', flex: 1, overflowY: 'auto' }}>
        {NAV.map(group => (
          <div key={group.group}>
            <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', padding: '0.45rem 0.5rem 0.25rem', marginTop: '0.4rem' }}>
              {group.group}
            </div>
            {group.items.map(item => (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: '0.55rem',
                padding: '0.5rem 0.7rem', borderRadius: 9, fontSize: '0.82rem', fontWeight: 500,
                color: path === item.href ? 'var(--accent)' : 'var(--text2)',
                background: path === item.href ? 'var(--accent-light)' : 'transparent',
                textDecoration: 'none', marginBottom: 2,
              }}>
                <span>{item.icon}</span>{item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div style={{ padding: '0.8rem 1rem', borderTop: '1px solid var(--border)' }}>
        <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', fontSize: '0.78rem', color: 'var(--muted)', cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
    </aside>
  )
}
