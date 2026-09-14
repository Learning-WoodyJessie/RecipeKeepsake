/**
 * Purpose: Keep sign-in inside the native shell instead of bouncing to Safari.
 *
 * What: Google runs its OAuth page in SFSafariViewController and completes the
 * session over a custom-scheme deep link. Apple uses the native
 * ASAuthorizationController sheet instead — no browser involved.
 *
 * How (Google): signInWithOAuth(skipBrowserRedirect) yields the provider URL,
 * which is opened with @capacitor/browser (SFSafariViewController on iOS).
 * Supabase redirects back to echoesofhome://auth/callback, iOS reopens the
 * app, and the appUrlOpen listener turns the returned tokens into a session.
 *
 * How (Apple): @capawesome/capacitor-apple-sign-in drives the native
 * AuthenticationServices sheet directly (Face ID/Touch ID, pre-filled Apple
 * ID). The resulting identity token is exchanged for a Supabase session via
 * signInWithIdToken — no browser, no deep link round-trip.
 *
 * Why: Capacitor cancels top-level navigations to off-origin hosts and hands
 * them to UIApplication.open() — the system Safari (WebViewDelegationHandler
 * .swift:107). That is what App Store review rejected under Guideline 4 for
 * Google, and Safari View Controller is Apple's named remedy for that bug.
 * Apple sign-in is different: routing it through the same browser-hosted
 * OAuth page shows Apple's generic web login form (email/password) instead of
 * the native sheet users expect, which is what got the app rejected again
 * under Guideline 2.1(a) on Sep 12 2026 ("didn't show Sign in with Apple
 * properly"). Apple's own guidelines require the native AuthenticationServices
 * flow when Sign in with Apple is offered on iOS.
 */
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

export type OAuthProvider = 'google' | 'apple'

/** Custom scheme declared in ios/App/App/Info.plist (CFBundleURLSchemes). */
const NATIVE_REDIRECT = 'echoesofhome://auth/callback'

/** Raised when the user backs out; callers should stay silent rather than alarm. */
export class SignInCancelled extends Error {
  constructor() {
    super('Sign-in cancelled')
    this.name = 'SignInCancelled'
  }
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

function looksCancelled(e: unknown): boolean {
  // @capawesome/capacitor-apple-sign-in rejects with code "SIGN_IN_CANCELED"
  // when the user backs out of the native ASAuthorizationController sheet.
  if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'SIGN_IN_CANCELED') {
    return true
  }
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return /cancel|abort|dismiss|user closed/i.test(msg)
}

function randomNonce(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Native Sign in with Apple. Apple's request carries a SHA256-hashed nonce;
 * Supabase is given the raw nonce back and hashes it itself to verify the
 * identity token's nonce claim — both sides must agree on that pairing.
 */
async function signInWithAppleNative(): Promise<void> {
  const { AppleSignIn, SignInScope } = await import('@capawesome/capacitor-apple-sign-in')

  const rawNonce = randomNonce()
  const hashedNonce = await sha256Hex(rawNonce)

  let idToken: string
  try {
    const result = await AppleSignIn.signIn({
      scopes: [SignInScope.Email, SignInScope.FullName],
      nonce: hashedNonce,
    })
    idToken = result.idToken
  } catch (e) {
    if (looksCancelled(e)) throw new SignInCancelled()
    throw e
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: idToken,
    nonce: rawNonce,
  })
  if (error) throw error
}

/**
 * Turn a deep-link callback URL into a session.
 *
 * Supabase's default implicit flow returns tokens in the fragment; PKCE returns
 * ?code=. Both are handled so this keeps working if flowType ever changes.
 */
async function completeFromCallbackUrl(url: string): Promise<void> {
  const parsed = new URL(url)
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''))
  const query = parsed.searchParams

  const failure =
    query.get('error_description') ?? query.get('error') ??
    fragment.get('error_description') ?? fragment.get('error')
  if (failure) throw new Error(failure)

  const accessToken = fragment.get('access_token')
  const refreshToken = fragment.get('refresh_token')
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error) throw error
    return
  }

  const code = query.get('code') ?? fragment.get('code')
  if (!code) throw new Error('Sign-in did not return a session.')

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) throw error
}

/** Run OAuth in SFSafariViewController and finish over the deep link. */
export async function signInOnNative(provider: OAuthProvider): Promise<void> {
  if (provider === 'apple') return signInWithAppleNative()

  const [{ Browser }, { App }] = await Promise.all([
    import('@capacitor/browser'),
    import('@capacitor/app'),
  ])

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: NATIVE_REDIRECT,
        skipBrowserRedirect: true,
        ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
      },
    })
    if (error) throw error
    if (!data?.url) throw new Error('Could not start sign-in.')

    let settle!: { resolve: () => void; reject: (reason: unknown) => void }
    const finished = new Promise<void>((resolve, reject) => { settle = { resolve, reject } })

    // Registered before opening so a fast redirect cannot race past the listener.
    const onDeepLink = await App.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith(NATIVE_REDIRECT)) return
      try {
        await completeFromCallbackUrl(url)
        settle.resolve()
      } catch (e) {
        settle.reject(e)
      } finally {
        await Browser.close().catch(() => {})
      }
    })

    // Fires on our own close() too, but by then `finished` has already settled.
    const onDismiss = await Browser.addListener('browserFinished', () => {
      settle.reject(new SignInCancelled())
    })

    try {
      await Browser.open({ url: data.url, presentationStyle: 'popover' })
      await finished
    } finally {
      await onDeepLink.remove().catch(() => {})
      await onDismiss.remove().catch(() => {})
    }
  } catch (e) {
    if (e instanceof SignInCancelled || looksCancelled(e)) throw new SignInCancelled()
    throw e
  }
}
