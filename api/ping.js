import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL || 'https://wwvvmjkzrkirbyacpkmt.supabase.co'
  const key = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ZRrE0DquRxn8n4IM0YfGUw_DC2OI4o9'

  const supabase = createClient(url, key)

  try {
    const { data, error } = await supabase.from('locations').select('id').limit(1)
    if (error) {
      return res.status(500).json({ status: 'error', error: error.message })
    }

    return res.status(200).json({
      status: 'ok',
      message: 'Supabase pinged successfully! Project is active.',
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message })
  }
}
