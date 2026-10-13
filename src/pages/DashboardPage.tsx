import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { 
  Clock, Package, Truck, CheckCircle, AlertTriangle, 
  BookOpen, AlertCircle, ArrowRight, RefreshCw, Compass
} from 'lucide-react'
import PwaInstallBanner from '../components/PwaInstallBanner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useAppStore } from '../store/appStore'
import { cn, formatTimeAgo } from '../lib/utils'
import type { TransferRequest } from '../types/database'

interface DashboardStats {
  pending_confirm: number
  preparing: number
  ready_to_send: number
  in_transit: number
  partially_received: number
  completed_today: number
  active_loans: number
  overdue_loans: number
  problem_reported: number
}

interface StatCard {
  label: string
  count: number
  icon: React.ElementType
  color: string
  bg: string
  status: string
  urgent?: boolean
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const today = new Date().toISOString().split('T')[0]

  const { data: requests } = await supabase
    .from('transfer_requests')
    .select('status, type, loan_due_date, items:transfer_request_items(quantity_sent, quantity_returned)')

  const stats: DashboardStats = {
    pending_confirm: 0,
    preparing: 0,
    ready_to_send: 0,
    in_transit: 0,
    partially_received: 0,
    completed_today: 0,
    active_loans: 0,
    overdue_loans: 0,
    problem_reported: 0,
  }

  requests?.forEach((r: any) => {
    switch (r.status) {
      case 'pending_confirm': stats.pending_confirm++; break
      case 'preparing': stats.preparing++; break
      case 'ready_to_send': stats.ready_to_send++; break
      case 'in_transit': stats.in_transit++; break
      case 'partially_received': stats.partially_received++; break
      case 'problem_reported': stats.problem_reported++; break
    }
    if (r.type === 'loan') {
      const isActive = !['return_completed', 'cancelled'].includes(r.status)
      const hasRemaining = r.items?.some((i: any) => i.quantity_returned < i.quantity_sent)
      if (isActive && hasRemaining) {
        stats.active_loans++
        if (r.loan_due_date && r.loan_due_date < today) {
          stats.overdue_loans++
        }
      }
    }
  })
  return stats
}

async function fetchRecentRequests(): Promise<TransferRequest[]> {
  const { data } = await supabase
    .from('transfer_requests')
    .select(`
      *,
      from_location:locations!transfer_requests_from_location_id_fkey(id,name),
      to_location:locations!transfer_requests_to_location_id_fkey(id,name),
      requester:profiles!transfer_requests_requester_id_fkey(id,full_name)
    `)
    .not('status', 'in', '(completed,return_completed,cancelled)')
    .order('updated_at', { ascending: false })
    .limit(5)
  return (data as any[]) ?? []
}

const STATUS_COLORS: Record<string, string> = {
  pending_confirm: 'text-yellow-400',
  preparing: 'text-blue-400',
  ready_to_send: 'text-purple-400',
  in_transit: 'text-sky-400',
  partially_received: 'text-orange-400',
  completed: 'text-green-400',
  problem_reported: 'text-red-400',
  returning: 'text-indigo-400',
  return_in_transit: 'text-sky-400',
  partially_returned: 'text-orange-400',
  return_completed: 'text-green-400',
  cancelled: 'text-slate-400',
}

const STATUS_TH: Record<string, string> = {
  pending_confirm: 'รอฝากไปกับรถ',
  preparing: 'กำลังเตรียมของ',
  ready_to_send: 'รอฝากไปกับรถ',
  in_transit: 'รอปลายทางรับของ',
  partially_received: 'รับบางส่วน',
  completed: 'ปิดงานแล้ว',
  problem_reported: 'พบปัญหา',
  returning: 'ส่งคืน',
  return_in_transit: 'ฝากคืน รอรับ',
  partially_returned: 'คืนบางส่วน',
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const locations = useAppStore((s) => s.locations)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
    refetchInterval: 5000,
  })

  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ['recent-requests'],
    queryFn: fetchRecentRequests,
    refetchInterval: 5000,
  })

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] }),
      qc.invalidateQueries({ queryKey: ['recent-requests'] }),
      qc.invalidateQueries({ queryKey: ['requests'] }),
    ])
    setTimeout(() => setIsRefreshing(false), 500)
  }

  const statCards: StatCard[] = [
    { 
      label: 'รอปลายทางรับของ (ค้าง)', 
      count: stats?.in_transit ?? 0, 
      icon: Truck, 
      color: 'text-sky-400', 
      bg: 'bg-sky-400/10 border-sky-400/20', 
      status: 'in_transit', 
      urgent: (stats?.in_transit ?? 0) > 0 
    },
    { 
      label: 'รอฝากไปกับรถ', 
      count: (stats?.ready_to_send ?? 0) + (stats?.pending_confirm ?? 0) + (stats?.preparing ?? 0), 
      icon: Package, 
      color: 'text-amber-400', 
      bg: 'bg-amber-400/10 border-amber-400/20', 
      status: 'ready_to_send' 
    },
    { 
      label: 'รับของแล้ววันนี้', 
      count: stats?.completed_today ?? 0, 
      icon: CheckCircle, 
      color: 'text-emerald-400', 
      bg: 'bg-emerald-400/10 border-emerald-400/20', 
      status: 'completed' 
    },
    { 
      label: 'พบปัญหา / รับไม่ครบ', 
      count: (stats?.problem_reported ?? 0) + (stats?.partially_received ?? 0), 
      icon: AlertCircle, 
      color: 'text-red-400', 
      bg: 'bg-red-400/10 border-red-400/20', 
      status: 'problem_reported', 
      urgent: ((stats?.problem_reported ?? 0) + (stats?.partially_received ?? 0)) > 0 
    },
  ]

  const het1 = locations.find(l => l.name.includes('1') || l.name.toUpperCase().includes('HET-1'))
  const het2 = locations.find(l => l.name.includes('2') || l.name.toUpperCase().includes('HET-2'))
  const userLocation = locations.find(l => l.id === profile?.home_location_id) || (profile?.email?.includes('2') ? het2 : het1)
  const greeting = new Date().getHours() < 12 ? 'อรุณสวัสดิ์' : new Date().getHours() < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น'

  return (
    <div className="p-4 space-y-4">
      {/* Greeting */}
      <div className="pt-2 flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-sm">{greeting} 👋</p>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white">{profile?.full_name ?? 'ผู้ใช้'}</h1>
            {userLocation && (
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                userLocation.name.includes('2')
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                  : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
              )}>
                📍 {userLocation.name}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleManualRefresh}
          className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors touch-feedback"
          title="แตะเพื่อรีเฟรชข้อมูลด่วน"
        >
          <RefreshCw size={18} className={cn(isRefreshing && "animate-spin text-cyan-400")} />
        </button>
      </div>


      {/* PWA Floating Install Banner */}
      <PwaInstallBanner variant="banner" />

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          onClick={() => navigate('/requests/new')}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-500/20"
        >
          <Package size={18} />
          <span>สร้างรายการรับ-ส่ง</span>
          <ArrowRight size={15} />
        </button>
        <button
          onClick={() => navigate('/tool-journey')}
          className="bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 text-white font-bold py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
        >
          <Compass size={18} className="text-purple-400" />
          <span>ประวัติเดินทางเครื่องมือ</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wide">สรุปสถานะ</h2>
        <div className="grid grid-cols-2 gap-3">
          {statsLoading
            ? Array(8).fill(0).map((_, i) => (
                <div key={i} className="rounded-2xl border border-slate-700 p-4 shimmer h-24" />
              ))
            : statCards.map((card) => (
                <button
                  key={card.status}
                  onClick={() => {
                    navigate(`/requests?status=${card.status}`)
                  }}
                  className={cn(
                    'rounded-2xl border p-4 text-left transition-all active:scale-95 touch-feedback',
                    card.bg,
                    card.urgent && card.count > 0 ? 'ring-1 ring-current' : ''
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <card.icon size={18} className={card.color} />
                    {card.urgent && card.count > 0 && (
                      <span className="w-2 h-2 rounded-full bg-current pulse-dot" style={{ color: 'currentColor' }} />
                    )}
                  </div>
                  <div className={cn('text-2xl font-bold', card.color)}>{card.count}</div>
                  <div className="text-xs text-slate-400 mt-0.5 leading-tight">{card.label}</div>
                </button>
              ))
          }
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">กิจกรรมล่าสุด</h2>
          <button
            onClick={() => navigate('/requests')}
            className="text-blue-400 text-xs font-medium flex items-center gap-1"
          >
            ดูทั้งหมด <ArrowRight size={12} />
          </button>
        </div>

        {recentLoading ? (
          <div className="space-y-3">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="rounded-2xl bg-slate-800 p-4 shimmer h-20" />
            ))}
          </div>
        ) : !recent?.length ? (
          <div className="rounded-2xl bg-slate-800/50 border border-slate-700 p-8 text-center">
            <Package size={32} className="mx-auto text-slate-600 mb-2" />
            <p className="text-slate-500 text-sm">ยังไม่มีรายการ</p>
            <p className="text-slate-600 text-xs mt-1">กดปุ่มด้านบนเพื่อสร้างรายการแรก</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((req: any) => {
              const appNo = req.app_no
              const terminal = req.terminal_name || req.title
              const staff = req.sender_staff_name || req.requester?.full_name

              return (
                <button
                  key={req.id}
                  onClick={() => navigate(`/requests/${req.id}`)}
                  className="w-full bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 rounded-2xl p-3.5 text-left transition-all active:scale-[0.99] touch-feedback shadow-xs group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {appNo ? (
                          <span className="text-[11px] font-mono font-bold text-blue-300 bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 rounded-md">
                            {appNo}
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-500">{req.request_number}</span>
                        )}
                        <span className={cn(
                          'text-[10px] font-semibold px-1.5 py-0.5 rounded-md border',
                          `status-${req.status}`
                        )}>
                          {STATUS_TH[req.status] ?? req.status}
                        </span>
                        {req.remark_base && (
                          <span className="text-[10px] text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">
                            {req.remark_base}
                          </span>
                        )}
                      </div>
                      <p className="text-white text-sm font-bold truncate group-hover:text-blue-300 transition-colors">
                        {terminal}
                      </p>
                      <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                        <p className="text-[11px] text-slate-300 font-semibold">
                          {req.from_location?.name} → {req.to_location?.name}
                        </p>
                        {req.receiver_staff_name ? (
                          <p className="text-[10px] text-emerald-300 font-medium">
                            ส่งถึง: {req.receiver_staff_name}
                          </p>
                        ) : staff ? (
                          <p className="text-[10px] font-semibold text-purple-300">
                            {staff}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <ArrowRight size={14} className="text-slate-600 group-hover:text-white mt-1 transition-colors" />
                      <p className="text-slate-500 text-[10px] mt-2">{formatTimeAgo(req.updated_at)}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom spacer */}
      <div className="h-4" />
    </div>
  )
}
