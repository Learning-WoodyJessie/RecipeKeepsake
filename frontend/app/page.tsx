'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { signInWithGoogle, signInWithApple } from '@/lib/auth'
import { EchoesLogoMark } from '@/components/EchoesLogoMark'

const features = [
  {
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    ),
    label: 'Voice & audio',
  },
  {
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
    label: 'Recipes & memories',
  },
  {
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    label: 'Private to your family',
  },
]

export default function LandingPage() {
  return <Suspense><LandingPageInner /></Suspense>
}

function LandingPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? ''

  useEffect(() => {
    // Persist next in localStorage so the auth callback can read it
    // even if localStorage was cleared during the OAuth round-trip
    if (next) localStorage.setItem('returnTo', next)
  }, [next])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace(next || '/home')
    })
  }, [router, next])

  function handleGoogle() {
    if (next) localStorage.setItem('returnTo', next)
    signInWithGoogle()
  }

  function handleApple() {
    if (next) localStorage.setItem('returnTo', next)
    signInWithApple()
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(165deg, var(--cream) 0%, var(--cream2) 45%, #F0E4D8 100%)',
        fontFamily: 'var(--sans)',
        color: 'var(--text)',
      }}
    >
      <style>{`
        /* Mobile: single column centered card */
        .rk-landing-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: clamp(1.5rem, 5vw, 3rem) 1rem;
        }
        .rk-landing-hero {
          display: none;
        }
        .rk-landing-card {
          width: 100%;
          max-width: 480px;
        }
        .rk-hero-img-block {
          width: 100%;
          height: 200px;
          position: relative;
          overflow: hidden;
          background: linear-gradient(160deg, #C8A882 0%, #B07848 35%, #8B4E24 100%);
          border-radius: 20px 20px 0 0;
        }
        .rk-quote-card {
          width: 100%;
          max-width: 480px;
          margin-top: 1rem;
        }

        /* Desktop: two-column split */
        @media (min-width: 768px) {
          .rk-landing-wrap {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr auto;
            padding: 0;
            min-height: 100vh;
            align-items: stretch;
          }
          .rk-landing-hero {
            display: block;
            grid-column: 1;
            grid-row: 1 / 3;
            position: relative;
            overflow: hidden;
            min-height: 100vh;
          }
          .rk-landing-card {
            grid-column: 2;
            grid-row: 1;
            max-width: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: clamp(2rem, 5vw, 4rem) clamp(2rem, 5vw, 4rem);
            background: transparent;
            border: none;
            box-shadow: none;
            border-radius: 0;
          }
          .rk-hero-img-block {
            display: none;
          }
          .rk-quote-card {
            grid-column: 2;
            grid-row: 2;
            max-width: 100%;
            margin-top: 0;
            border-radius: 0;
            border-top: 1px solid var(--border);
            padding: 1.5rem clamp(2rem, 5vw, 4rem);
          }
          .rk-landing-footer {
            display: none;
          }
        }

        @media (min-width: 1100px) {
          .rk-landing-wrap {
            grid-template-columns: 55% 45%;
          }
        }
      `}</style>

      <div className="rk-landing-wrap">

        {/* Desktop hero — left column (hidden on mobile) */}
        <div className="rk-landing-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/landing-hero.jpg"
            alt=""
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: '30% center',
            }}
          />
          {/* Dark gradient overlay for text legibility */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to bottom, rgba(45,27,14,0.15) 0%, rgba(45,27,14,0.55) 100%)',
            }}
          />
          {/* Overlay text */}
          <div
            style={{
              position: 'absolute',
              bottom: '2.5rem',
              left: '2rem',
              right: '2rem',
              color: 'white',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 'clamp(1.4rem, 2.5vw, 2rem)',
                fontStyle: 'italic',
                lineHeight: 1.4,
                marginBottom: '0.75rem',
                textShadow: '0 2px 12px rgba(0,0,0,0.4)',
              }}
            >
              "Every family carries a world.<br />Don't let it fade."
            </p>
            <p style={{ fontSize: '0.85rem', opacity: 0.85, letterSpacing: '0.05em' }}>
              Echoes of Home · Memory Keepsake
            </p>
          </div>
        </div>

        {/* Sign-in card — right column on desktop, centered card on mobile */}
        <div className="rk-landing-card">

          {/* Mobile: hero image inside the card */}
          <div className="rk-hero-img-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing-hero.jpg"
              alt=""
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: '25% center',
              }}
            />
            <div
              aria-hidden
              style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0, height: 40,
                background: 'linear-gradient(to bottom, transparent, rgba(255,252,248,0.4))',
              }}
            />
          </div>

          {/* Card content wrapper — white card on mobile, plain on desktop */}
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 'clamp(0px, 2vw, 24px)',
              padding: 'clamp(1.5rem, 4vw, 2rem)',
              textAlign: 'center',
            }}
          >
            {/* Logo + wordmark */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.7rem', marginBottom: '1.5rem' }}>
              <div style={{ flexShrink: 0, filter: 'drop-shadow(0 3px 8px rgba(24, 107, 94, 0.18))' }}>
                <EchoesLogoMark size={40} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontFamily: 'var(--serif)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                  Echoes of Home
                </p>
                <p style={{ fontSize: '0.63rem', color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>
                  Memory Keepsake
                </p>
              </div>
            </div>

            {/* Welcome eyebrow */}
            <p style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.5rem' }}>
              Welcome
            </p>

            {/* Headline */}
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(1.55rem, 3vw, 2.1rem)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, marginBottom: '0.75rem' }}>
              Keep your family's stories alive.
            </h1>

            {/* Subheadline */}
            <p style={{ color: 'var(--text2)', fontSize: 'clamp(0.88rem, 1.5vw, 1rem)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Record voices, recipes, and memories.
              <br />
              All in one private place.
            </p>

            {/* Feature row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '0.1rem', marginBottom: '1.75rem', fontSize: '0.8rem', color: 'var(--text2)' }}>
              {features.map((f, i) => (
                <span key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  {i > 0 && (
                    <span style={{ color: 'var(--border)', margin: '0 0.6rem', fontSize: '1rem', lineHeight: 1 }}>|</span>
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>{f.icon}</span>
                    {f.label}
                  </span>
                </span>
              ))}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.1rem' }}>
              <button
                type="button"
                onClick={handleGoogle}
                style={{
                  width: '100%',
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 12,
                  padding: '0.9rem 1.5rem',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--sans)',
                  letterSpacing: '0.02em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem',
                  boxShadow: '0 4px 14px rgba(24, 107, 94, 0.30)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="rgba(255,255,255,0.85)" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="rgba(255,255,255,0.7)" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="rgba(255,255,255,0.9)" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>

              <button
                type="button"
                onClick={handleApple}
                style={{
                  width: '100%',
                  background: '#FFFFFF',
                  color: '#1D1D1F',
                  border: '1.5px solid #1D1D1F',
                  borderRadius: 12,
                  padding: '0.9rem 1.5rem',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--sans)',
                  letterSpacing: '0.02em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem',
                }}
              >
                <svg width="15" height="18" viewBox="0 0 814 1000" fill="#1D1D1F" aria-hidden="true">
                  <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-42.3-150.3-109.3S43.1 658 43.1 520c0-241.9 157.1-369.5 310.8-369.5 72.6 0 132.8 47.3 177.9 47.3 43.1 0 110.8-50.6 190.5-50.6 30.8 0 133.3 2.9 198.9 106.5zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
                </svg>
                Continue with Apple
              </button>
            </div>

            {/* Privacy note */}
            <p style={{ fontSize: '0.77rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              We never post publicly.
            </p>

            {/* Viewer entry point — for family approved to view, not capture */}
            <p style={{ fontSize: '0.8rem', color: 'var(--text2)', marginTop: '1rem' }}>
              Were you invited to view a family archive?{' '}
              <a href="/view" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>View shared memories</a>
            </p>
          </div>
        </div>

        {/* Quote card — below sign-in */}
        <div
          className="rk-quote-card"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: 'clamp(1.1rem, 3vw, 1.5rem)',
            boxShadow: '0 8px 28px rgba(45, 27, 14, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem',
          }}
        >
          <p style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(0.95rem, 1.5vw, 1.05rem)', fontStyle: 'italic', color: 'var(--text2)', lineHeight: 1.55 }}>
            "The stories we tell today become the treasures of tomorrow."
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
            <span aria-hidden style={{ fontSize: '0.95rem' }}>❀</span>
            <span>Share a voice. Keep the echoes alive.</span>
          </div>
        </div>

        {/* Footer — mobile only (hidden on desktop via CSS) */}
        <p className="rk-landing-footer" style={{ marginTop: 'clamp(1.25rem, 3vw, 2rem)', fontSize: '0.74rem', color: 'var(--muted)', textAlign: 'center', width: '100%', maxWidth: 480 }}>
          <a href="/privacy-policy" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Privacy policy</a>
          {' · '}
          <a href="/support" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Support</a>
          {' · '}After sign-in: Account from the app menu.
        </p>

      </div>
    </main>
  )
}
