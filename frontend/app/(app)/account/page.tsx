// This file defines the Account page in the application.
// Purpose: Allows users to manage their account, including deleting their account and associated data.
// Why: Provides a critical feature for user account management and data privacy.
// How: Uses Next.js and React hooks to handle state and API calls for account deletion.

'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { buildPortalShareMessage, toWhatsAppUrl } from '@/lib/share'
import { supabase } from '@/lib/supabase'
import { signOut as authSignOut } from '@/lib/auth'

type Viewer = { id: string; email: string | null; phone: string | null; created_at: string; revoked_at: string | null }

function ShareWithFamily() {
  const [viewers, setViewers] = useState<Viewer[]>([])
  const [value, setValue] = useState('')
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
      await api.viewers.add({ email: value.trim() })
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
        Approve a family member's email for read-only viewing. They'll get a sign-in link, no account needed. Revoke access here anytime.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="family@example.com"
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

type FamilyGroupData = {
  group: { id: string; name: string; portal_token: string; invite_token: string }
  portal_url: string
  invite_url: string
}

function WaIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

function FamilyGroupSection() {
  const [data, setData] = useState<FamilyGroupData | null>(null)
  const [loading, setLoading] = useState(true)
  const [groupName, setGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<'portal' | 'invite' | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.family.getMyGroup()
      .then(d => setData(d as FamilyGroupData))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  async function createGroup() {
    if (!groupName.trim()) { setError('Enter a group name.'); return }
    setCreating(true); setError('')
    try {
      const d = await api.family.createGroup(groupName.trim())
      setData(d as FamilyGroupData)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  function copy(text: string, which: 'portal' | 'invite') {
    navigator.clipboard.writeText(text)
    setCopied(which)
    if (copyTimer.current) clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(null), 2000)
  }

  function sharePortal() {
    if (!data) return
    const msg = buildPortalShareMessage(data.group.name, data.portal_url)
    window.open(toWhatsAppUrl(msg), '_blank')
  }

  const card: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '1.5rem', marginBottom: '1.5rem',
  }
  const label: React.CSSProperties = {
    fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
    color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: '0.4rem',
  }

  if (loading) return null

  if (!data) return (
    <div style={card}>
      <h2 style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: '0.5rem', fontSize: '1rem' }}>Family collection</h2>
      <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
        Create a family collection so everyone can browse your memories together. No account needed.
        Share the invite link in your WhatsApp group so family members can add their own memories too.
      </p>
      {error && <p style={{ color: 'var(--accent)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={groupName}
          onChange={e => setGroupName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && createGroup()}
          placeholder="e.g. Lakshmi Family"
          style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 0.85rem', fontSize: '0.9rem', fontFamily: 'var(--sans)', background: 'var(--bg)', color: 'var(--text)' }}
        />
        <button onClick={createGroup} disabled={creating} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: creating ? 'default' : 'pointer', fontSize: '0.9rem' }}>
          {creating ? '…' : 'Create →'}
        </button>
      </div>
    </div>
  )

  return (
    <div style={card}>
      <h2 style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: '1rem', fontSize: '1rem' }}>
        Family collection · {data.group.name}
      </h2>

      <div style={{ marginBottom: '0.85rem' }}>
        <p style={label}>Collection link</p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.portal_url}</span>
          <button onClick={() => copy(data.portal_url, 'portal')} style={{ flexShrink: 0, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '0.3rem 0.75rem', fontSize: '0.78rem', cursor: 'pointer', color: copied === 'portal' ? 'var(--accent)' : 'var(--muted)' }}>
            {copied === 'portal' ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={sharePortal} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#25D366', color: 'white', border: 'none', borderRadius: 8, padding: '0.3rem 0.75rem', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'var(--sans)' }}>
            <WaIcon /> Share
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <p style={label}>Invite Link</p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.invite_url}</span>
          <button onClick={() => copy(data.invite_url, 'invite')} style={{ flexShrink: 0, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '0.3rem 0.75rem', fontSize: '0.78rem', cursor: 'pointer', color: copied === 'invite' ? 'var(--accent)' : 'var(--muted)' }}>
            {copied === 'invite' ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: '0.8rem', lineHeight: 1.5 }}>
        Share the collection link in your WhatsApp group so everyone can browse memories anytime. No account needed.
      </p>
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
      await authSignOut()
      router.replace('/')
    } catch (e: unknown) { setError((e as Error).message); setDeleting(false) }
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '1.5rem 2rem' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', color: 'var(--text)', marginBottom: '2rem' }}>Account</h1>

      <ShareWithFamily />

      <div id="family">
        <FamilyGroupSection />
      </div>

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
