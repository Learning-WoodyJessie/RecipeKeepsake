import { createClient } from '@supabase/supabase-js'

// Fallback prevents createClient from throwing during Next.js static prerender
// when env vars are empty. Real values are injected at build time by Railway.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

// Singleton — auth only. Never use for data queries (use lib/api.ts instead).
export const supabase = createClient(url, key)

export async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}
