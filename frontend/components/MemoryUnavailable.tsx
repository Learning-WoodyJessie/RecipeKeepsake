'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { signOut as authSignOut } from '@/lib/auth'
import {
  requestRefOf, signedInAs, UNAVAILABLE_REASON, UNAVAILABLE_STEPS, UNAVAILABLE_TITLE,
} from '@/lib/memoryAccess'

/** Shown instead of a bare "not found" when a memory cannot be opened with the account that is signed in. */
export default function MemoryUnavailable({ error }: { error: string }) {
  const [email, setEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = requestRefOf(error)

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => setEmail(session?.user?.email ?? null))
      .catch(() => setEmail(null))
  }, [])

  // Sign out, then come back to this same memory once signed in with the other account.
  async function switchAccount() {
    if (busy) return
    setBusy(true)
    const here = window.location.pathname + window.location.search
    try { localStorage.setItem('returnTo', here) } catch { /* private mode: the ?next= below still carries it */ }
    await authSignOut()
    window.location.assign(`/?next=${encodeURIComponent(here)}`)
  }

  const who = signedInAs(email)
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '2.5rem 1.5rem', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.4rem', color: 'var(--text)', marginBottom: '0.6rem' }}>
        {UNAVAILABLE_TITLE}
      </h1>
      <p style={{ color: 'var(--text2)', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: '0.35rem' }}>{UNAVAILABLE_REASON}</p>
      {who && <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>{who}</p>}

      <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em', margin: '1.25rem 0 0.5rem' }}>
        What you can do
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', color: 'var(--text2)', fontSize: '0.9rem', lineHeight: 1.6 }}>
        {UNAVAILABLE_STEPS.map((step) => <li key={step} style={{ marginBottom: '0.4rem' }}>{step}</li>)}
      </ul>

      <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={switchAccount}
          disabled={busy}
          style={{ padding: '0.6rem 1.2rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, fontSize: '0.88rem', fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
        >
          Switch account
        </button>
        <Link
          href="/recipes"
          style={{ padding: '0.6rem 1.2rem', border: '1px solid var(--border)', borderRadius: 10, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)', textDecoration: 'none', background: 'var(--surface)' }}
        >
          Go to my recipes
        </Link>
      </div>

      {ref && <p style={{ color: 'var(--muted)', fontSize: '0.72rem', marginTop: '1.5rem' }}>Reference: {ref}</p>}
    </div>
  )
}
