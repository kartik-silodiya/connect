import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // ✅ This is the browser client. It is safe for Client Components.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}