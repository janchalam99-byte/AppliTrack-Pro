import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, CheckCheck, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useAppStore } from '../store/appStore'
import { cn, formatTimeAgo } from '../lib/utils'
import toast from 'react-hot-toast'
import type { Notification } from '../types/database'

const NOTIF_ICONS: Record<string, string> = {
  new_request: '📦',
  request_confirmed: '✅',
  preparing_done: '📋',
  deposited: '🚛',
  received_incomplete: '⚠️',
  problem_reported: '🚨',
  due_date_warning: '⏰',
  overdue: '🔴',
  return_deposited: '↩️',
  return_received: '✅',
  cancelled: '❌',
}

async function fetchNotifications(userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*, request:transfer_requests(id,request_number,title)')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data as any[]) ?? []
}

export default function NotificationsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fetchUnreadCount = useAppStore(s => s.fetchUnreadCount)

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications', profile?.id],
    queryFn: () => fetchNotifications(profile!.id),
    enabled: !!profile,
    refetchInterval: 30000, // 30s ประหยัด bandwidth / egress โควต้าฟรี
  })

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      fetchUnreadCount()
    },
  })

  const markAllRead = async () => {
    if (!profile) return
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('recipient_id', profile.id)
      .eq('is_read', false)
    if (!error) {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      fetchUnreadCount()
      toast.success('อ่านทั้งหมดแล้ว')
    }
  }

  const unreadCount = notifications?.filter(n => !n.is_read).length ?? 0

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold text-white">การแจ้งเตือน</h1>
          {unreadCount > 0 && (
            <p className="text-slate-500 text-sm mt-0.5">ยังไม่ได้อ่าน {unreadCount} รายการ</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 text-sm text-blue-400 font-medium hover:text-blue-300 transition-colors"
          >
            <CheckCheck size={16} />
            อ่านทั้งหมด
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array(5).fill(0).map((_, i) => <div key={i} className="shimmer h-16 rounded-2xl" />)}
        </div>
      ) : !notifications?.length ? (
        <div className="rounded-2xl bg-slate-800/50 border border-slate-700 p-10 text-center">
          <BellOff size={36} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 font-medium">ไม่มีการแจ้งเตือน</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif: Notification & any) => (
            <button
              key={notif.id}
              onClick={() => {
                if (!notif.is_read) markRead.mutate(notif.id)
                if (notif.request_id) navigate(`/requests/${notif.request_id}`)
              }}
              className={cn(
                'w-full rounded-2xl p-4 text-left transition-all active:scale-95 touch-feedback border',
                notif.is_read
                  ? 'bg-slate-800/50 border-slate-700/50'
                  : 'bg-slate-800 border-slate-600'
              )}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">{NOTIF_ICONS[notif.type] ?? '📬'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn(
                      'text-sm font-semibold truncate',
                      notif.is_read ? 'text-slate-300' : 'text-white'
                    )}>
                      {notif.title}
                    </p>
                    {!notif.is_read && (
                      <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1 pulse-dot" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{notif.message}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <p className="text-[10px] text-slate-600">{formatTimeAgo(notif.created_at)}</p>
                    {notif.request && (
                      <>
                        <span className="text-slate-700">·</span>
                        <p className="text-[10px] text-slate-600 font-mono">{(notif.request as any).request_number}</p>
                      </>
                    )}
                  </div>
                </div>
                {notif.request_id && (
                  <ArrowRight size={14} className="text-slate-600 flex-shrink-0 mt-0.5" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="h-4" />
    </div>
  )
}
