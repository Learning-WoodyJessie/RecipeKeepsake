'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LandingPage() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/home')
    })
  }, [router])

  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(165deg, var(--cream) 0%, var(--cream2) 45%, #F0E4D8 100%)',
        color: 'var(--text)',
        fontFamily: 'var(--sans)',
      }}
    >
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: 'clamp(1.25rem, 4vw, 2.5rem)' }}>
        {/* Wordmark */}
        <header style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 'clamp(1.5rem, 4vw, 2.75rem)' }}>
          <div
            aria-hidden
            style={{
              position: 'relative',
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'var(--surface)',
              border: '2px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(196, 82, 42, 0.12)',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '1.2rem', lineHeight: 1, marginTop: -4 }}>〰</span>
            <span style={{ position: 'absolute', bottom: 7, left: '50%', transform: 'translateX(-50%)', fontSize: '0.5rem', color: 'var(--accent)' }}>♥</span>
          </div>
          <div style={{ position: 'relative' }}>
            <p style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.15rem, 2.5vw, 1.45rem)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              Echoes of Home
            </p>
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Family memory keeper
            </p>
          </div>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            gap: 'clamp(1.25rem, 3vw, 2rem)',
            alignItems: 'stretch',
          }}
          className="rk-landing-grid"
        >
          {/* Hero */}
          <section
            style={{
              background: 'linear-gradient(135deg, rgba(253, 238, 232, 0.95) 0%, var(--surface) 38%, var(--surface) 100%)',
              border: '1px solid var(--border)',
              borderRadius: 20,
              padding: 'clamp(1.35rem, 3.5vw, 2.25rem)',
              boxShadow: '0 12px 40px rgba(45, 27, 14, 0.06)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute',
                right: '-8%',
                top: '-20%',
                width: 'min(52%, 280px)',
                height: '140%',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(196, 82, 42, 0.08) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.65rem' }}>
                Welcome
              </p>
              <h1
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 'clamp(1.65rem, 4.5vw, 2.35rem)',
                  fontWeight: 700,
                  color: 'var(--text)',
                  lineHeight: 1.2,
                  marginBottom: '0.75rem',
                  maxWidth: '22ch',
                }}
              >
                Every family carries a world.
              </h1>
              <p
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 'clamp(1rem, 2.2vw, 1.15rem)',
                  fontStyle: 'italic',
                  color: 'var(--text2)',
                  lineHeight: 1.5,
                  maxWidth: 520,
                  marginBottom: '1.35rem',
                }}
              >
                Preserve their voices, recipes, and stories — before they fade. Record in Telugu or English, keep the audio, and pass it down.
              </p>

              <ul
                style={{
                  listStyle: 'none',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem 1.25rem',
                  marginBottom: '1.75rem',
                  color: 'var(--text2)',
                  fontSize: '0.82rem',
                }}
              >
                {['Voice & audio', 'Recipes & memories', 'Private to your family'].map((label) => (
                  <li key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ color: 'var(--accent)', fontSize: '0.7rem' }}>✦</span>
                    {label}
                  </li>
                ))}
              </ul>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.85rem' }}>
                <button
                  type="button"
                  onClick={signIn}
                  style={{
                    background: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 12,
                    padding: '0.9rem 1.85rem',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'var(--sans)',
                    letterSpacing: '0.02em',
                    boxShadow: '0 4px 16px rgba(196, 82, 42, 0.35)',
                  }}
                >
                  Continue with Google
                </button>
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', maxWidth: 260, lineHeight: 1.45 }}>
                  Sign in to your private archive. We never post publicly.
                </p>
              </div>
            </div>
          </section>

          {/* Quote card */}
          <aside
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 20,
              padding: 'clamp(1.25rem, 3vw, 1.75rem)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              boxShadow: '0 8px 28px rgba(45, 27, 14, 0.05)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 'clamp(1.05rem, 2.4vw, 1.25rem)',
                fontStyle: 'italic',
                color: 'var(--text2)',
                lineHeight: 1.55,
                marginBottom: '1rem',
              }}
            >
              “The stories we tell today become the treasures of tomorrow.”
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
              <span aria-hidden style={{ fontSize: '1rem' }}>
                ❀
              </span>
              <span>Share a memory. Keep the echoes alive.</span>
            </div>
          </aside>
        </div>

        <p style={{ textAlign: 'center', marginTop: 'clamp(2rem, 5vw, 3rem)', fontSize: '0.75rem', color: 'var(--muted)' }}>
          <a href="/privacy-policy" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Privacy policy</a>
          {' · '}
          <a href="/support" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Support</a>
          {' · '}After sign-in: Account from the app menu.
        </p>
      </div>

      <style>{`
        .rk-landing-grid { grid-template-columns: minmax(0, 1fr); }
        @media (min-width: 860px) {
          .rk-landing-grid { grid-template-columns: 1.15fr 0.85fr; align-items: start; }
        }
      `}</style>
    </main>
  )
}
