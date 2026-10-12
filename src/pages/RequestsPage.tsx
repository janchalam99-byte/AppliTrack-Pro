import { useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { 
  Search, Filter, X, ArrowRight, Package, RefreshCw, 
  LayoutGrid, Table as TableIcon, Sparkles, Tag, User, MapPin, Trash2
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { cn, formatDate, formatDateTime, STATUS_LABELS, TYPE_LABELS } from '../lib/utils'
import type { TransferRequest, RequestStatus } from '../types/database'
import { useAppStore } from '../store/appStore'

const ALL_STATUSES: RequestStatus[] = [
  'pending_confirm', 'preparing', 'ready_to_send', 'in_transit',
  'partially_received', 'completed', 'problem_reported', 'returning',
  'return_in_transit', 'partially_returned', 'return_completed', 'cancelled'
]

async function fetchRequests(filters: {
  search: string
  status: string
  type: string
  locationId: string
}) {
  let query = supabase
    .from('transfer_requests')
    .select(`
      *,
      from_location:locations!transfer_requests_from_location_id_fkey(id,name),
      to_location:locations!transfer_requests_to_location_id_fkey(id,name),
      requester:profiles!transfer_requests_requester_id_fkey(id,full_name),
      items:transfer_request_items(id,name,description,quantity_sent,quantity_received,unit)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  if (filters.type && filters.type !== 'all') {
    query = query.eq('type', filters.type)
  }
  if (filters.locationId) {
    query = query.or(`from_location_id.eq.${filters.locationId},to_location_id.eq.${filters.locationId}`)
  }
  if (filters.search) {
    const s = filters.search.trim()
    query = query.or(`title.ilike.%${s}%,request_number.ilike.%${s}%,app_no.ilike.%${s}%,terminal_name.ilike.%${s}%,sender_staff_name.ilike.%${s}%,receiver_staff_name.ilike.%${s}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data as any[]) ?? []
}

const STATUS_COLORS: Record<string, string> = {
  pending_confirm: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  preparing: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  ready_to_send: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  in_transit: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
  partially_received: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  completed: 'text-green-400 bg-green-400/10 border-green-400/20',
  problem_reported: 'text-red-400 bg-red-400/10 border-red-400/20',
  returning: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
  return_in_transit: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
  partially_returned: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  return_completed: 'text-green-400 bg-green-400/10 border-green-400/20',
  cancelled: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
}

export default function RequestsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const locations = useAppStore((s) => s.locations)
  const { profile } = useAuth()
  const qc = useQueryClient()

  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [status, setStatus] = useState(searchParams.get('status') ?? 'all')
  const [type, setType] = useState(searchParams.get('type') ?? 'all')
  const [locationId, setLocationId] = useState(searchParams.get('location') ?? '')
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')

  const handleDeleteRequest = async (e: React.MouseEvent, req: any) => {
    e.stopPropagation()
    if (!profile || profile.role !== 'admin') return
    if (!window.confirm(`⚠️ คำเตือน (เฉพาะ Admin):\n\nต้องการลบใบงาน "${req.request_number}" (${req.terminal_name || req.title}) ออกจากระบบถาวรหรือไม่?`)) return
    try {
      const { error } = await supabase.from('transfer_requests').delete().eq('id', req.id)
      if (error) throw error
      toast.success(`ลบรายการ ${req.request_number} เรียบร้อยแล้ว`)
      qc.invalidateQueries({ queryKey: ['requests'] })
      qc.invalidateQueries({ queryKey: ['history'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    } catch (err: any) {
      toast.error(`ลบไม่สำเร็จ: ${err.message}`)
    }
  }

  const filters = { search, status, type, locationId }

  const { data: requests, isLoading, refetch } = useQuery({
    queryKey: ['requests', filters],
    queryFn: () => fetchRequests(filters),
  })

  const handleSearch = useCallback((val: string) => {
    setSearch(val)
    setSearchParams(prev => {
      if (val) prev.set('search', val)
      else prev.delete('search')
      return prev
    })
  }, [setSearchParams])

  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setType('all')
    setLocationId('')
    setSearchParams({})
  }

  const hasFilters = status !== 'all' || type !== 'all' || locationId !== '' || search !== ''

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold text-white">รายการ รับ-ส่ง Applicator</h1>
          <p className="text-xs text-slate-400">รายการเคลื่อนย้ายเครื่องมือระหว่าง HET-1 และ HET-2</p>
        </div>
        <div className="flex items-center gap-1.5">
          {/* View Toggle */}
          <div className="flex bg-slate-800 p-0.5 rounded-xl border border-slate-700">
            <button
              onClick={() => setViewMode('card')}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                viewMode === 'card' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              )}
              title="มุมมองการ์ด"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              )}
              title="มุมมองตาราง Excel"
            >
              <TableIcon size={15} />
            </button>
          </div>

          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-colors"
            title="รีเฟรช"
          >
            <RefreshCw size={15} />
          </button>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all',
              showFilters || hasFilters
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            )}
          >
            <Filter size={14} />
            กรอง
            {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
          </button>
        </div>
      </div>

      {/* Search Input (Searches App No, Terminal, Person, Request No) */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="ค้นหา App No (เช่น TW-1158), Terminal, ชื่อผู้ส่ง..."
          className="w-full bg-slate-800/90 border border-slate-700 text-white placeholder-slate-500 rounded-xl pl-10 pr-9 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-all font-medium"
        />
        {search && (
          <button
            onClick={() => handleSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">ตัวกรองรายการ</span>
            {hasFilters && (
              <button onClick={clearFilters} className="text-[11px] text-blue-400 hover:underline">
                ล้างตัวกรอง
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">สถานะ</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="all">ทุกสถานะ</option>
                {ALL_STATUSES.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">สถานที่</label>
              <select
                value={locationId}
                onChange={e => setLocationId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="">ทุกสถานที่</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Quick Route / Flow Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        <button
          type="button"
          onClick={() => { setStatus('all'); setLocationId(''); }}
          className={cn(
            'px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all text-xs border',
            status === 'all' && !locationId
              ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20'
              : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-white'
          )}
        >
          ทั้งหมด
        </button>
        <button
          type="button"
          onClick={() => { setStatus('in_transit'); }}
          className={cn(
            'px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all text-xs border flex items-center gap-1',
            status === 'in_transit'
              ? 'bg-sky-600 text-white border-sky-500 shadow-md shadow-sky-500/20'
              : 'bg-slate-900/80 text-sky-400/90 border-slate-800 hover:text-sky-300'
          )}
        >
          <span>🚚 รอปลายทางรับ (ค้าง)</span>
        </button>
        {locations.map(loc => (
          <button
            key={`loc-${loc.id}`}
            type="button"
            onClick={() => {
              setLocationId(locationId === loc.id ? '' : loc.id)
            }}
            className={cn(
              'px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all text-xs border flex items-center gap-1',
              locationId === loc.id
                ? 'bg-cyan-600 text-white border-cyan-500 shadow-md shadow-cyan-500/20'
                : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-white'
            )}
          >
            <span>🏭 {loc.name}</span>
          </button>
        ))}
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>{requests?.length ?? 0} รายการ</span>
        <span className="text-[11px] text-slate-400">เรียงตามวันที่ล่าสุด</span>
      </div>

      {/* Content Rendering */}
      {isLoading ? (
        <div className="space-y-2">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="rounded-2xl bg-slate-800/60 shimmer h-28" />
          ))}
        </div>
      ) : !requests?.length ? (
        <div className="rounded-2xl bg-slate-800/40 border border-slate-700/60 p-10 text-center">
          <Package size={36} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-300 font-bold text-sm">ไม่พบรายการ</p>
          <p className="text-slate-500 text-xs mt-1">ลองเปลี่ยนคำค้นหา หรือแตะปุ่มสร้างรายการด้านบน</p>
        </div>
      ) : viewMode === 'table' ? (
        /* Excel-like Table View */
        <div className="overflow-x-auto bg-slate-800/80 border border-slate-700 rounded-2xl">
          <table className="w-full text-left text-xs text-slate-300 border-collapse">
            <thead>
              <tr className="bg-slate-900/80 border-b border-slate-700 text-[11px] text-slate-400 font-semibold">
                <th className="py-2.5 px-3">App No.</th>
                <th className="py-2.5 px-3">Terminal / สิ่งของ</th>
                <th className="py-2.5 px-3">จำนวน</th>
                <th className="py-2.5 px-3">เส้นทาง</th>
                <th className="py-2.5 px-3">ผู้ส่ง ➔ ส่งถึงใคร</th>
                <th className="py-2.5 px-3">สถานะ</th>
                <th className="py-2.5 px-3">หมายเหตุ</th>
                {profile?.role === 'admin' && (
                  <th className="py-2.5 px-3 text-center">จัดการ</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60 font-mono text-[11px]">
              {requests.map((req) => {
                const item = req.items?.[0]
                const qtyText = item ? `${item.quantity_sent} ${item.unit || 'ชุด'}` : '-'
                return (
                  <tr
                    key={req.id}
                    onClick={() => navigate(`/requests/${req.id}`)}
                    className="hover:bg-slate-700/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-3 font-bold text-blue-400 whitespace-nowrap">
                      {req.app_no || '-'}
                    </td>
                    <td className="py-2 px-3 text-white font-sans truncate max-w-[150px]">
                      {req.terminal_name || req.title}
                    </td>
                    <td className="py-2 px-3 font-sans text-cyan-300 font-bold whitespace-nowrap">
                      {qtyText}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap font-sans text-[10px]">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded font-bold border',
                        req.from_location?.name?.includes('1')
                          ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                          : 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                      )}>
                        {req.from_location?.name} → {req.to_location?.name}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-sans whitespace-nowrap">
                      <span className="text-purple-300 font-semibold">{req.sender_staff_name || req.requester?.full_name || '-'}</span>
                      <span className="text-slate-500 mx-1">➔</span>
                      <span className="text-emerald-300 font-semibold">{req.receiver_staff_name || '-'}</span>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold border', STATUS_COLORS[req.status])}>
                        {STATUS_LABELS[req.status] || req.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-sans text-[10px] text-amber-300/80 truncate max-w-[100px]">
                      {req.remark_base || req.notes || '-'}
                    </td>
                    {profile?.role === 'admin' && (
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => handleDeleteRequest(e, req)}
                          className="p-1 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/20 transition-all active:scale-90"
                          title="ลบใบงานนี้ (Admin)"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Modern Card View */
        <div className="space-y-2.5">
          {requests.map((req: TransferRequest & any) => {
            const appNo = req.app_no || (req.items?.[0]?.name?.startsWith('TW-') ? req.items[0].name : '')
            const terminal = req.terminal_name || (req.items?.[0]?.description || req.title)
            const senderStaff = req.sender_staff_name || req.requester?.full_name || '-'
            const receiverStaff = req.receiver_staff_name || '-'
            const remark = req.remark_base || req.notes
            const item = req.items?.[0]
            const qtyText = item ? `${item.quantity_sent} ${item.unit || 'ชุด'}` : null

            return (
              <button
                key={req.id}
                onClick={() => navigate(`/requests/${req.id}`)}
                className="w-full bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 rounded-2xl p-3.5 text-left transition-all active:scale-[0.99] touch-feedback shadow-xs group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Top Row: App No, Route Pill, Status */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {appNo ? (
                        <span className="font-mono text-xs font-bold text-blue-300 bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 rounded-lg">
                          {appNo}
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-700/60 px-1.5 py-0.5 rounded">
                          {req.request_number}
                        </span>
                      )}

                      {/* Route Direction Badge */}
                      <span className={cn(
                        'text-[10px] font-bold px-1.5 py-0.5 rounded-md border',
                        req.from_location?.name?.includes('1')
                          ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                          : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                      )}>
                        {req.from_location?.name} ➔ {req.to_location?.name}
                      </span>

                      <span className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-md border',
                        STATUS_COLORS[req.status] ?? 'text-slate-400'
                      )}>
                        {STATUS_LABELS[req.status] ?? req.status}
                      </span>

                      {qtyText && (
                        <span className="text-[10px] font-bold text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/30">
                          {qtyText}
                        </span>
                      )}

                      {req.type === 'loan' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          ยืม
                        </span>
                      )}

                      {remark && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          {remark}
                        </span>
                      )}
                    </div>

                    {/* Middle Row: Terminal Name */}
                    <p className="text-white font-bold text-sm break-words line-clamp-2 group-hover:text-blue-300 transition-colors">
                      {terminal}
                    </p>

                    {/* Bottom Row: Sender & Receiver */}
                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1.5 border-t border-slate-700/50 gap-2">
                      <div className="flex items-center gap-1 text-[11px] min-w-0">
                        <span className="text-slate-500 shrink-0">ผู้ส่ง:</span>
                        <span className="font-semibold text-purple-300 truncate">{senderStaff}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] min-w-0">
                        <span className="text-slate-500 shrink-0">ส่งถึง:</span>
                        <span className="font-bold text-emerald-300 truncate">{receiverStaff}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 pt-2">
                    {profile?.role === 'admin' && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteRequest(e, req)}
                        className="p-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all active:scale-90"
                        title="ลบใบงานนี้ (Admin)"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <ArrowRight size={15} className="text-slate-600 group-hover:text-white transition-colors" />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div className="h-4" />
    </div>
  )
}
