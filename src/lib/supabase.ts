import { createClient } from '@supabase/supabase-js'

const defaultUrl = 'https://wwvvmjkzrkirbyacpkmt.supabase.co'
const defaultKey = 'sb_publishable_ZRrE0DquRxn8n4IM0YfGUw_DC2OI4o9'

const rawUrl = import.meta.env.VITE_SUPABASE_URL || defaultUrl
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || defaultKey

export const isSupabaseConfigured = Boolean(
  rawUrl &&
  rawKey &&
  !rawUrl.includes('your-project-id') &&
  rawUrl.startsWith('https://') &&
  rawKey !== 'your-anon-key-here'
)

const supabaseUrl = isSupabaseConfigured ? rawUrl : 'https://placeholder-project.supabase.co'
const supabaseAnonKey = isSupabaseConfigured ? rawKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createClient<any>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
