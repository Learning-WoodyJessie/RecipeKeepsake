/**
 * Purpose: Keep sign-in inside the native shell instead of bouncing to Safari.
 *
 * What: Runs the provider's OAuth page in SFSafariViewController and completes
 * the session over a custom-scheme deep link.
 *
 * How: signInWithOAuth(skipBrowserRedirect) yields the provider URL, which is
 * opened with @capacitor/browser (SFSafariViewController on iOS). Supabase
 * redirects back to echoesofhome://auth/callback, iOS reopens the app, and the
 * appUrlOpen listener turns the returned tokens into a session.
 *
 * Why: Capacitor cancels top-level navigations to off-origin hosts and hands
 * them to UIApplication.open() — the system Safari (WebViewDelegationHandler
 * .swift:107). That is what App Store review rejected under Guideline 4, and it
 * also stranded the session in Safari so the app could never finish a login.
 * Apple's rejection names Safari View Controller as an acceptable remedy.
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
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return /cancel|abort|dismiss|user closed/i.test(msg)
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
