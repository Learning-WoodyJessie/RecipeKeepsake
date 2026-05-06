import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

export async function signInWithGoogle(): Promise<void> {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
}

export async function signInWithApple(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // Native iOS: show the system sign-in sheet (Face ID / Touch ID)
    // Dynamic import so the plugin is only loaded on native — avoids SSR issues
    const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')
    const nonce = Math.random().toString(36).substring(2, 18)
    const result = await SignInWithApple.authorize({
      clientId: 'com.echoesofhome.app',
      redirectURI: 'https://vibrant-spontaneity-production-9f92.up.railway.app/auth/callback',
      scopes: 'email name',
      nonce,
    })
    await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: result.response.identityToken,
      nonce,
    })
  } else {
    // Web fallback: OAuth redirect — same pattern as Google
    // Full sign-in requires Supabase Apple provider credentials (Apple Developer account)
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }
}
