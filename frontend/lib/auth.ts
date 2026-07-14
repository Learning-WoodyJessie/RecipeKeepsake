import { supabase } from './supabase'

const AUTH_CALLBACK = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
  : 'https://www.theechoesofhome.com/auth/callback'

export async function signInWithGoogle(): Promise<void> {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: AUTH_CALLBACK, queryParams: { prompt: 'select_account' } },
  })
}

export async function signInWithApple(): Promise<void> {
  // Use Supabase OAuth redirect for Apple sign-in (works on web and native via browser)
  // Note: @capacitor-community/apple-sign-in does not yet support Capacitor 8
  await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: AUTH_CALLBACK },
  })
}

/** Viewer role: send a one-time magic link to an email pre-approved by an owner. */
export async function sendViewerEmailOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: AUTH_CALLBACK },
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
