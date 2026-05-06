import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Anon browser client — read-only access via RLS (leaderboard, own profile)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
