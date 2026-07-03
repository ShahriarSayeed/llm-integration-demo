import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '❌ Missing Supabase env vars. Copy .env.example → .env and fill in your local keys.\n' +
    'Run `supabase status` to get them.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
