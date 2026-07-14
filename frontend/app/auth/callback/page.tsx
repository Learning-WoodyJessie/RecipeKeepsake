'use client'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'

function AuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // URL param survives cross-browser OAuth (e.g. WhatsApp → system browser).
        // localStorage is the fallback for same-browser flows.
        const destination = searchParams.get('next') || localStorage.getItem('returnTo') || '/home'
        localStorage.removeItem('returnTo')

        // Viewer-role accounts land on the read-only shared view.
        api.viewers.sharedWithMe()
          .then((data: { is_viewer?: boolean }) => {
            router.replace(data.is_viewer ? '/shared' : destination)
          })
          .catch(() => router.replace(destination))
      }
    })
  }, [router, searchParams])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--cream)' }}>
      <p style={{ color: 'var(--muted)' }}>Signing you in…</p>
    </div>
  )
}

export default function AuthCallback() {
  return <Suspense><AuthCallbackInner /></Suspense>
}
