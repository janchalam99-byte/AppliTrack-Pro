import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, AlertTriangle, ArrowRight, Calendar, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn, formatDate, formatQuantity } from '../lib/utils'

async function fetchLoans() {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('transfer_requests')
    .select(`
      *,
      from_location:locations!transfer_requests_from_location_id_fkey(id,name),
      to_location:locations!transfer_requests_to_location_id_fkey(id,name),
      requester:profiles!transfer_requests_requester_id_fkey(id,full_name),
      items:transfer_request_items(*)
    `)
    .eq('type', 'loan')
    .not('status', 'in', '(return_completed,cancelled)')
    .order('loan_due_date', { ascending: true, nullsFirst: false })

  if (error) throw error

  return (data ?? []).map((r: any) => {
    const totalSent = r.items?.reduce((s: number, i: any) => s + i.quantity_sent, 0) ?? 0
    const totalReturned = r.items?.reduce((s: number, i: any) => s + i.quantity_returned, 0) ?? 0
    const remaining = totalSent - totalReturned
    const isOverdue = r.loan_due_date && r.loan_due_date < today && remaining > 0
    return { ...r, totalSent, totalReturned, remaining, isOverdue }
  })
}

const STATUS_LABELS: Record<string, string> = {
  pending_confirm: 'รอยืนยัน',
  preparing: 'เตรียมของ',
  ready_to_send: 'พร้อมส่ง',
  in_transit: 'กำลังส่ง',
  partially_received: 'รับบางส่วน',
  completed: 'ยืมอยู่',
  returning: 'ส่งคืน',
  return_in_transit: 'ฝากคืน',
  partially_returned: 'คืนบางส่วน',
}

export default function LoansPage() {
  const navigate = useNavigate()
  const { data: loans, isLoading } = useQuery({
    queryKey: ['loans'],
    queryFn: fetchLoans,
    refetchInterval: 30000,
  })

  const overdue = loans?.filter(l => l.isOverdue) ?? []
  const active = loans?.filter(l => !l.isOverdue) ?? []

  return (
    <div className="p-4 space-y-4">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-white">ยืม-คืนของ</h1>
        <p className="text-slate-500 text-sm mt-0.5">รายการที่กำลังยืมอยู่</p>
      </div>

      {/* Overdue Alert */}
      {overdue.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={18} className="text-red-400" />
            <h2 className="text-red-400 font-bold text-sm">เกินกำหนดคืน {overdue.length} รายการ</h2>
          </div>
          <div className="space-y-2">
            {overdue.map((loan: any) => (
              <LoanCard key={loan.id} loan={loan} isOverdue navigate={navigate} />
            ))}
          </div>
        </div>
      )}

      {/* Active Loans */}
      {isLoading ? (
        <div className="space-y-3">
          {Array(3).fill(0).map((_, i) => <div key={i} className="shimmer h-28 rounded-2xl" />)}
        </div>
      ) : active.length === 0 && overdue.length === 0 ? (
        <div className="rounded-2xl bg-slate-800/50 border border-slate-700 p-10 text-center">
          <BookOpen size={36} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 font-medium">ไม่มีรายการยืมที่ค้างอยู่</p>
        </div>
      ) : (
        <div>
          {active.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">กำลังยืมอยู่</h2>
              <div className="space-y-2">
                {active.map((loan: any) => (
                  <LoanCard key={loan.id} loan={loan} isOverdue={false} navigate={navigate} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="h-4" />
    </div>
  )
}

function LoanCard({ loan, isOverdue, navigate }: { loan: any; isOverdue: boolean; navigate: ReturnType<typeof useNavigate> }) {
  const today = new Date().toISOString().split('T')[0]
  const daysLeft = loan.loan_due_date
    ? Math.ceil((new Date(loan.loan_due_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <button
      onClick={() => navigate(`/requests/${loan.id}`)}
      className={cn(
        'w-full rounded-2xl border p-4 text-left transition-all active:scale-95 touch-feedback',
        isOverdue
          ? 'bg-red-500/5 border-red-500/20'
          : 'bg-slate-800/80 border-slate-700 hover:bg-slate-800'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-slate-500">{loan.request_number}</span>
            <span className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded-md border',
              isOverdue ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-sky-400 bg-sky-500/10 border-sky-500/20'
            )}>
              {isOverdue ? 'เกินกำหนด' : (STATUS_LABELS[loan.status] ?? loan.status)}
            </span>
          </div>
          <p className="text-white font-semibold text-sm break-words line-clamp-2 leading-snug">{loan.title}</p>
          <p className="text-slate-500 text-xs mt-0.5">
            {loan.from_location?.name} → {loan.to_location?.name}
          </p>

          {/* Remaining */}
          <div className="mt-2 flex items-center gap-4 text-xs">
            <span className={cn('font-bold', isOverdue ? 'text-red-400' : 'text-orange-400')}>
              ค้าง {formatQuantity(loan.remaining)} ชิ้น
            </span>
            <span className="text-slate-500">
              (คืนแล้ว {formatQuantity(loan.totalReturned)}/{formatQuantity(loan.totalSent)})
            </span>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <ArrowRight size={16} className="text-slate-600 mb-2" />
          {loan.loan_due_date && (
            <div className={cn('text-xs', isOverdue ? 'text-red-400' : daysLeft !== null && daysLeft <= 3 ? 'text-orange-400' : 'text-slate-500')}>
              <Calendar size={10} className="inline mr-1" />
              {isOverdue
                ? `เกิน ${Math.abs(daysLeft ?? 0)} วัน`
                : daysLeft === 0 ? 'วันนี้'
                : `อีก ${daysLeft} วัน`
              }
            </div>
          )}
        </div>
      </div>

      {/* Due date */}
      {loan.loan_due_date && (
        <div className="mt-2 pt-2 border-t border-slate-700 flex items-center gap-1">
          <RotateCcw size={10} className="text-slate-500" />
          <span className="text-xs text-slate-500">กำหนดคืน: {formatDate(loan.loan_due_date)}</span>
        </div>
      )}
    </button>
  )
}
