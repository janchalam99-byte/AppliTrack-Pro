import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wwvvmjkzrkirbyacpkmt.supabase.co'
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ZRrE0DquRxn8n4IM0YfGUw_DC2OI4o9'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function broadcastUpdate() {
  console.log('📡 Broadcasting AppliTrack Pro v2.1.0 update notification to all users...')

  try {
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, full_name, role')

    if (pErr) {
      console.error('Failed to fetch profiles:', pErr)
      return
    }

    if (!profiles || profiles.length === 0) {
      console.log('No profiles found.')
      return
    }

    console.log(`Found ${profiles.length} user profile(s).`)

    const notifTitle = '🚀 อัปเดตระบบ AppliTrack Pro v2.1.0'
    const notifMessage = 'ระบบได้รับการอัปเดต: ป้องกันการกดส่งซ้ำ & ล็อก 0ms ไม่ทำให้ระบบค้าง, แก้ไขการลบชื่อด่วนถาวร, และเพิ่มความเสถียรของ Realtime'

    for (const profile of profiles) {
      // Check if already notified for v2.1.0 to avoid duplicates
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('recipient_id', profile.id)
        .eq('title', notifTitle)
        .limit(1)

      if (existing && existing.length > 0) {
        console.log(`User ${profile.full_name || profile.id} already received notification. Skipping.`)
        continue
      }

      const { error: insErr } = await supabase
        .from('notifications')
        .insert({
          recipient_id: profile.id,
          type: 'new_request', // safe standard notification type
          title: notifTitle,
          message: notifMessage,
          is_read: false,
          created_at: new Date().toISOString()
        })

      if (insErr) {
        console.warn(`Could not insert notif for ${profile.id}:`, insErr.message)
      } else {
        console.log(`✅ Sent update alert to: ${profile.full_name || profile.id} (${profile.role})`)
      }
    }

    console.log('🎉 Broadcast completed successfully!')
  } catch (err) {
    console.error('Broadcast error:', err)
  }
}

broadcastUpdate()
