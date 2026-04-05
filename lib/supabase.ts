import { createClient } from '@supabase/supabase-js'

// Lazy singleton for client-side use
let _supabase: ReturnType<typeof createClient> | null = null

export function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _supabase
}

// Named export for convenience (client-side only)
export const supabase = typeof window !== 'undefined'
  ? getSupabase()
  : null as unknown as ReturnType<typeof createClient>

// Server-side client with service role (for API routes only)
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
