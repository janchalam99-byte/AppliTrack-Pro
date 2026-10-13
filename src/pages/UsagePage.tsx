import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  HardDrive, Database, Download, AlertTriangle, CheckCircle2,
  ShieldCheck, Info, RefreshCw, FileSpreadsheet, Server, Laptop,
  HelpCircle, ArrowUpRight
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatFileSize, formatDateTime, formatDate, STATUS_LABELS, TYPE_LABELS, PHOTO_STAGE_LABELS } from '../lib/utils'
import { downloadCsv } from '../lib/exportCsv'
import toast from 'react-hot-toast'

interface StorageUsageStats {
  photoCount: number
  totalBytes: number
  requestsCount: number
  itemsCount: number
  loansCount: number
  historyCount: number
}

// โควต้าทางการของ Supabase Free Tier (อ้างอิงเอกสารทางการ supabase.com/pricing)
const LIMITS = {
  storageBytes: 1024 * 1024 * 1024, // 1 GB (1,024 MB)
  storageMb: 1024,
  dbMb: 500, // 500 MB
  maxFileSizeMb: 50, // 50 MB
  inactivityDays: 7, // หยุดพักหากไม่มีการใช้งาน 7 วัน
}

export default function UsagePage() {
  const [isExporting, setIsExporting] = useState<string | null>(null)

  // ดึงข้อมูลสถิติการใช้งานจริงจากฐานข้อมูล
  const { data: stats, isLoading, refetch, isFetching } = useQuery<StorageUsageStats>({
    queryKey: ['usage-stats'],
    queryFn: async () => {
      // 1. นับจำนวนและขนาดรูปภาพทั้งหมดใน item_photos
      const { data: photos, error: photoErr } = await supabase
        .from('item_photos')
        .select('file_size')

      if (photoErr) throw photoErr

      const photoCount = photos?.length || 0
      const totalBytes = photos?.reduce((acc, p) => acc + (p.file_size || 0), 0) || 0

      // 2. นับจำนวนรายการในแต่ละตาราง
      const [reqRes, itemRes, loanRes, histRes] = await Promise.all([
        supabase.from('transfer_requests').select('id', { count: 'exact', head: true }),
        supabase.from('request_items').select('id', { count: 'exact', head: true }),
        supabase.from('loan_records').select('id', { count: 'exact', head: true }),
        supabase.from('status_history').select('id', { count: 'exact', head: true }),
      ])

      return {
        photoCount,
        totalBytes,
        requestsCount: reqRes.count || 0,
        itemsCount: itemRes.count || 0,
        loansCount: loanRes.count || 0,
        historyCount: histRes.count || 0,
      }
    },
    staleTime: 60 * 1000,
  })

  const usedBytes = stats?.totalBytes || 0
  const usedMb = usedBytes / (1024 * 1024)
  const storagePercentage = Math.min(100, (usedBytes / LIMITS.storageBytes) * 100)

  // ประเมินรูปที่ยังเก็บได้ (คิดจากขนาดเฉลี่ยหลังบีบอัด ~200 KB)
  const avgPhotoBytes = stats?.photoCount && stats.photoCount > 0 ? (usedBytes / stats.photoCount) : (200 * 1024)
  const remainingBytes = Math.max(0, LIMITS.storageBytes - usedBytes)
  const estimatedRemainingPhotos = Math.floor(remainingBytes / Math.max(150 * 1024, avgPhotoBytes))

  // สถานะระดับการใช้งาน
  const getQuotaStatus = () => {
    if (storagePercentage >= 85) {
      return {
        level: 'critical',
        color: 'text-rose-400',
        bg: 'bg-rose-500/10 border-rose-500/30',
        badge: 'bg-rose-500/20 text-rose-400 border border-rose-500/40',
        label: 'ใกล้ถึงขีดจำกัด (> 85%)',
        desc: 'พื้นที่รูปใกล้เต็ม แนะนำให้สำรองข้อมูลลงเครื่องคอมพิวเตอร์และพิจารณาทางเลือกเพื่อความต่อเนื่อง',
      }
    }
    if (storagePercentage >= 70) {
      return {
        level: 'warning',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10 border-amber-500/30',
        badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/40',
        label: 'เริ่มเข้าสู่ระดับเฝ้าระวัง (70 - 85%)',
        desc: 'พื้นที่ใช้งานเริ่มเพิ่มขึ้น ควรเริ่มวางแผนสำรองข้อมูลเป็นประจำ',
      }
    }
    return {
      level: 'normal',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40',
      label: 'ปกติ ปลอดภัย (< 70%)',
      desc: 'ระบบทำงานภายใต้โควต้าฟรีอย่างสมบูรณ์แบบ รูปภาพถูกบีบอัดอย่างเหมาะสม',
    }
  }

  const status = getQuotaStatus()

  // ฟังก์ชัน Export รายการรับ-ส่งของ (โครงสร้างตรงกับไฟล์ Excel: รับ-ส่ง app.xlsx 100%)
  const handleExportRequests = async () => {
    try {
      setIsExporting('requests')
      const { data, error } = await supabase
        .from('transfer_requests')
        .select(`
          request_number,
          type,
          status,
          title,
          app_no,
          terminal_name,
          sender_staff_name,
          remark_base,
          notes,
          deposited_at,
          received_at,
          created_at,
          from_loc:locations!transfer_requests_from_location_id_fkey(name),
          to_loc:locations!transfer_requests_to_location_id_fkey(name)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!data || data.length === 0) {
        toast('ยังไม่มีข้อมูลสำหรับ Export')
        return
      }

      const headers = [
        'NO.',
        'App No.',
        'TERMINAL NAME',
        'รับ วันที่',
        'รับ เวลา',
        'ส่ง วันที่',
        'ส่ง เวลา',
        'ชื่อผู้รับ-ส่ง',
        'สถานะ/ที่อยู่',
        'หมายเหตุ',
      ]

      const rows = data.map((r: any, idx: number) => {
        const recDate = r.received_at ? formatDate(r.received_at) : ''
        const recTime = r.received_at ? formatDateTime(r.received_at).split(' ')[1] : ''
        const sendDate = r.deposited_at ? formatDate(r.deposited_at) : (r.created_at ? formatDate(r.created_at) : '')
        const sendTime = r.deposited_at ? formatDateTime(r.deposited_at).split(' ')[1] : (r.created_at ? formatDateTime(r.created_at).split(' ')[1] : '')
        const currentLoc = r.to_loc?.name || r.from_loc?.name || ''
        const remarks = [r.remark_base, r.notes].filter(Boolean).join(' ')

        return [
          idx + 1,
          r.app_no || '',
          r.terminal_name || r.title || '',
          recDate,
          recTime,
          sendDate,
          sendTime,
          r.sender_staff_name || '',
          currentLoc,
          remarks,
        ]
      })

      const dateStr = new Date().toISOString().split('T')[0]
      downloadCsv(`รายการรับส่ง_Applicator_${dateStr}.csv`, headers, rows)
      toast.success('ดาวน์โหลด CSV สำเร็จ (ตรงกับตาราง Excel 100%)')
    } catch (err: any) {
      toast.error(`Export ล้มเหลว: ${err.message}`)
    } finally {
      setIsExporting(null)
    }
  }

  // ฟังก์ชัน Export รายการสิ่งของ
  const handleExportItems = async () => {
    try {
      setIsExporting('items')
      const { data, error } = await supabase
        .from('request_items')
        .select(`
          item_name,
          part_number,
          quantity_requested,
          quantity_received,
          quantity_returned,
          unit,
          notes,
          created_at,
          request:transfer_requests!request_items_request_id_fkey(request_no, title)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!data || data.length === 0) {
        toast('ยังไม่มีข้อมูลสิ่งของ')
        return
      }

      const headers = [
        'เลขที่เอกสาร',
        'หัวข้องาน',
        'ชื่อสิ่งของ/อุปกรณ์',
        'รหัสอะไหล่ (Part No.)',
        'จำนวนที่ขอ',
        'จำนวนที่รับแล้ว',
        'จำนวนที่คืนแล้ว',
        'หน่วยนับ',
        'หมายเหตุ',
      ]

      const rows = data.map((i: any) => [
        i.request?.request_no || '',
        i.request?.title || '',
        i.item_name,
        i.part_number || '-',
        i.quantity_requested,
        i.quantity_received || 0,
        i.quantity_returned || 0,
        i.unit || 'ชิ้น',
        i.notes || '',
      ])

      const dateStr = new Date().toISOString().split('T')[0]
      downloadCsv(`รายการสิ่งของและอะไหล่_${dateStr}.csv`, headers, rows)
      toast.success('ดาวน์โหลดรายการสิ่งของ CSV สำเร็จ')
    } catch (err: any) {
      toast.error(`Export ล้มเหลว: ${err.message}`)
    } finally {
      setIsExporting(null)
    }
  }

  // ฟังก์ชัน Export รายการยืม-คืน
  const handleExportLoans = async () => {
    try {
      setIsExporting('loans')
      const { data, error } = await supabase
        .from('loan_records')
        .select(`
          status,
          borrowed_at,
          due_date,
          borrower_name,
          borrower_phone,
          item:request_items!loan_records_item_id_fkey(item_name, part_number, unit),
          request:transfer_requests!loan_records_request_id_fkey(request_no)
        `)
        .order('borrowed_at', { ascending: false })

      if (error) throw error
      if (!data || data.length === 0) {
        toast('ยังไม่มีข้อมูลการยืมคืน')
        return
      }

      const headers = [
        'เลขที่เอกสาร',
        'ชื่ออุปกรณ์ที่ยืม',
        'รหัสอะไหล่',
        'ผู้ยืม',
        'เบอร์โทร',
        'วันที่ยืม',
        'กำหนดคืน',
        'สถานะการยืม',
      ]

      const rows = data.map((l: any) => [
        l.request?.request_no || '',
        l.item?.item_name || '',
        l.item?.part_number || '-',
        l.borrower_name || '',
        l.borrower_phone || '-',
        formatDateTime(l.borrowed_at),
        l.due_date ? formatDateTime(l.due_date) : 'ไม่มีกำหนด',
        l.status === 'borrowed' ? 'กำลังยืมอยู่' : 'คืนแล้ว',
      ])

      const dateStr = new Date().toISOString().split('T')[0]
      downloadCsv(`รายการยืมคืน_${dateStr}.csv`, headers, rows)
      toast.success('ดาวน์โหลดประวัติยืมคืน CSV สำเร็จ')
    } catch (err: any) {
      toast.error(`Export ล้มเหลว: ${err.message}`)
    } finally {
      setIsExporting(null)
    }
  }

  // ฟังก์ชัน Export รายการรูปภาพ & หลักฐาน (Manifest)
  const handleExportPhotos = async () => {
    try {
      setIsExporting('photos')
      const { data, error } = await supabase
        .from('item_photos')
        .select(`
          storage_path,
          photo_stage,
          file_name,
          file_size,
          taken_at,
          is_evidence,
          request:transfer_requests!item_photos_request_id_fkey(request_no)
        `)
        .order('taken_at', { ascending: false })

      if (error) throw error
      if (!data || data.length === 0) {
        toast('ยังไม่มีรายการรูปภาพ')
        return
      }

      const headers = [
        'เลขที่เอกสาร',
        'ขั้นตอนการถ่าย',
        'ชื่อไฟล์',
        'ขนาด (Bytes)',
        'ขนาด (KB)',
        'Storage Path ในคลาวด์',
        'วันที่ถ่าย',
        'เป็นหลักฐานสำคัญ',
      ]

      const rows = data.map((p: any) => [
        p.request?.request_no || '',
        PHOTO_STAGE_LABELS[p.photo_stage] || p.photo_stage,
        p.file_name || '',
        p.file_size || 0,
        p.file_size ? (p.file_size / 1024).toFixed(1) : '0',
        p.storage_path,
        formatDateTime(p.taken_at),
        p.is_evidence ? 'ใช่ (ห้ามลบ)' : 'ไม่ใช่',
      ])

      const dateStr = new Date().toISOString().split('T')[0]
      downloadCsv(`สารบัญรูปภาพหลักฐาน_${dateStr}.csv`, headers, rows)
      toast.success('ดาวน์โหลดสารบัญรูปภาพหลักฐาน CSV สำเร็จ')
    } catch (err: any) {
      toast.error(`Export ล้มเหลว: ${err.message}`)
    } finally {
      setIsExporting(null)
    }
  }

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white">ตรวจสอบโควต้า & พื้นที่</h1>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
              Free Tier (0 บาท)
            </span>
          </div>
          <p className="text-slate-400 text-xs mt-1">
            ควบคุมการใช้ทรัพยากร Supabase Free ให้ประหยัดและยาวนานที่สุด
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-colors disabled:opacity-50"
          title="รีเฟรชข้อมูล"
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin text-blue-400' : ''} />
        </button>
      </div>

      {/* Health Status Banner */}
      <div className={`p-4 rounded-2xl border ${status.bg} transition-all`}>
        <div className="flex items-start gap-3">
          {status.level === 'normal' && <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={20} />}
          {status.level === 'warning' && <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />}
          {status.level === 'critical' && <AlertTriangle className="text-rose-400 shrink-0 mt-0.5" size={20} />}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${status.badge}`}>
                {status.label}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pt-1">
              {status.desc}
            </p>
          </div>
        </div>
      </div>

      {/* Storage Progress Section */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <HardDrive size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">พื้นที่เก็บรูป (Supabase Storage)</h2>
              <p className="text-xs text-slate-500">โควต้าฟรี 1,024 MB (1 GB)</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-sm font-bold text-white">{usedMb.toFixed(1)} MB</span>
            <span className="text-xs text-slate-500"> / 1,024 MB</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="h-3 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-700">
            <div
              className={`h-full rounded-full transition-all duration-500 ${storagePercentage >= 85
                  ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                  : storagePercentage >= 70
                    ? 'bg-gradient-to-r from-blue-500 to-amber-500'
                    : 'bg-gradient-to-r from-blue-500 to-emerald-500'
                }`}
              style={{ width: `${Math.max(2, storagePercentage)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>ใช้ไป {storagePercentage.toFixed(1)}%</span>
            <span>เหลือ {formatFileSize(remainingBytes)}</span>
          </div>
        </div>

        {/* Storage Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/60">
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/40">
            <p className="text-[11px] text-slate-500">จำนวนรูปทั้งหมด</p>
            <p className="text-base font-bold text-white mt-0.5">
              {stats?.photoCount ? stats.photoCount.toLocaleString() : 0} <span className="text-xs text-slate-400 font-normal">รูป</span>
            </p>
          </div>
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/40">
            <p className="text-[11px] text-slate-500">คาดว่าเก็บเพิ่มได้อีกประมาณ</p>
            <p className="text-base font-bold text-emerald-400 mt-0.5">
              ~{estimatedRemainingPhotos.toLocaleString()} <span className="text-xs text-slate-400 font-normal">รูป</span>
            </p>
          </div>
        </div>
      </div>

      {/* Database Stats Section */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Database size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">ฐานข้อมูล (PostgreSQL Database)</h2>
              <p className="text-xs text-slate-500">โควต้าฟรี 500 MB (จุได้หลายแสนเรคคอร์ด)</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            สบายมาก
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 pt-1">
          <div className="bg-slate-900/60 rounded-xl p-2.5 text-center border border-slate-700/40">
            <p className="text-[10px] text-slate-500">ใบคำขอ</p>
            <p className="text-sm font-bold text-white mt-0.5">{stats?.requestsCount || 0}</p>
          </div>
          <div className="bg-slate-900/60 rounded-xl p-2.5 text-center border border-slate-700/40">
            <p className="text-[10px] text-slate-500">สิ่งของ</p>
            <p className="text-sm font-bold text-white mt-0.5">{stats?.itemsCount || 0}</p>
          </div>
          <div className="bg-slate-900/60 rounded-xl p-2.5 text-center border border-slate-700/40">
            <p className="text-[10px] text-slate-500">ยืม-คืน</p>
            <p className="text-sm font-bold text-white mt-0.5">{stats?.loansCount || 0}</p>
          </div>
          <div className="bg-slate-900/60 rounded-xl p-2.5 text-center border border-slate-700/40">
            <p className="text-[10px] text-slate-500">บันทึกประวัติ</p>
            <p className="text-sm font-bold text-white mt-0.5">{stats?.historyCount || 0}</p>
          </div>
        </div>
      </div>


      {/* CSV Export Tools Section */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <FileSpreadsheet size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">ส่งออกข้อมูลเป็น CSV (เปิดใน Excel ได้ทันที)</h2>
            <p className="text-xs text-slate-500">รองรับ UTF-8 BOM ภาษาไทยไม่เพี้ยน ไม่เสียค่าใช้จ่าย</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <button
            onClick={handleExportRequests}
            disabled={isExporting !== null}
            className="flex items-center justify-between p-3 rounded-xl bg-slate-900/70 hover:bg-slate-900 border border-slate-700 text-left transition-all active:scale-[0.98] group"
          >
            <div>
              <p className="text-xs font-semibold text-white group-hover:text-blue-400 transition-colors">
                1. รายการรับ-ส่งของ
              </p>
              <p className="text-[10px] text-slate-500">สถานะ, ผู้ส่ง, ผู้รับ, วันที่</p>
            </div>
            <Download size={15} className="text-slate-400 group-hover:text-white transition-colors" />
          </button>

          <button
            onClick={handleExportItems}
            disabled={isExporting !== null}
            className="flex items-center justify-between p-3 rounded-xl bg-slate-900/70 hover:bg-slate-900 border border-slate-700 text-left transition-all active:scale-[0.98] group"
          >
            <div>
              <p className="text-xs font-semibold text-white group-hover:text-blue-400 transition-colors">
                2. รายการสิ่งของ & อะไหล่
              </p>
              <p className="text-[10px] text-slate-500">ชื่อของ, รหัส Part, จำนวน</p>
            </div>
            <Download size={15} className="text-slate-400 group-hover:text-white transition-colors" />
          </button>

          <button
            onClick={handleExportLoans}
            disabled={isExporting !== null}
            className="flex items-center justify-between p-3 rounded-xl bg-slate-900/70 hover:bg-slate-900 border border-slate-700 text-left transition-all active:scale-[0.98] group"
          >
            <div>
              <p className="text-xs font-semibold text-white group-hover:text-blue-400 transition-colors">
                3. บันทึกการยืม-คืน
              </p>
              <p className="text-[10px] text-slate-500">ผู้ยืม, กำหนดคืน, วันที่ส่งคืน</p>
            </div>
            <Download size={15} className="text-slate-400 group-hover:text-white transition-colors" />
          </button>

          <button
            onClick={handleExportPhotos}
            disabled={isExporting !== null}
            className="flex items-center justify-between p-3 rounded-xl bg-slate-900/70 hover:bg-slate-900 border border-slate-700 text-left transition-all active:scale-[0.98] group"
          >
            <div>
              <p className="text-xs font-semibold text-white group-hover:text-blue-400 transition-colors">
                4. สารบัญรูปภาพหลักฐาน
              </p>
              <p className="text-[10px] text-slate-500">ขนาดไฟล์, ขั้นตอน, ที่เก็บรูป</p>
            </div>
            <Download size={15} className="text-slate-400 group-hover:text-white transition-colors" />
          </button>
        </div>
      </div>

      {/* PC Backup Integration Guide */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Laptop size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">ระบบสำรองข้อมูลพร้อมรูปภาพลงคอมพิวเตอร์ Windows</h2>
            <p className="text-xs text-slate-500">ปลอดภัย 100% สำรองทั้ง SQL และไฟล์รูปภาพจริง</p>
          </div>
        </div>

        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700/60 space-y-2 text-xs text-slate-300">
          <p className="flex items-center gap-2 font-medium text-white">
            <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[11px] font-bold">1</span>
            ดับเบิลคลิกไฟล์ในโฟลเดอร์โครงการ:
          </p>
          <div className="bg-slate-950 p-2 rounded-lg font-mono text-emerald-400 text-[11px] select-all">
            scripts\backup\run-backup.bat
          </div>
          <p className="flex items-center gap-2 font-medium text-white pt-1">
            <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[11px] font-bold">2</span>
            ผลลัพธ์การสำรองข้อมูล:
          </p>
          <p className="text-slate-400 text-[11px] pl-7">
            ระบบจะสร้างโฟลเดอร์วันที่ใน <code className="text-blue-300">backups\</code> พร้อมไฟล์ <code className="text-blue-300">schema_and_data.sql</code>, ไฟล์ JSON ของทั้ง 9 ตาราง และโฟลเดอร์ <code className="text-blue-300">storage_files\</code> ที่ดาวน์โหลดรูปภาพทั้งหมดลงเครื่องให้อัตโนมัติ
          </p>
        </div>
      </div>

      {/* Strict Policy & Transparency Cards */}
      <div className="space-y-3">
        {/* Policy 1: Never auto-delete photos */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
          <ShieldCheck className="text-emerald-400 shrink-0 mt-0.5" size={20} />
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-white">นโยบายรักษาความสมบูรณ์ของหลักฐาน (Strict Evidence Retention)</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              ระบบนี้<strong>ไม่มีการลบรูปภาพหรือประวัติการดำเนินงานโดยอัตโนมัติ</strong>เพื่อประหยัดพื้นที่ ทุกรูปภาพที่ถ่ายตอนส่งของ รับของ และรายงานปัญหา จะถูกเก็บไว้อย่างถาวรเป็นหลักฐานอ้างอิงเสมอ
            </p>
          </div>
        </div>

        {/* Policy 2: Official Supabase Inactivity Rules */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
          <Info className="text-blue-400 shrink-0 mt-0.5" size={20} />
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-white">เงื่อนไขการหยุดพักโปรเจกต์ (7-Day Inactivity Rule ของ Supabase Free)</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              ตามข้อกำหนดทางการของ Supabase แผน Free Tier จะเข้าสู่สถานะ <strong>Paused (หยุดพัก)</strong> หากไม่มีการใช้งานติดต่อกัน 7 วัน
            </p>
            <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 mt-2 space-y-1">
              <p className="text-[11px] text-slate-300 font-medium">
                💡 ระบบนี้ปฏิบัติตามกฎอย่างโปร่งใส และ<strong>ไม่ใช้บอทยิงคำขอถี่ ๆ ปลอม</strong>เพื่อหลอกระบบ
              </p>
              <p className="text-[10px] text-slate-400">
                หากระบบหยุดพัก ผู้ดูแลสามารถเข้าหน้าเว็บ Supabase Dashboard แล้วกดปุ่ม <strong>"Restore project"</strong> เพียง 1 คลิก ระบบจะกลับมาทำงานตามปกติภายใน 1-2 นาที โดยข้อมูลและรูปภาพทั้งหมดยังคงอยู่ครบถ้วน 100%
              </p>
            </div>
          </div>
        </div>

        {/* Policy 3: Options before any charges */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
          <HelpCircle className="text-purple-400 shrink-0 mt-0.5" size={20} />
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-white">ทางเลือกเมื่อใช้งานจนใกล้เต็มโควต้าฟรี (0 บาท)</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              ระบบจะแจ้งเตือนเมื่อพื้นที่ Storage เกิน 85% โดยมี 2 ทางเลือกที่ชัดเจนก่อนเกิดค่าใช้จ่ายใด ๆ:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-emerald-400 font-bold">ทางเลือกที่ 1: งบ 0 บาท (แนะนำ)</span>
                <p className="text-slate-400 mt-0.5">
                  กด Export CSV และใช้สคริปต์สำรองข้อมูลลง PC ประจำเดือน เก็บไฟล์ไว้นอกระบบได้อย่างปลอดภัยโดยไม่มีค่าใช้จ่าย
                </p>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-blue-400 font-bold">ทางเลือกที่ 2: อัปเกรด Pro ($25/เดือน)</span>
                <p className="text-slate-400 mt-0.5">
                  สำหรับกรณีที่ต้องการใช้งานต่อเนื่องแบบไม่จำกัดวันหยุดพัก และขยายพื้นที่เป็น 8 GB DB / 100 GB Storage
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
