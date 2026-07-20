'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { EchoesLogoMark } from '@/components/EchoesLogoMark'
import { sendViewerEmailOtp } from '@/lib/auth'

type Stage = 'enter' | 'sent' | 'error'

function ViewPageInner() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? undefined
  const [value, setValue] = useState('')
  const [stage, setStage] = useState<Stage>('enter')
  const [error, setError] = useState('')

  async function sendCode() {
    setError('')
    try {
      await sendViewerEmailOtp(value.trim(), next)
      setStage('sent')
    } catch (e: unknown) {
      setError((e as Error).message)
      setStage('error')
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(165deg, var(--cream) 0%, var(--cream2) 45%, #F0E4D8 100%)', padding: '1.5rem' }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: 20, padding: 'clamp(1.5rem, 4vw, 2.25rem)', textAlign: 'center', boxShadow: '0 8px 28px rgba(45,27,14,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <EchoesLogoMark size={40} />
        </div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>
          View shared memories
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
          Enter the email the family added you with. We'll send a sign-in link, no account needed.
        </p>

        {(stage === 'enter' || stage === 'error') && (
          <>
            <input
              type="email"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && value.trim() && sendCode()}
              placeholder="you@example.com"
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '0.75rem 0.9rem', fontSize: '0.95rem', fontFamily: 'var(--sans)', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box', marginBottom: '1rem' }}
            />
            {error && <p style={{ color: 'var(--accent)', fontSize: '0.82rem', marginBottom: '0.85rem' }}>{error}</p>}
            <button
              type="button"
              onClick={sendCode}
              disabled={!value.trim()}
              style={{ width: '100%', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 12, padding: '0.85rem 1.5rem', fontSize: '0.95rem', fontWeight: 600, cursor: value.trim() ? 'pointer' : 'not-allowed', opacity: value.trim() ? 1 : 0.6 }}
            >
              Send sign-in link
            </button>
          </>
        )}

        {stage === 'sent' && (
          <p style={{ fontSize: '0.9rem', color: 'var(--text2)', lineHeight: 1.6 }}>
            We've sent a link to <strong>{value}</strong>. Open it on this device to view what's been shared with you.
          </p>
        )}

        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '1.5rem' }}>
          <Link href="/" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Back to sign in</Link>
        </p>
      </div>
    </main>
  )
}

export default function ViewPage() {
  return <Suspense><ViewPageInner /></Suspense>
}
