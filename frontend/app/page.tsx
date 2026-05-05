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
    <main style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <p style={{ fontFamily: 'var(--serif)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)', textAlign: 'center', marginBottom: '0.5rem' }}>
        Echoes of Home
      </p>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.25rem', fontWeight: 400, fontStyle: 'italic', color: 'var(--text2)', textAlign: 'center', maxWidth: 480, lineHeight: 1.4, marginBottom: '1rem' }}>
        Every family carries a world.
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: '2.5rem', textAlign: 'center', maxWidth: 400, lineHeight: 1.6, fontSize: '0.9rem' }}>
        Preserve their voices, recipes, and stories — before they fade.
      </p>
      <button onClick={signIn} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 12, padding: '0.85rem 2.25rem', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--sans)', letterSpacing: '0.01em' }}>
        Continue with Google
      </button>
    </main>
  )
}
