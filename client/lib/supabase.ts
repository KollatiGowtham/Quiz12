import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const USE_SUPABASE = (import.meta.env.VITE_USE_SUPABASE as string | undefined)?.toString().toLowerCase() === 'true';

// Guard: when disabled or env missing, we export a dummy that will throw on use
if (USE_SUPABASE && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  // eslint-disable-next-line no-console
  console.warn('[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. Supabase mode is enabled but misconfigured.');
}

export const supabase = USE_SUPABASE && SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : (null as any);

