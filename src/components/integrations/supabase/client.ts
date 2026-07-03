// App Supabase client. Base URL uses `getSupabaseProjectUrl()` so local `VITE_SUPABASE_URL`
// (e.g. 127.0.0.1) reaches the host from the Android emulator; change that logic in `@/lib/supabaseProjectUrl`.
import { createClient } from '@supabase/supabase-js';
// import { getSupabaseProjectUrl } from '@/lib/supabaseProjectUrl';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});