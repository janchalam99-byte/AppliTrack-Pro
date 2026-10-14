import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useAppStore } from '../store/appStore'

/**
 * Global Realtime Sync Hook:
 * Listens to Supabase postgres_changes on transfer_requests,
 * transfer_request_items, and notifications tables.
 * Uses a debounced batching mechanism to prevent app freeze / UI hanging
 * when multiple inserts, status updates, or notifications arrive in rapid bursts.
 */
export function useRealtimeSync() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  const setUnreadCount = useAppStore((s) => s.setUnreadCount)

  const requestsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRequestIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    // Debounced sync for transfer requests & related items (300ms window)
    const triggerDebouncedRequestsSync = (reqId?: string) => {
      if (reqId) {
        pendingRequestIds.current.add(reqId)
      }
      if (requestsTimerRef.current) {
        clearTimeout(requestsTimerRef.current)
      }
      requestsTimerRef.current = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['requests'] })
        qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
        qc.invalidateQueries({ queryKey: ['recent-requests'] })
        qc.invalidateQueries({ queryKey: ['history'] })
        qc.invalidateQueries({ queryKey: ['tool-journey'] })

        pendingRequestIds.current.forEach(id => {
          qc.invalidateQueries({ queryKey: ['request', id] })
        })
        pendingRequestIds.current.clear()
      }, 300)
    }

    // Debounced sync for unread notifications count (350ms window)
    const triggerDebouncedNotifSync = () => {
      if (notifTimerRef.current) {
        clearTimeout(notifTimerRef.current)
      }
      notifTimerRef.current = setTimeout(async () => {
        qc.invalidateQueries({ queryKey: ['notifications'] })
        if (profile?.id) {
          try {
            const { count } = await supabase
              .from('notifications')
              .select('*', { count: 'exact', head: true })
              .eq('recipient_id', profile.id)
              .eq('is_read', false)
            if (typeof count === 'number') {
              setUnreadCount(count)
            }
          } catch (e) {
            console.warn('[Realtime] notification count query error:', e)
          }
        }
      }, 350)
    }

    // 1. Channel for Transfer Requests & Items
    const requestsChannel = supabase
      .channel('realtime:app-transfer-requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transfer_requests' },
        (payload) => {
          const reqId = (payload.new as any)?.id || (payload.old as any)?.id
          triggerDebouncedRequestsSync(reqId)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transfer_request_items' },
        (payload) => {
          const reqId = (payload.new as any)?.request_id || (payload.old as any)?.request_id
          triggerDebouncedRequestsSync(reqId)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'status_history' },
        (payload) => {
          const reqId = (payload.new as any)?.request_id
          triggerDebouncedRequestsSync(reqId)
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
        () => {
          triggerDebouncedNotifSync()
        }
      )
      .subscribe()

    return () => {
      if (requestsTimerRef.current) clearTimeout(requestsTimerRef.current)
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current)
      supabase.removeChannel(requestsChannel)
      supabase.removeChannel(notifChannel)
    }
  }, [qc, profile?.id, setUnreadCount])
}

