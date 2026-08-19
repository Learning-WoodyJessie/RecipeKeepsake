import { supabase } from './supabase'
import { clearUserData } from './favorites'
import { isNativeApp, signInOnNative } from './nativeAuth'

const AUTH_CALLBACK = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
  : 'https://www.theechoesofhome.com/auth/callback'

function callbackUrl(next?: string) {
  return next ? `${AUTH_CALLBACK}?next=${encodeURIComponent(next)}` : AUTH_CALLBACK
}

export async function signOut(): Promise<void> {
  clearUserData()
  await supabase.auth.signOut()
}

export async function signInWithGoogle(next?: string): Promise<void> {
  // Native shells must not hand OAuth to the system browser (App Store 4.0).
  if (isNativeApp()) return signInOnNative('google')

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl(next), queryParams: { prompt: 'select_account' } },
  })
  if (error) throw error
}

export async function signInWithApple(next?: string): Promise<void> {
  // On iOS this is the native ASAuthorization sheet, not a web redirect.
  if (isNativeApp()) return signInOnNative('apple')

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: callbackUrl(next) },
  })
  if (error) throw error
}

/** Viewer role: send a one-time magic link to an email pre-approved by an owner. */
export async function sendViewerEmailOtp(email: string, next?: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl(next) },
  })
  if (error) throw error
}

/** Viewer role: send a one-time SMS code. Requires an SMS provider configured in Supabase. */
export async function sendViewerPhoneOtp(phone: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone })
  if (error) throw error
}

/** Viewer role: verify the 6-digit SMS code sent by sendViewerPhoneOtp(). */
export async function verifyViewerPhoneOtp(phone: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' })
  if (error) throw error
}
