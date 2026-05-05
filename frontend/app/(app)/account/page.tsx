'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'

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
