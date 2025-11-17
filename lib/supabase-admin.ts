import { createClient } from '@supabase/supabase-js'

// ONLY use this in API routes or Server Actions. NEVER in Client Components.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
)