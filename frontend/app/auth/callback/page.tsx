// This file defines the Auth Callback page in the application.
// Purpose: Handles authentication state changes and redirects users after signing in.
// Why: Ensures seamless navigation after authentication events.
// How: Listens for auth state changes using Supabase and redirects users to the home page.

'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Viewer-role accounts (approved by an owner, signed in via OTP) land
        // on the read-only shared view instead of the normal capture/edit UI.
        api.viewers.sharedWithMe()
          .then((data: { is_viewer?: boolean }) => router.replace(data.is_viewer ? '/shared' : '/home'))
          .catch(() => router.replace('/home'))
      }
    })
  }, [router])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--cream)' }}>
      <p style={{ color: 'var(--muted)' }}>Signing you in…</p>
    </div>
  )
}
