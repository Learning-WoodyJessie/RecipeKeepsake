'use client'
import { Suspense, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'

function AuthCallbackInner() {
  const router = useRouter()

  // Read `next` immediately at mount — before Supabase calls history.replaceState
  // to strip the code param, which also wipes our `next` query string.
  const nextRef = useRef<string | null>(
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('next')
      : null
  )

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const destination = nextRef.current || localStorage.getItem('returnTo') || '/home'
        localStorage.removeItem('returnTo')

        api.viewers.sharedWithMe()
          .then((data: { is_viewer?: boolean }) => {
            router.replace(data.is_viewer ? '/shared' : destination)
          })
          .catch(() => router.replace(destination))
      }
    })
    return () => subscription.unsubscribe()
  }, [router])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--cream)' }}>
      <p style={{ color: 'var(--muted)' }}>Signing you in…</p>
    </div>
  )
}

export default function AuthCallback() {
  return <Suspense><AuthCallbackInner /></Suspense>
}
