import { supabase } from './supabase'

export async function signInWithGoogle(): Promise<void> {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
}

export async function signInWithApple(): Promise<void> {
  // Use Supabase OAuth redirect for Apple sign-in (works on web and native via browser)
  // Note: @capacitor-community/apple-sign-in does not yet support Capacitor 8
  await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
}
