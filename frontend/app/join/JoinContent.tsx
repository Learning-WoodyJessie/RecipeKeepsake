'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'

function JoinInner() {
  const params = useSearchParams()
  const router = useRouter()
  const invite = params.get('invite') ?? ''
  const [status, setStatus] = useState<'loading' | 'joining' | 'done' | 'error' | 'needsAuth'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!invite) { setStatus('error'); setMessage('Invalid invite link.'); return }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setStatus('needsAuth'); return }
      setStatus('joining')
      try {
        const res = await api.family.join(invite) as { group_name: string }
        setMessage(`You've joined ${res.group_name}!`)
        setStatus('done')
        setTimeout(() => router.push('/collection'), 1500)
      } catch (e: unknown) {
        const msg = (e as Error).message
        if (msg.includes('Already in a family group')) {
          router.push('/collection')
        } else {
          setStatus('error')
          setMessage(msg)
        }
      }
    })
  }, [invite, router])

  const wrap: React.CSSProperties = { maxWidth: 420, margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }

  if (status === 'loading' || status === 'joining') return (
    <div style={wrap}>
      <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>
        {status === 'joining' ? 'Joining your family group…' : 'Loading…'}
      </p>
    </div>
  )

  if (status === 'done') return (
    <div style={wrap}>
      <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎉</p>
      <p style={{ fontFamily: 'var(--serif)', fontSize: '1.2rem', marginBottom: '0.5rem' }}>{message}</p>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Taking you to your family's memories…</p>
    </div>
  )

  if (status === 'needsAuth') return (
    <div style={wrap}>
      <p style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔒</p>
      <p style={{ fontFamily: 'var(--serif)', fontSize: '1.4rem', marginBottom: '0.75rem', lineHeight: 1.4 }}>
        You've been invited to a family memory group
      </p>
      <p style={{ color: 'var(--text2)', marginBottom: '0.5rem', lineHeight: 1.6, fontSize: '0.9rem' }}>
        We ask you to sign in to protect the memories already saved here.
      </p>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem', lineHeight: 1.6, fontSize: '0.85rem' }}>
        Without it, anyone who gets forwarded this link could access the entire family archive. A free account makes sure only the people you trust can see it.
      </p>
      <a
        href={`/?next=${encodeURIComponent(`/join?invite=${invite}`)}`}
        style={{
          display: 'inline-block',
          padding: '0.75rem 1.75rem',
          background: 'var(--accent)',
          color: 'white',
          borderRadius: 10,
          fontWeight: 600,
          textDecoration: 'none',
          fontSize: '0.95rem',
        }}
      >
        Sign in to join →
      </a>
    </div>
  )

  return (
    <div style={wrap}>
      <p style={{ color: 'var(--error, #c00)', lineHeight: 1.6 }}>
        {message || 'Something went wrong. Ask the group admin to resend the invite link.'}
      </p>
    </div>
  )
}

export default function JoinContent() {
  return (
    <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>}>
      <JoinInner />
    </Suspense>
  )
}
