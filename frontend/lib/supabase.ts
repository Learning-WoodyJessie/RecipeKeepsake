import { createClient } from '@supabase/supabase-js'

// Lazy factory — called inside async functions only, never at module level
// Avoids "supabaseUrl is required" crash during `next build` when env vars
// are empty strings (|| catches both undefined and "")
export function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'
  )
}
