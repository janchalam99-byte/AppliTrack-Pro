import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useAppStore } from '../store/appStore'

/**
 * Global Realtime Sync Hook:
 * Listens to Supabase postgres_changes on transfer_requests,
 * transfer_request_items, and notifications tables.
 * Instantly invalidates all React Query caches across the app (< 100ms)
 * so Dashboard, Requests, History, and Detail pages update immediately.
 */
export function useRealtimeSync() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  const setUnreadCount = useAppStore((s) => s.setUnreadCount)

  useEffect(() => {
    // 1. Channel for Transfer Requests & Items
    const requestsChannel = supabase
      .channel('realtime:app-transfer-requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transfer_requests' },
        (payload) => {
          console.log('[Realtime] transfer_requests event:', payload.eventType)
          qc.invalidateQueries({ queryKey: ['requests'] })
          qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
          qc.invalidateQueries({ queryKey: ['recent-requests'] })
          qc.invalidateQueries({ queryKey: ['history'] })
          qc.invalidateQueries({ queryKey: ['tool-journey'] })
          if ((payload.new as any)?.id) {
            qc.invalidateQueries({ queryKey: ['request', (payload.new as any).id] })
          }
          if ((payload.old as any)?.id) {
            qc.invalidateQueries({ queryKey: ['request', (payload.old as any).id] })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transfer_request_items' },
        (payload) => {
          console.log('[Realtime] transfer_request_items event:', payload.eventType)
          qc.invalidateQueries({ queryKey: ['requests'] })
          qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
          qc.invalidateQueries({ queryKey: ['recent-requests'] })
          qc.invalidateQueries({ queryKey: ['tool-journey'] })
          const reqId = (payload.new as any)?.request_id || (payload.old as any)?.request_id
          if (reqId) {
            qc.invalidateQueries({ queryKey: ['request', reqId] })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'status_history' },
        () => {
          qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
          qc.invalidateQueries({ queryKey: ['recent-requests'] })
          qc.invalidateQueries({ queryKey: ['requests'] })
          qc.invalidateQueries({ queryKey: ['history'] })
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Connected to transfer_requests stream')
        }
      })

    // 2. Channel for Notifications
    const notifChannel = supabase
      .channel('realtime:app-notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        async () => {
          qc.invalidateQueries({ queryKey: ['notifications'] })
          if (profile?.id) {
            const { count } = await supabase
              .from('notifications')
              .select('*', { count: 'exact', head: true })
              .eq('recipient_id', profile.id)
              .eq('is_read', false)
            if (typeof count === 'number') {
              setUnreadCount(count)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(requestsChannel)
      supabase.removeChannel(notifChannel)
    }
  }, [qc, profile?.id, setUnreadCount])
}
