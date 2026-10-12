import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Archive, ArrowRight, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { cn, formatDate, formatDateTime, STATUS_LABELS, TYPE_LABELS } from '../lib/utils'

const STATUS_COLORS: Record<string, string> = {
  completed: 'text-green-400 bg-green-400/10 border-green-400/20',
  return_completed: 'text-green-400 bg-green-400/10 border-green-400/20',
  cancelled: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
}

async function fetchHistory(search: string) {
  let q = supabase
    .from('transfer_requests')
    .select(`
      *,
      from_location:locations!transfer_requests_from_location_id_fkey(id,name),
      to_location:locations!transfer_requests_to_location_id_fkey(id,name),
      requester:profiles!transfer_requests_requester_id_fkey(id,full_name)
    `)
    .in('status', ['completed', 'return_completed', 'cancelled'])
    .order('updated_at', { ascending: false })
    .limit(50)

  if (search) {
    q = q.or(`title.ilike.%${search}%,request_number.ilike.%${search}%`)
  }

  const { data, error } = await q
  if (error) throw error
  return (data as any[]) ?? []
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const { data: history, isLoading } = useQuery({
    queryKey: ['history', debouncedSearch],
    queryFn: () => fetchHistory(debouncedSearch),
  })

  const handleDeleteHistory = async (e: React.MouseEvent, req: any) => {
    e.stopPropagation()
    if (!profile || profile.role !== 'admin') return
    if (!window.confirm(`⚠️ คำเตือน (เฉพาะ Admin):\n\nต้องการลบประวัติรายการ "${req.request_number}" (${req.title}) ออกจากระบบถาวรหรือไม่?`)) return
    try {
      const { error } = await supabase.from('transfer_requests').delete().eq('id', req.id)
      if (error) throw error
      toast.success(`ลบรายการ ${req.request_number} เรียบร้อยแล้ว`)
      qc.invalidateQueries({ queryKey: ['history'] })
      qc.invalidateQueries({ queryKey: ['requests'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    } catch (err: any) {
      toast.error(`ลบไม่สำเร็จ: ${err.message}`)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="pt-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-white">ประวัติ</h1>
          {profile?.role === 'admin' && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
              <span>👑</span>
              <span>โหมด Admin ลบประวัติได้</span>
            </span>
          )}
        </div>
        <p className="text-slate-500 text-sm mt-0.5">รายการที่เสร็จสิ้นหรือยกเลิกแล้ว</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={e => {
            setSearch(e.target.value)
            clearTimeout((window as any)._historyTimer)
            ;(window as any)._historyTimer = setTimeout(() => setDebouncedSearch(e.target.value), 400)
          }}
          placeholder="ค้นหาประวัติ..."
          className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-600 rounded-2xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array(4).fill(0).map((_, i) => <div key={i} className="shimmer h-20 rounded-2xl" />)}
        </div>
      ) : !history?.length ? (
        <div className="rounded-2xl bg-slate-800/50 border border-slate-700 p-10 text-center">
          <Archive size={36} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 font-medium">ไม่มีประวัติ</p>
          <p className="text-slate-600 text-sm mt-1">รายการที่เสร็จสิ้นจะแสดงที่นี่</p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((req: any) => (
            <div
              key={req.id}
              onClick={() => navigate(`/requests/${req.id}`)}
              className="w-full bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-2xl p-4 text-left transition-all active:scale-[0.99] touch-feedback cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] font-mono text-slate-500">{req.request_number}</span>
                    <span className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded-md border',
                      STATUS_COLORS[req.status] ?? 'text-slate-400 bg-slate-700 border-slate-600'
                    )}>
                      {STATUS_LABELS[req.status] ?? req.status}
                    </span>
                    <span className="text-[10px] text-slate-600">{TYPE_LABELS[req.type]}</span>
                  </div>
                  <p className="text-white text-sm font-semibold truncate">{req.title}</p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {req.from_location?.name} → {req.to_location?.name}
                  </p>
                  <p className="text-slate-600 text-[10px] mt-1">{formatDateTime(req.updated_at)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                  {profile?.role === 'admin' && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteHistory(e, req)}
                      className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all active:scale-90"
                      title="ลบประวัติรายการนี้ (Admin)"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                  <ArrowRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="h-4" />
    </div>
  )
}
