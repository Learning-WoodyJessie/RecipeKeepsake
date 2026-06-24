// Viewer entry point — for family members pre-approved by an owner to view
// (not capture/edit) an archive. Email sends a magic link via Supabase OTP;
// phone sends a 6-digit SMS code (requires an SMS provider configured in
// Supabase — see docs/DESIGN_DECISIONS.md "viewer role").

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { EchoesLogoMark } from '@/components/EchoesLogoMark'
import { sendViewerEmailOtp, sendViewerPhoneOtp, verifyViewerPhoneOtp } from '@/lib/auth'

type Channel = 'email' | 'phone'
type Stage = 'enter' | 'sent' | 'code' | 'error'

export default function ViewPage() {
  const router = useRouter()
  const [channel, setChannel] = useState<Channel>('email')
  const [value, setValue] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<Stage>('enter')
  const [error, setError] = useState('')

  async function sendCode() {
    setError('')
    try {
      if (channel === 'email') {
        await sendViewerEmailOtp(value.trim())
        setStage('sent')
      } else {
        await sendViewerPhoneOtp(value.trim())
        setStage('code')
      }
    } catch (e: unknown) {
      setError((e as Error).message)
      setStage('error')
    }
  }

  async function verifyCode() {
    setError('')
    try {
      await verifyViewerPhoneOtp(value.trim(), code.trim())
      router.replace('/auth/callback')
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
          Enter the email or phone the family added you with. We'll send a one-time code, no account needed.
        </p>

        {(stage === 'enter' || stage === 'error') && (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', background: 'var(--cream2)', borderRadius: 12, padding: '0.3rem' }}>
              {(['email', 'phone'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setChannel(c); setError(''); setStage('enter') }}
                  style={{
                    flex: 1, padding: '0.55rem 1rem', borderRadius: 10, border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--sans)', fontWeight: 600, fontSize: '0.85rem',
                    background: channel === c ? 'var(--accent)' : 'transparent',
                    color: channel === c ? 'white' : 'var(--muted)',
                  }}
                >
                  {c === 'email' ? 'Email' : 'Phone'}
                </button>
              ))}
            </div>

            <input
              type={channel === 'email' ? 'email' : 'tel'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={channel === 'email' ? 'you@example.com' : '+1 555 123 4567'}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '0.75rem 0.9rem', fontSize: '0.95rem', fontFamily: 'var(--sans)', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box', marginBottom: '1rem' }}
            />

            {error && <p style={{ color: 'var(--accent)', fontSize: '0.82rem', marginBottom: '0.85rem' }}>{error}</p>}

            <button
              type="button"
              onClick={sendCode}
              disabled={!value.trim()}
              style={{ width: '100%', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 12, padding: '0.85rem 1.5rem', fontSize: '0.95rem', fontWeight: 600, cursor: value.trim() ? 'pointer' : 'not-allowed', opacity: value.trim() ? 1 : 0.6 }}
            >
              Send me a code
            </button>
          </>
        )}

        {stage === 'sent' && (
          <p style={{ fontSize: '0.9rem', color: 'var(--text2)' }}>
            We've sent a link to <strong>{value}</strong>. Open it on this device to view what's been shared with you.
          </p>
        )}

        {stage === 'code' && (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '1rem' }}>Enter the code sent to {value}</p>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '0.75rem 0.9rem', fontSize: '1.1rem', textAlign: 'center', letterSpacing: '0.2em', fontFamily: 'var(--sans)', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box', marginBottom: '1rem' }}
            />
            {error && <p style={{ color: 'var(--accent)', fontSize: '0.82rem', marginBottom: '0.85rem' }}>{error}</p>}
            <button
              type="button"
              onClick={verifyCode}
              disabled={!code.trim()}
              style={{ width: '100%', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 12, padding: '0.85rem 1.5rem', fontSize: '0.95rem', fontWeight: 600, cursor: code.trim() ? 'pointer' : 'not-allowed', opacity: code.trim() ? 1 : 0.6 }}
            >
              Verify
            </button>
          </>
        )}

        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '1.5rem' }}>
          <Link href="/" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Back to sign in</Link>
        </p>
      </div>
    </main>
  )
}
