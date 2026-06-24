// This file defines the Account page in the application.
// Purpose: Allows users to manage their account, including deleting their account and associated data.
// Why: Provides a critical feature for user account management and data privacy.
// How: Uses Next.js and React hooks to handle state and API calls for account deletion.

'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'

type Viewer = { id: string; email: string | null; phone: string | null; created_at: string; revoked_at: string | null }

function ShareWithFamily() {
  const [viewers, setViewers] = useState<Viewer[]>([])
  const [value, setValue] = useState('')
  const [channel, setChannel] = useState<'email' | 'phone'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function refresh() {
    api.viewers.list().then((data: { viewers: Viewer[] }) => setViewers(data.viewers ?? [])).catch(() => {})
  }

  useEffect(refresh, [])

  async function addViewer() {
    if (!value.trim()) return
    setBusy(true)
    setError('')
    try {
      await api.viewers.add(channel === 'email' ? { email: value.trim() } : { phone: value.trim() })
      setValue('')
      refresh()
    } catch (e: unknown) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function revoke(id: string) {
    try { await api.viewers.revoke(id); refresh() } catch (e: unknown) { setError((e as Error).message) }
  }

  const active = viewers.filter(v => !v.revoked_at)

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem', marginBottom: '1.5rem' }}>
      <h2 style={{ color: 'var(--text)', fontWeight: 600, marginBottom: '0.5rem', fontSize: '1rem' }}>Share with family</h2>
      <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
        Approve an email or phone for read-only viewing, no account creation needed on their end. They'll get a one-time code to sign in — revoke access here anytime.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <select value={channel} onChange={(e) => setChannel(e.target.value as 'email' | 'phone')} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem', fontSize: '0.85rem', background: 'var(--surface)', color: 'var(--text)' }}>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
        </select>
        <input
          type={channel === 'email' ? 'email' : 'tel'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={channel === 'email' ? 'family@example.com' : '+1 555 123 4567'}
          style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 0.85rem', fontSize: '0.85rem', background: 'var(--surface)', color: 'var(--text)' }}
        />
        <button onClick={addViewer} disabled={busy || !value.trim()} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '0.6rem 1.1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
          Invite
        </button>
      </div>
      {error && <p style={{ color: 'var(--accent)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{error}</p>}

      {active.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.5rem' }}>
          {active.map(v => (
            <li key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderTop: '1px solid var(--border)', fontSize: '0.85rem', color: 'var(--text2)' }}>
              <span>{v.email ?? v.phone}</span>
              <button onClick={() => revoke(v.id)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '0.3rem 0.7rem', fontSize: '0.75rem', color: 'var(--text2)', cursor: 'pointer' }}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function AccountPage() {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function deleteAccount() {
    if (!confirm('Permanently delete your account and all family memories? This cannot be undone.')) return
    if (!confirm('Are you absolutely sure? All audio, memories, and narrators will be erased.')) return
    setDeleting(true)
    try {
      await api.account.delete()
      await supabase.auth.signOut()
      router.replace('/')
    } catch (e: unknown) { setError((e as Error).message); setDeleting(false) }
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '1.5rem 2rem' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', color: 'var(--text)', marginBottom: '2rem' }}>Account</h1>

      <ShareWithFamily />

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
        <h2 style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: '0.5rem', fontSize: '1rem' }}>Delete account</h2>
        <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
          Permanently deletes all memories, audio recordings, narrator profiles, and your account. This cannot be undone.
        </p>
        {error && <p style={{ color: 'var(--accent)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
        <button onClick={deleteAccount} disabled={deleting} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '0.65rem 1.5rem', fontSize: '0.85rem', fontWeight: 600, cursor: deleting ? 'default' : 'pointer' }}>
          {deleting ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
    </div>
  )
}
