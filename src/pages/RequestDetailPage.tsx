import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, Package, Clock, Truck, CheckCircle, AlertTriangle,
  Camera, RefreshCw, ChevronDown, ChevronUp, MapPin, User, Calendar,
  X, AlertCircle, BookOpen, RotateCcw, Trash2, Edit3, ShieldAlert, Save, ArrowRightLeft, Plus
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useQuickOptions } from '../hooks/useQuickOptions'
import { cn, formatDateTime, formatDate, STATUS_LABELS, PHOTO_STAGE_LABELS, formatQuantity, compressImage } from '../lib/utils'
import PhotoUploader, { type UploadedPhoto } from '../components/PhotoUploader'
import { uploadEvidencePhoto } from '../lib/photoUpload'
import toast from 'react-hot-toast'
import type { TransferRequest, RequestStatus } from '../types/database'

async function fetchRequestDetail(id: string) {
  const { data, error } = await supabase
    .from('transfer_requests')
    .select(`
      *,
      from_location:locations!transfer_requests_from_location_id_fkey(*),
      to_location:locations!transfer_requests_to_location_id_fkey(*),
      requester:profiles!transfer_requests_requester_id_fkey(*),
      preparer:profiles!transfer_requests_preparer_id_fkey(*),
      deposited_by_profile:profiles!transfer_requests_deposited_by_fkey(id,full_name),
      received_by_profile:profiles!transfer_requests_received_by_fkey(id,full_name),
      items:transfer_request_items(*),
      photos:item_photos(*,taker:profiles!item_photos_taken_by_fkey(id,full_name)),
      status_history:status_history(*,changer:profiles!status_history_changed_by_fkey(id,full_name))
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data as any
}

const STATUS_COLORS: Record<string, string> = {
  pending_confirm: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  preparing: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  ready_to_send: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
  in_transit: 'text-sky-400 bg-sky-400/10 border-sky-400/30',
  partially_received: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  completed: 'text-green-400 bg-green-400/10 border-green-400/30',
  problem_reported: 'text-red-400 bg-red-400/10 border-red-400/30',
  returning: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/30',
  return_in_transit: 'text-sky-400 bg-sky-400/10 border-sky-400/30',
  partially_returned: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  return_completed: 'text-green-400 bg-green-400/10 border-green-400/30',
  cancelled: 'text-slate-400 bg-slate-400/10 border-slate-400/30',
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const qc = useQueryClient()

  const [showTimeline, setShowTimeline] = useState(false)
  const [showAction, setShowAction] = useState<string | null>(null)
  const [actionPhotos, setActionPhotos] = useState<UploadedPhoto[]>([])
  const [receiptQtys, setReceiptQtys] = useState<Record<string, number>>({})
  const [actionNotes, setActionNotes] = useState('')
  const [problemType, setProblemType] = useState<string>('incomplete')
  const [isDepositing, setIsDepositing] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [receiverStaffInput, setReceiverStaffInput] = useState('')
  const receiverInputInitializedRef = useRef(false)
  const { staffOptions, addOption } = useQuickOptions()
  const [isAddingReceiverStaff, setIsAddingReceiverStaff] = useState(false)
  const [newReceiverStaffName, setNewReceiverStaffName] = useState('')

  useEffect(() => {
    if (profile?.full_name && !receiverInputInitializedRef.current) {
      setReceiverStaffInput(profile.full_name)
      receiverInputInitializedRef.current = true
    }
  }, [profile?.full_name])

  const { data: request, isLoading, error, refetch } = useQuery({
    queryKey: ['request', id],
    queryFn: () => fetchRequestDetail(id!),
    enabled: !!id,
    refetchInterval: 5000, // 5s fallback polling
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['request', id] })
    qc.invalidateQueries({ queryKey: ['requests'] })
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    qc.invalidateQueries({ queryKey: ['recent-requests'] })
    qc.invalidateQueries({ queryKey: ['history'] })
    qc.invalidateQueries({ queryKey: ['tool-journey'] })
    qc.invalidateQueries({ queryKey: ['usage'] })
  }

  // Admin Controls State
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [isAdminEditing, setIsAdminEditing] = useState(false)
  const [adminEditTitle, setAdminEditTitle] = useState('')
  const [adminEditTerminal, setAdminEditTerminal] = useState('')
  const [adminEditAppNo, setAdminEditAppNo] = useState('')
  const [adminEditSenderStaff, setAdminEditSenderStaff] = useState('')
  const [adminEditRemarkBase, setAdminEditRemarkBase] = useState('')
  const [adminEditNotes, setAdminEditNotes] = useState('')
  const [adminOverrideStatus, setAdminOverrideStatus] = useState<RequestStatus | ''>('')
  const [adminOverrideNotes, setAdminOverrideNotes] = useState('')
  const [isAdminOperating, setIsAdminOperating] = useState(false)

  const startAdminEdit = () => {
    if (!request) return
    setAdminEditTitle(request.title || '')
    setAdminEditTerminal(request.terminal_name || '')
    setAdminEditAppNo(request.app_no || '')
    setAdminEditRemarkBase(request.remark_base || '')
    setAdminEditSenderStaff(request.sender_staff_name || '')
    setAdminEditNotes(request.notes || '')
    setIsAdminEditing(true)
  }

  const handleAdminSaveEdit = async () => {
    if (!profile || profile.role !== 'admin' || !request) return
    setIsAdminOperating(true)
    try {
      const { error } = await supabase
        .from('transfer_requests')
        .update({
          title: adminEditTitle.trim() || request.title,
          terminal_name: adminEditTerminal.trim() || null,
          app_no: adminEditAppNo.trim() || null,
          remark_base: adminEditRemarkBase.trim() || null,
          sender_staff_name: adminEditSenderStaff.trim() || null,
          notes: adminEditNotes.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', request.id)

      if (error) throw error
      toast.success('บันทึกการแก้ไขข้อมูลสำเร็จ')
      setIsAdminEditing(false)
      invalidate()
    } catch (e: any) {
      toast.error(`แก้ไขไม่สำเร็จ: ${e.message}`)
    } finally {
      setIsAdminOperating(false)
    }
  }

  const handleAdminOverrideStatusSubmit = async () => {
    if (!profile || profile.role !== 'admin' || !request || !adminOverrideStatus) return
    setIsAdminOperating(true)
    try {
      const { error } = await supabase
        .from('transfer_requests')
        .update({
          status: adminOverrideStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', request.id)

      if (error) throw error

      await supabase.from('status_history').insert({
        request_id: request.id,
        from_status: request.status,
        to_status: adminOverrideStatus,
        changed_by: profile.id,
        notes: adminOverrideNotes ? `[Admin ปรับสถานะ] ${adminOverrideNotes}` : '[ผู้ดูแลระบบปรับเปลี่ยนสถานะโดยตรง]',
      })

      toast.success(`ปรับสถานะเป็น "${STATUS_LABELS[adminOverrideStatus] || adminOverrideStatus}" สำเร็จ`)
      setAdminOverrideStatus('')
      setAdminOverrideNotes('')
      invalidate()
    } catch (e: any) {
      toast.error(`ปรับสถานะไม่สำเร็จ: ${e.message}`)
    } finally {
      setIsAdminOperating(false)
    }
  }

  const handleAdminDelete = async () => {
    if (!profile || profile.role !== 'admin' || !request) return
    const confirmed = window.confirm(
      `⚠️ คำเตือนจากระบบ (เฉพาะ Admin):\n\nคุณแน่ใจหรือไม่ว่าต้องการลบใบงาน "${request.request_number}" (${request.terminal_name || request.title}) ออกจากระบบ?\n\n* รายการสิ่งของ ประวัติสถานะ และรูปภาพหลักฐานทั้งหมดจะถูกลบถาวร ไม่สามารถกู้คืนได้`
    )
    if (!confirmed) return

    setIsAdminOperating(true)
    try {
      const { error } = await supabase
        .from('transfer_requests')
        .delete()
        .eq('id', request.id)

      if (error) throw error

      toast.success('ลบใบงานและประวัติเรียบร้อยแล้ว')
      invalidate()
      qc.invalidateQueries({ queryKey: ['history'] })
      navigate('/requests')
    } catch (e: any) {
      toast.error(`ลบไม่สำเร็จ: ${e.message}`)
    } finally {
      setIsAdminOperating(false)
    }
  }

  const handleAdminDeleteHistoryItem = async (historyId: string) => {
    if (!profile || profile.role !== 'admin') return
    if (!window.confirm('ต้องการลบบันทึกประวัตินี้ใช่หรือไม่?')) return
    try {
      const { error } = await supabase.from('status_history').delete().eq('id', historyId)
      if (error) throw error
      toast.success('ลบบันทึกประวัติสำเร็จ')
      invalidate()
    } catch (e: any) {
      toast.error(`ลบไม่สำเร็จ: ${e.message}`)
    }
  }

  const changeStatus = async (newStatus: RequestStatus, notes?: string) => {
    if (!profile || !request) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('ขณะนี้ไม่มีสัญญาณอินเทอร์เน็ต กรุณารอเชื่อมต่อเน็ตก่อนดำเนินการ', { icon: '📡' })
      return
    }
    const { error } = await supabase
      .from('transfer_requests')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', request.id)

    if (error) throw error

    await supabase.from('status_history').insert({
      request_id: request.id,
      from_status: request.status,
      to_status: newStatus,
      changed_by: profile.id,
      notes: notes ?? null,
    })

    // Notify other users
    const { data: others } = await supabase
      .from('profiles')
      .select('id')
      .neq('id', profile.id)
      .eq('is_active', true)

    if (others?.length) {
      const notifType = newStatus === 'in_transit' ? 'deposited'
        : newStatus === 'completed' ? 'return_received'
          : newStatus === 'problem_reported' ? 'problem_reported'
            : 'request_confirmed'

      await supabase.from('notifications').insert(
        others.map((p: any) => ({
          recipient_id: p.id,
          request_id: request.id,
          type: notifType,
          title: STATUS_LABELS[newStatus] ?? newStatus,
          message: `${profile.full_name}: ${request.request_number} → ${STATUS_LABELS[newStatus]}`,
          is_read: false,
        }))
      )
    }
  }

  const handleConfirmRequest = async () => {
    if (!profile) return
    try {
      await changeStatus('preparing', 'ยืนยันคำขอแล้ว')
      toast.success('ยืนยันคำขอสำเร็จ')
      invalidate()
    } catch (e: any) {
      toast.error(`ผิดพลาด: ${e.message}`)
    }
  }

  const handleReadyToSend = async () => {
    if (!profile) return
    try {
      await changeStatus('ready_to_send', 'เตรียมของเสร็จแล้ว')
      toast.success('บันทึกสถานะพร้อมฝากสำเร็จ')
      invalidate()
      setShowAction(null)
    } catch (e: any) {
      toast.error(`ผิดพลาด: ${e.message}`)
    }
  }

  const handleDeposit = async () => {
    if (!profile || !request) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('ขณะนี้ไม่มีสัญญาณอินเทอร์เน็ต กรุณารอเชื่อมต่อก่อนฝากของ', { icon: '📡' })
      return
    }
    setIsDepositing(true)

    try {
      const now = new Date().toISOString()

      // Upload deposit photos first
      const photosToUpload = actionPhotos.filter(p => p.status === 'pending' && p.file)
      for (const photo of photosToUpload) {
        // We need to upload manually here since we have the request ID
        await uploadActionPhoto(photo, request.id, 'deposit')
      }

      const { error } = await supabase
        .from('transfer_requests')
        .update({
          status: 'in_transit',
          deposited_at: now,
          deposited_recorded_at: now,
          deposited_by: profile.id,
          is_deposit_backdated: false,
        })
        .eq('id', request.id)

      if (error) throw error

      await supabase.from('status_history').insert({
        request_id: request.id,
        from_status: request.status,
        to_status: 'in_transit',
        changed_by: profile.id,
        notes: actionNotes || 'ฝากของไปกับรถแล้ว',
      })

      // Notify
      const { data: others } = await supabase
        .from('profiles').select('id').neq('id', profile.id).eq('is_active', true)
      if (others?.length) {
        await supabase.from('notifications').insert(
          others.map((p: any) => ({
            recipient_id: p.id,
            request_id: request.id,
            type: 'deposited',
            title: 'ฝากของแล้ว รอรับ',
            message: `${profile.full_name} ฝาก ${request.request_number} ไปกับรถแล้ว`,
            is_read: false,
          }))
        )
      }

      toast.success('บันทึกการฝากของสำเร็จ')
      setShowAction(null)
      setActionPhotos([])
      setActionNotes('')
      invalidate()
    } catch (e: any) {
      toast.error(`ผิดพลาด: ${e.message}`)
    } finally {
      setIsDepositing(false)
    }
  }

  const uploadActionPhoto = async (photo: UploadedPhoto, requestId: string, stage: string) => {
    if (!photo.file || !profile) return
    await uploadEvidencePhoto({
      file: photo.file,
      requestId,
      requestNumber: request?.request_number || request?.app_no,
      stage: stage as any,
      userId: profile.id,
      isEvidence: true,
    })
  }

  const handleConfirmReceipt = async (hasProblem: boolean) => {
    if (!profile || !request) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('ขณะนี้ไม่มีสัญญาณอินเทอร์เน็ต กรุณารอเชื่อมต่อก่อนยืนยันรับของ', { icon: '📡' })
      return
    }

    try {
      // Upload receipt photos
      for (const photo of actionPhotos.filter(p => p.file)) {
        await uploadActionPhoto(photo, request.id, hasProblem ? 'receipt_problem' : 'receipt')
      }

      // Calculate received quantities
      const items = request.items ?? []
      let allReceived = true
      let totalSent = 0
      let totalReceived = 0

      const confirmItems = items.map((item: any) => {
        const qty = hasProblem ? (receiptQtys[item.id] ?? 0) : item.quantity_sent
        totalSent += item.quantity_sent
        totalReceived += qty
        if (qty < item.quantity_sent) allReceived = false
        return { item_id: item.id, quantity_received: qty }
      })

      // Create confirmation record
      const { data: conf, error: confErr } = await supabase
        .from('receipt_confirmations')
        .insert({
          request_id: request.id,
          confirmed_by: profile.id,
          confirmed_at: new Date().toISOString(),
          confirmation_type: 'receipt',
          notes: actionNotes || null,
          problem_type: hasProblem ? (problemType as any) : null,
          problem_description: hasProblem ? actionNotes : null,
        })
        .select()
        .single()

      if (confErr) throw confErr

      // Insert confirmation items
      await supabase.from('receipt_confirmation_items').insert(
        confirmItems.map((ci: any) => ({
          confirmation_id: conf.id,
          item_id: ci.item_id,
          quantity_received: ci.quantity_received,
        }))
      )

      // Update item quantities
      for (const ci of confirmItems) {
        const item = items.find((i: any) => i.id === ci.item_id)
        if (!item) continue
        const newQty = Math.min(item.quantity_received + ci.quantity_received, item.quantity_sent)
        await supabase
          .from('transfer_request_items')
          .update({ quantity_received: newQty })
          .eq('id', ci.item_id)
      }

      // Update request status
      let newStatus: RequestStatus
      if (hasProblem && problemType !== 'other') {
        newStatus = allReceived ? 'problem_reported' : 'partially_received'
      } else if (allReceived) {
        newStatus = 'completed'
      } else {
        newStatus = 'partially_received'
      }

      const finalReceiver = receiverStaffInput.trim() || profile.full_name || 'ผู้รับ'

      await supabase.from('transfer_requests').update({
        status: newStatus,
        received_at: new Date().toISOString(),
        received_by: profile.id,
        receiver_staff_name: finalReceiver,
      }).eq('id', request.id)

      await supabase.from('status_history').insert({
        request_id: request.id,
        from_status: request.status,
        to_status: newStatus,
        changed_by: profile.id,
        notes: hasProblem ? `แจ้งปัญหา: ${actionNotes}` : `ยืนยันรับของแล้ว (ผู้รับ: ${finalReceiver})`,
      })

      // Notify
      const { data: others } = await supabase
        .from('profiles').select('id').neq('id', profile.id).eq('is_active', true)
      if (others?.length) {
        await supabase.from('notifications').insert(
          others.map((p: any) => ({
            recipient_id: p.id,
            request_id: request.id,
            type: hasProblem ? 'problem_reported' : (newStatus === 'completed' ? 'return_received' : 'received_incomplete'),
            title: STATUS_LABELS[newStatus],
            message: `${profile.full_name}: ยืนยันรับ ${request.request_number}`,
            is_read: false,
          }))
        )
      }

      toast.success('บันทึกการรับของสำเร็จ')
      setShowAction(null)
      setActionPhotos([])
      setReceiptQtys({})
      setActionNotes('')
      invalidate()
    } catch (e: any) {
      toast.error(`ผิดพลาด: ${e.message}`)
    }
  }

  const handleReturnDeposit = async () => {
    if (!profile || !request) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('ขณะนี้ไม่มีสัญญาณอินเทอร์เน็ต กรุณารอเชื่อมต่อก่อนฝากคืน', { icon: '📡' })
      return
    }
    try {
      for (const photo of actionPhotos.filter(p => p.file)) {
        await uploadActionPhoto(photo, request.id, 'pre_return')
      }
      await supabase.from('transfer_requests').update({
        status: 'return_in_transit',
        return_deposited_at: new Date().toISOString(),
        return_deposited_by: profile.id,
      }).eq('id', request.id)

      await supabase.from('status_history').insert({
        request_id: request.id,
        from_status: request.status,
        to_status: 'return_in_transit',
        changed_by: profile.id,
        notes: actionNotes || 'ฝากของคืนไปกับรถแล้ว',
      })

      toast.success('บันทึกการฝากคืนสำเร็จ')
      setShowAction(null)
      setActionPhotos([])
      setActionNotes('')
      invalidate()
    } catch (e: any) {
      toast.error(`ผิดพลาด: ${e.message}`)
    }
  }

  const handleConfirmReturn = async () => {
    if (!profile || !request) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('ขณะนี้ไม่มีสัญญาณอินเทอร์เน็ต กรุณารอเชื่อมต่อก่อนยืนยันรับคืน', { icon: '📡' })
      return
    }
    try {
      for (const photo of actionPhotos.filter(p => p.file)) {
        await uploadActionPhoto(photo, request.id, 'return_receipt')
      }

      const items = request.items ?? []
      let allReturned = true

      for (const item of items) {
        const returnQty = receiptQtys[item.id] ?? item.quantity_received
        const newQty = Math.min(item.quantity_returned + returnQty, item.quantity_received)
        if (newQty < item.quantity_sent) allReturned = false

        await supabase.from('transfer_request_items')
          .update({ quantity_returned: newQty })
          .eq('id', item.id)
      }

      const newStatus: RequestStatus = allReturned ? 'return_completed' : 'partially_returned'

      await supabase.from('transfer_requests').update({
        status: newStatus,
        return_received_at: new Date().toISOString(),
        return_received_by: profile.id,
      }).eq('id', request.id)

      await supabase.from('status_history').insert({
        request_id: request.id,
        from_status: request.status,
        to_status: newStatus,
        changed_by: profile.id,
        notes: actionNotes || 'ยืนยันรับของคืน',
      })

      toast.success('บันทึกการรับคืนสำเร็จ')
      setShowAction(null)
      setActionPhotos([])
      setReceiptQtys({})
      setActionNotes('')
      invalidate()
    } catch (e: any) {
      toast.error(`ผิดพลาด: ${e.message}`)
    }
  }

  const handleCancel = async () => {
    if (!profile || !request) return
    if (!window.confirm('ยืนยันการยกเลิกรายการนี้?')) return
    try {
      const reason = prompt('ระบุเหตุผลการยกเลิก:')
      await supabase.from('transfer_requests').update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: profile.id,
        cancel_reason: reason ?? null,
      }).eq('id', request.id)

      await supabase.from('status_history').insert({
        request_id: request.id,
        from_status: request.status,
        to_status: 'cancelled',
        changed_by: profile.id,
        notes: reason ?? 'ยกเลิกรายการ',
      })

      toast.success('ยกเลิกรายการสำเร็จ')
      invalidate()
    } catch (e: any) {
      toast.error(`ผิดพลาด: ${e.message}`)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 pt-2">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-slate-800 text-slate-400 touch-feedback">
            <ChevronLeft size={20} />
          </button>
          <div className="shimmer h-7 w-48 rounded-xl" />
        </div>
        <div className="shimmer h-40 rounded-2xl" />
        <div className="shimmer h-32 rounded-2xl" />
      </div>
    )
  }

  if (error || !request) {
    return (
      <div className="p-4 pt-6 text-center">
        <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
        <p className="text-slate-300 font-medium">ไม่พบรายการ</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-blue-400 text-sm">← กลับ</button>
      </div>
    )
  }

  const photos = (request.photos ?? []) as any[]
  const items = (request.items ?? []) as any[]
  const history = ((request.status_history ?? []) as any[]).sort(
    (a: any, b: any) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
  )

  const photosByStage = photos.reduce((acc: Record<string, any[]>, p: any) => {
    acc[p.photo_stage] = acc[p.photo_stage] ?? []
    acc[p.photo_stage].push(p)
    return acc
  }, {})

  const totalSent = items.reduce((s: number, i: any) => s + i.quantity_sent, 0)
  const totalReceived = items.reduce((s: number, i: any) => s + i.quantity_received, 0)
  const totalReturned = items.reduce((s: number, i: any) => s + i.quantity_returned, 0)
  const canCancel = !['completed', 'return_completed', 'cancelled'].includes(request.status)

  const het1Id = 'e4efcba9-d25e-44c4-9d92-8089195bceb4'
  const het2Id = '1979ede3-5a7f-4b65-8ccf-de428093458d'

  // Determine current user's plant (HET-1 vs HET-2)
  // Strict rule: HET-1 sends -> HET-2 must receive; HET-2 sends -> HET-1 must receive
  const userLocationId = profile?.home_location_id || (profile?.email === '2@a.com' ? het2Id : het1Id)
  const isSender = (request.from_location_id === userLocationId)
  const isReceiver = (request.to_location_id === userLocationId)
  const isAdmin = profile?.role === 'admin'

  // Determine available actions based on status and plant role (HET-1 sends -> HET-2 receives)
  const actions = getAvailableActions(request.status, request.type, isSender, isReceiver, isAdmin, request.to_location?.name)

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors touch-feedback"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
              {request.request_number}
            </span>
            {request.app_no && (
              <button
                type="button"
                onClick={() => navigate(`/tool-journey?q=${encodeURIComponent(request.app_no)}`)}
                className="text-xs font-mono font-bold text-blue-300 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-colors active:scale-95"
                title="ดูประวัติการเดินทางของ Applicator นี้"
              >
                <span>{request.app_no}</span>
                <span className="text-[10px] text-blue-400 font-sans">🧭 ประวัติ</span>
              </button>
            )}
            {request.remark_base && (
              <span className="text-[11px] font-medium text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-lg">
                {request.remark_base}
              </span>
            )}
          </div>
          <h1 className="text-base font-bold text-white break-words mt-1 leading-snug">
            {request.terminal_name || request.title}
          </h1>
        </div>
        <button onClick={() => refetch()} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white border border-slate-700 touch-feedback">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Status Banner */}
      <div className={cn(
        'rounded-2xl border p-4',
        STATUS_COLORS[request.status] ?? 'text-slate-400 bg-slate-800 border-slate-700'
      )}>
        <div className="flex items-center gap-2">
          <StatusIcon status={request.status} />
          <div>
            <p className="font-bold text-base">{STATUS_LABELS[request.status] ?? request.status}</p>
            <p className="text-xs opacity-70 mt-0.5">
              {request.type === 'loan' ? 'ยืมของ' : 'ฝาก/ส่งของ'}
              {request.loan_due_date && ` · กำหนดคืน ${formatDate(request.loan_due_date)}`}
            </p>
          </div>
        </div>
      </div>

      {/* Admin Control Panel (Only visible for admin role) */}
      {profile?.role === 'admin' && (
        <div className="bg-gradient-to-br from-amber-500/10 via-slate-800 to-slate-900 border border-amber-500/30 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xl select-none">👑</span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white">การจัดการสำหรับ Admin</h2>
                  <span className="text-[10px] bg-amber-500/25 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded-md font-mono font-bold">
                    SUPER ADMIN
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">แก้ไขข้อมูล, ปรับเปลี่ยนสถานะ, หรือลบประวัติ</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAdminPanel(!showAdminPanel)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <span>{showAdminPanel ? 'ซ่อนเมนู' : 'เปิดเมนูจัดการ'}</span>
              {showAdminPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {showAdminPanel && (
            <div className="space-y-4 mt-4 pt-4 border-t border-amber-500/20">
              {/* Option 1: Edit info */}
              <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/60">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <Edit3 size={14} className="text-blue-400" />
                    <span>แก้ไขข้อมูลใบงาน (Edit Details)</span>
                  </div>
                  {!isAdminEditing && (
                    <button
                      type="button"
                      onClick={startAdminEdit}
                      className="text-xs bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 px-2.5 py-1 rounded-lg transition-all active:scale-95"
                    >
                      แก้ไขข้อมูล
                    </button>
                  )}
                </div>

                {isAdminEditing ? (
                  <div className="space-y-2.5 mt-2">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">หัวข้อรายการ</label>
                      <input
                        value={adminEditTitle}
                        onChange={e => setAdminEditTitle(e.target.value)}
                        className="input-field text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">เบอร์เทอร์มินอล (Terminal)</label>
                        <input
                          value={adminEditTerminal}
                          onChange={e => setAdminEditTerminal(e.target.value)}
                          className="input-field text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">เบอร์ App (App No)</label>
                        <input
                          value={adminEditAppNo}
                          onChange={e => setAdminEditAppNo(e.target.value)}
                          className="input-field text-xs"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">ฐาน App (Remark Base)</label>
                        <input
                          value={adminEditRemarkBase}
                          onChange={e => setAdminEditRemarkBase(e.target.value)}
                          className="input-field text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">ชื่อผู้รับ-ส่ง (Sender Staff)</label>
                        <input
                          value={adminEditSenderStaff}
                          onChange={e => setAdminEditSenderStaff(e.target.value)}
                          className="input-field text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">หมายเหตุเพิ่มเติม</label>
                      <textarea
                        value={adminEditNotes}
                        onChange={e => setAdminEditNotes(e.target.value)}
                        rows={2}
                        className="input-field text-xs resize-none"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleAdminSaveEdit}
                        disabled={isAdminOperating}
                        className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                      >
                        <Save size={13} />
                        <span>{isAdminOperating ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAdminEditing(false)}
                        className="px-3 py-2 rounded-xl bg-slate-800 text-slate-400 text-xs hover:text-white"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    แก้ไขชื่อเทอร์มินอล, เบอร์ App, ฐาน App, ผู้ส่ง หรือหมายเหตุได้โดยตรง
                  </p>
                )}
              </div>

              {/* Option 2: Override Status */}
              <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/60">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white mb-2">
                  <ShieldAlert size={14} className="text-amber-400" />
                  <span>ปรับเปลี่ยนสถานะโดยตรง (Override Status)</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">เลือกสถานะใหม่ที่ต้องการบังคับเปลี่ยน</label>
                    <select
                      value={adminOverrideStatus}
                      onChange={e => setAdminOverrideStatus(e.target.value as RequestStatus)}
                      className="input-field text-xs"
                    >
                      <option value="">-- เลือกสถานะใหม่ --</option>
                      <option value="pending_confirm">รอปลายทางยืนยัน (pending_confirm)</option>
                      <option value="preparing">กำลังจัดเตรียม (preparing)</option>
                      <option value="ready_to_send">เตรียมของเสร็จแล้ว (ready_to_send)</option>
                      <option value="in_transit">ส่งของแล้ว / ขนส่ง (in_transit)</option>
                      <option value="partially_received">รับของแล้วบางส่วน (partially_received)</option>
                      <option value="completed">เสร็จสิ้น (completed)</option>
                      <option value="problem_reported">พบปัญหา (problem_reported)</option>
                      <option value="returning">กำลังส่งคืน (returning)</option>
                      <option value="return_in_transit">คืนของอยู่ระหว่างขนส่ง (return_in_transit)</option>
                      <option value="partially_returned">รับคืนบางส่วน (partially_returned)</option>
                      <option value="return_completed">คืนของเสร็จสิ้น (return_completed)</option>
                      <option value="cancelled">ยกเลิกรายการ (cancelled)</option>
                    </select>
                  </div>
                  {adminOverrideStatus && (
                    <>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">เหตุผลในการเปลี่ยนสถานะ (จะบันทึกลงประวัติ)</label>
                        <input
                          value={adminOverrideNotes}
                          onChange={e => setAdminOverrideNotes(e.target.value)}
                          placeholder="เช่น พนักงานกดสถานะผิดพลาด, แอดมินแก้ไขระบบ"
                          className="input-field text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAdminOverrideStatusSubmit}
                        disabled={isAdminOperating}
                        className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-all active:scale-95 disabled:opacity-50"
                      >
                        {isAdminOperating ? 'กำลังบันทึก...' : `ยืนยันปรับสถานะเป็น "${STATUS_LABELS[adminOverrideStatus] || adminOverrideStatus}"`}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Option 3: Danger Zone - Delete */}
              <div className="bg-red-500/10 rounded-xl p-3 border border-red-500/30">
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-400 mb-1">
                  <Trash2 size={14} />
                  <span>ลบใบงานและประวัตินี้ถาวร (Danger Zone)</span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3">
                  ลบข้อมูลใบงาน {request.request_number} รายการสิ่งของ ประวัติ และรูปภาพทั้งหมดออกจากฐานข้อมูลถาวร
                </p>
                <button
                  type="button"
                  onClick={handleAdminDelete}
                  disabled={isAdminOperating}
                  className="w-full py-2.5 rounded-xl bg-red-600/80 hover:bg-red-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  <span>{isAdminOperating ? 'กำลังลบข้อมูล...' : 'ลบใบงานและประวัตินี้ถาวร'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Route Info */}
      <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <MapPin size={12} className="text-blue-400" />
              <p className="text-xs text-slate-500">ต้นทาง</p>
            </div>
            <p className="font-bold text-white">{request.from_location?.name}</p>
          </div>
          <div className="text-slate-600">
            <Truck size={20} />
          </div>
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <MapPin size={12} className="text-green-400" />
              <p className="text-xs text-slate-500">ปลายทาง</p>
            </div>
            <p className="font-bold text-white">{request.to_location?.name}</p>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-700/80 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-400 flex items-center gap-1"><User size={11} className="text-purple-400" /> ผู้ส่งของ ({request.from_location?.name})</p>
            <p className="text-purple-300 font-bold mt-0.5">{request.sender_staff_name || request.requester?.full_name || '-'}</p>
          </div>
          <div>
            <p className="text-slate-400 flex items-center gap-1"><User size={11} className="text-emerald-400" /> ผู้รับ ({request.to_location?.name})</p>
            <p className="text-emerald-300 font-bold mt-0.5">
              {request.receiver_staff_name || (request.received_at ? (request.received_by_profile?.full_name || 'รับแล้ว') : 'รอปลายทางลงชื่อรับ')}
            </p>
          </div>
          <div>
            <p className="text-slate-400">เวลาฝากขึ้นรถ</p>
            <p className="text-slate-200 font-semibold mt-0.5">
              {request.deposited_at ? formatDateTime(request.deposited_at) : 'ยังไม่ได้ฝากขึ้นรถ'}
            </p>
          </div>
          <div>
            <p className="text-slate-400">เวลารับจริง (ปิดงาน)</p>
            <p className="text-emerald-400 font-semibold mt-0.5">
              {request.received_at ? formatDateTime(request.received_at) : 'รอปลายทางรับของ'}
            </p>
          </div>
        </div>
        {request.notes && (
          <div className="mt-3 pt-3 border-t border-slate-700">
            <p className="text-xs text-slate-500 mb-1">หมายเหตุ</p>
            <p className="text-sm text-slate-300">{request.notes}</p>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300">รายการสิ่งของ</h2>
          <div className="text-xs text-slate-500">
            รับ {formatQuantity(totalReceived)}/{formatQuantity(totalSent)}
          </div>
        </div>
        <div className="space-y-3">
          {items.map((item: any) => {
            const pct = item.quantity_sent > 0 ? (item.quantity_received / item.quantity_sent) * 100 : 0
            return (
              <div key={item.id} className="bg-slate-900/50 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold">{item.name}</p>
                    {item.description && <p className="text-slate-500 text-xs mt-0.5">{item.description}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white text-sm font-bold">
                      {formatQuantity(item.quantity_received)}/{formatQuantity(item.quantity_sent)}
                    </p>
                    <p className="text-slate-500 text-xs">{item.unit}</p>
                  </div>
                </div>
                {request.type === 'loan' && item.quantity_returned > 0 && (
                  <p className="text-xs text-indigo-400 mt-1">
                    คืนแล้ว {formatQuantity(item.quantity_returned)} {item.unit}
                  </p>
                )}
                {/* Progress bar */}
                <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-orange-400' : 'bg-slate-600'
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Photos by Stage */}
      {Object.entries(photosByStage).length > 0 && (
        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">รูปภาพหลักฐาน</h2>
          <div className="space-y-4">
            {Object.entries(photosByStage).map(([stage, stagePhotos]: [string, any[]]) => (
              <div key={stage}>
                <p className="text-xs font-medium text-slate-500 mb-2">{PHOTO_STAGE_LABELS[stage] ?? stage}</p>
                <div className="grid grid-cols-3 gap-2">
                  {stagePhotos.map((photo: any) => {
                    const photoSrc = photo.public_url
                      || (photo.storage_path ? supabase.storage.from('item-photos').getPublicUrl(photo.storage_path).data.publicUrl : null)
                      || (photo.gdrive_file_id ? `/api/gdrive/photo/${photo.gdrive_file_id}` : null)
                    return (
                      <div
                        key={photo.id}
                        className="relative aspect-square cursor-pointer group"
                        onClick={() => setLightboxUrl(photoSrc)}
                      >
                        {photoSrc ? (
                          <img
                            src={photoSrc}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover rounded-xl border border-slate-700/60 group-hover:border-blue-500 transition-all"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect fill='%23334155' width='100' height='100'/><text x='50' y='50' fill='%2394a3b8' text-anchor='middle' dy='.35em' font-size='12'>รูป</text></svg>`
                            }}
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-700 rounded-xl flex items-center justify-center">
                            <Camera size={20} className="text-slate-500" />
                          </div>
                        )}
                        {photo.storage_provider === 'gdrive' && (
                          <div className="absolute top-1 right-1 bg-slate-900/80 border border-blue-500/40 rounded px-1 py-0.5 text-[9px] text-blue-300 font-medium flex items-center gap-0.5 shadow-xs" title="จัดเก็บใน Google Drive 5 TB">
                            <span>☁️ Drive</span>
                          </div>
                        )}
                        {photo.taker && (
                          <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1 py-0.5">
                            <p className="text-[9px] text-white">{photo.taker.full_name}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {/* Action Buttons */}
      {actions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">การดำเนินการถัดไป</h2>
          <div className="space-y-2">
            {actions.map(action => (
              <button
                key={action.id}
                onClick={() => setShowAction(showAction === action.id ? null : action.id)}
                className={cn(
                  'w-full font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 touch-feedback text-sm shadow-lg',
                  action.variant === 'primary' ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-blue-500/25' :
                    action.variant === 'success' ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-green-600 text-white shadow-emerald-500/25' :
                      action.variant === 'warning' ? 'bg-orange-500/20 border border-orange-500/30 text-orange-400' :
                        action.variant === 'danger' ? 'bg-red-500/20 border border-red-500/30 text-red-400' :
                          'bg-slate-700 text-slate-300 border border-slate-600'
                )}
              >
                <action.icon size={18} />
                <span>{action.label}</span>
                {showAction === action.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Role-Based Guidance Banners */}
      <div className="space-y-3">
        {/* Case A: In Transit - Guidance for Receiver Plant */}
        {(isReceiver || isAdmin) && request.status === 'in_transit' && (
          <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-2xl p-4 text-xs space-y-2 backdrop-blur-md">
            <div className="flex items-center gap-2 font-bold text-emerald-300 text-sm">
              <Package size={18} className="text-emerald-400" />
              <span>📦 ของส่งมาจาก {request.from_location?.name} ถึงคุณแล้ว ({request.to_location?.name})</span>
            </div>
            <p className="text-slate-300 text-xs leading-relaxed">
              ผู้ส่ง: <strong className="text-cyan-300">{request.sender_staff_name}</strong> · ส่งถึง: <strong className="text-emerald-300">{request.receiver_staff_name || 'คุณ'}</strong> · ฝากของขึ้นรถเมื่อ <strong className="text-white">{formatDateTime(request.deposited_at)}</strong>
            </p>
            <p className="text-[11px] text-emerald-300/90 font-semibold bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-500/20">
              👉 ตรวจสอบสิ่งของและจำนวนที่ได้รับ จากนั้นแตะปุ่ม <strong>"✅ {request.to_location?.name} กดยืนยันรับของ (ปิดงาน)"</strong> ด้านล่าง
            </p>
          </div>
        )}

        {/* Case B: In Transit - Status for Sender Plant */}
        {isSender && !isAdmin && request.status === 'in_transit' && (
          <div className="bg-amber-500/15 border border-amber-500/30 rounded-2xl p-4 text-xs space-y-2 backdrop-blur-md">
            <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
              <Truck size={18} className="text-amber-400" />
              <span>🚚 อยู่ระหว่างจัดส่งไป {request.to_location?.name} · รอทาง {request.to_location?.name} รับของ</span>
            </div>
            <p className="text-slate-300 text-xs leading-relaxed">
              ฝากของไปกับรถแล้วเมื่อ <strong className="text-white">{formatDateTime(request.deposited_at)}</strong> โดย <strong className="text-cyan-300">{request.sender_staff_name || request.requester?.full_name}</strong> · ส่งถึง <strong className="text-emerald-300">{request.receiver_staff_name || 'ปลายทาง'}</strong>
            </p>
            <p className="text-[11px] text-amber-400 font-semibold bg-amber-950/40 p-2.5 rounded-xl border border-amber-500/20">
              🔒 <strong>คุณเป็นฝ่ายส่ง ({request.from_location?.name}):</strong> รายการจะค้างอยู่ในระบบจนกว่าผู้รับฝั่ง <strong>{request.to_location?.name}</strong> จะเป็นคนกดยืนยันรับของจริงเพื่อปิดงาน
            </p>
          </div>
        )}

        {/* Case C: Ready to send - Guidance for Receiver Plant */}
        {['ready_to_send', 'pending_confirm', 'preparing'].includes(request.status) && isReceiver && !isAdmin && (
          <div className="bg-blue-500/15 border border-blue-500/30 rounded-2xl p-4 text-xs space-y-2 backdrop-blur-md">
            <div className="flex items-center gap-2 font-bold text-blue-300 text-sm">
              <Clock size={18} className="text-blue-400" />
              <span>⏳ รอต้นทาง ({request.from_location?.name}) ฝากของขึ้นรถ</span>
            </div>
            <p className="text-slate-300 text-xs leading-relaxed">
              รายการนี้ถูกสร้างโดย {request.from_location?.name} เพื่อส่งให้ {request.receiver_staff_name || 'คุณ'} ({request.to_location?.name}) ขณะนี้กำลังรอให้คนส่งกด "ฝากของไปกับรถแล้ว"
            </p>
          </div>
        )}

        {/* Case D: Completed */}
        {request.status === 'completed' && (
          <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-2xl p-4 text-xs space-y-2.5 backdrop-blur-md">
            <div className="flex items-center gap-2 font-bold text-emerald-300 text-sm">
              <CheckCircle size={18} className="text-emerald-400" />
              <span>🎉 ปิดงานเรียบร้อย (ได้รับของครบแล้ว)</span>
            </div>
            <p className="text-slate-300 text-xs">
              {request.to_location?.name} ยืนยันรับของเรียบร้อยเมื่อ {formatDateTime(request.received_at)} โดย <strong className="text-white">{request.receiver_staff_name || request.received_by_profile?.full_name || 'ผู้รับ'}</strong>
            </p>
            {/* 1-Click Send Back Button */}
            <div className="pt-2 border-t border-emerald-500/20">
              <button
                type="button"
                onClick={() => {
                  const appNoParam = request.app_no ? `&app_no=${encodeURIComponent(request.app_no)}` : ''
                  const nameParam = `&name=${encodeURIComponent(items[0]?.name || request.terminal_name)}`
                  navigate(`/requests/new?from=${request.to_location_id}&to=${request.from_location_id}${appNoParam}${nameParam}`)
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/25 active:scale-95 transition-all"
              >
                <ArrowRightLeft size={14} />
                <span>🔄 ส่งของชิ้นนี้กลับไปที่ {request.from_location?.name || 'ไซต์เดิม'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Panels */}
      {showAction === 'confirm' && (
        <ActionPanel title="ยืนยันคำขอ" onConfirm={handleConfirmRequest} confirmLabel="ยืนยันคำขอ" confirmVariant="primary">
          <p className="text-slate-400 text-sm">คุณต้องการยืนยันรายการนี้และเริ่มเตรียมของใช่ไหม?</p>
        </ActionPanel>
      )}

      {showAction === 'ready' && (
        <ActionPanel title="เตรียมของเสร็จ" onConfirm={handleReadyToSend} confirmLabel="ยืนยันพร้อมฝาก" confirmVariant="primary">
          <PhotoUploader
            stage="pre_deposit"
            requestId={request.id}
            photos={actionPhotos}
            onPhotosChange={setActionPhotos}
            label="ถ่ายรูปก่อนฝากของ (ไม่บังคับ)"
            maxPhotos={5}
          />
        </ActionPanel>
      )}

      {showAction === 'deposit' && (
        <ActionPanel
          title={`🚚 ยืนยันฝากของไปกับรถแล้ว (ส่งให้ ${request.to_location?.name})`}
          onConfirm={handleDeposit}
          confirmLabel="บันทึกการฝากของ (บันทึกเวลาปัจจุบัน)"
          confirmVariant="primary"
          isLoading={isDepositing}
        >
          <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/30 text-xs text-blue-200 space-y-1">
            <p className="font-bold text-white">⚡ ระบบจะบันทึกวันและเวลาปัจจุบันอัตโนมัติ</p>
            <p className="text-slate-300">
              ผู้บันทึก: <strong className="text-white">{profile?.full_name}</strong> · สถานะจะเปลี่ยนเป็น "รอ {request.to_location?.name} รับของ"
            </p>
          </div>
          <PhotoUploader
            stage="deposit"
            requestId={request.id}
            photos={actionPhotos}
            onPhotosChange={setActionPhotos}
            label="ถ่ายรูปตอนฝากของขึ้นรถ (ไม่บังคับ)"
            maxPhotos={5}
          />
          <textarea
            value={actionNotes}
            onChange={e => setActionNotes(e.target.value)}
            placeholder="หมายเหตุการฝากของ (ถ้ามี)..."
            rows={2}
            className="input-field resize-none mt-2 text-xs"
          />
        </ActionPanel>
      )}

      {showAction === 'receive' && (
        <ActionPanel
          title={`✅ ${request.to_location?.name || 'ผู้รับ'} กดยืนยันรับของ (ปิดงาน)`}
          onConfirm={() => handleConfirmReceipt(false)}
          confirmLabel="ได้รับของครบแล้ว (ปิดงาน) ✓"
          confirmVariant="success"
          secondaryLabel="แจ้งปัญหา / รับไม่ครบ"
          onSecondary={() => handleConfirmReceipt(true)}
        >
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-200 space-y-2">
            <p className="font-bold text-white flex items-center justify-between">
              <span>⚡ ลงชื่อรับของจริง</span>
              <span className="text-[10px] text-emerald-300 font-normal">(บันทึกวันเวลาอัตโนมัติ)</span>
            </p>
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <User size={13} className="text-emerald-400" />
                  <span>ชื่อผู้ลงชื่อรับของ:</span>
                </label>
                <div className="flex items-center gap-1.5">
                  {receiverStaffInput && (
                    <button
                      type="button"
                      onClick={() => setReceiverStaffInput('')}
                      className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/20 flex items-center gap-1 active:scale-95 transition-all"
                    >
                      <X size={11} /> ล้างชื่อ
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsAddingReceiverStaff(!isAddingReceiverStaff)}
                    className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 flex items-center gap-1 active:scale-95 transition-all"
                  >
                    <Plus size={11} /> เพิ่มชื่อ
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={receiverStaffInput}
                  onChange={e => setReceiverStaffInput(e.target.value)}
                  placeholder="พิมพ์ชื่อผู้รับของ หรือแตะเลือกชื่อด้านล่าง..."
                  className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-emerald-400 text-white font-bold rounded-xl px-3.5 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none transition-all pr-8"
                />
                {receiverStaffInput && (
                  <button
                    type="button"
                    onClick={() => setReceiverStaffInput('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-slate-800"
                    title="ล้างชื่อ"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Quick Receiver Pills - Identical style to Sender Staff */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {profile?.full_name && !staffOptions.includes(profile.full_name) && (
                  <button
                    type="button"
                    onClick={() => setReceiverStaffInput(profile.full_name)}
                    className={cn(
                      'text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all active:scale-95 flex items-center gap-1',
                      receiverStaffInput === profile.full_name
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                        : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:text-white'
                    )}
                  >
                    <span>👤</span>
                    <span>{profile.full_name}</span>
                    <span className="text-[9px] opacity-70">(ฉัน)</span>
                  </button>
                )}
                {staffOptions.map(name => (
                  <button
                    key={`recv-${name}`}
                    type="button"
                    onClick={() => setReceiverStaffInput(name)}
                    className={cn(
                      'text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all active:scale-95',
                      receiverStaffInput === name
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                        : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white'
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>

              {/* Inline Add Staff Box */}
              {isAddingReceiverStaff && (
                <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 space-y-2 mt-2">
                  <p className="text-[11px] font-semibold text-emerald-300">เพิ่มชื่อพนักงานใหม่:</p>
                  <div className="flex items-center gap-2">
                    <input
                      value={newReceiverStaffName}
                      onChange={e => setNewReceiverStaffName(e.target.value)}
                      placeholder="เช่น ช่าง A, น้องบี..."
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const clean = newReceiverStaffName.trim()
                        if (clean) {
                          await addOption('staff', clean)
                          setReceiverStaffInput(clean)
                          setNewReceiverStaffName('')
                          setIsAddingReceiverStaff(false)
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-all"
                    >
                      บันทึก
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingReceiverStaff(false)
                        setNewReceiverStaffName('')
                      }}
                      className="text-slate-400 hover:text-white text-xs px-2"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <PhotoUploader
            stage="receipt"
            requestId={request.id}
            photos={actionPhotos}
            onPhotosChange={setActionPhotos}
            label="ถ่ายรูปตอนรับของ (ไม่บังคับ)"
            maxPhotos={5}
          />
          <div className="mt-2">
            <p className="text-xs font-semibold text-slate-300 mb-1.5">จำนวนที่ส่งมา:</p>
            <div className="space-y-1.5">
              {items.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between bg-slate-900/60 rounded-xl p-2.5 border border-slate-700/60 text-xs">
                  <div>
                    <p className="text-white font-bold">{item.name}</p>
                    <p className="text-slate-400">ส่งมา {formatQuantity(item.quantity_sent)} {item.unit}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-[11px]">รับได้:</span>
                    <input
                      type="number"
                      min="0"
                      max={item.quantity_sent}
                      step="any"
                      defaultValue={item.quantity_sent}
                      onChange={e => setReceiptQtys(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                      className="w-16 input-field py-1 text-center font-bold text-emerald-400 text-xs"
                    />
                    <span className="text-slate-400 text-[11px]">{item.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <textarea
            value={actionNotes}
            onChange={e => setActionNotes(e.target.value)}
            placeholder="หมายเหตุการรับของ (ถ้ามี)..."
            rows={2}
            className="input-field resize-none mt-2 text-xs"
          />
          <div className="mt-2">
            <p className="text-xs font-medium text-slate-400 mb-1">ประเภทปัญหา (กรณีแตะแจ้งปัญหา)</p>
            <select value={problemType} onChange={e => setProblemType(e.target.value)} className="input-field text-xs">
              <option value="incomplete">รับไม่ครบ</option>
              <option value="wrong_item">ของผิด</option>
              <option value="damaged">ของเสียหาย</option>
              <option value="other">ปัญหาอื่น</option>
            </select>
          </div>
        </ActionPanel>
      )}

      {showAction === 'return_deposit' && (
        <ActionPanel
          title="ฝากของคืนแล้ว"
          onConfirm={handleReturnDeposit}
          confirmLabel="บันทึกการฝากคืน"
          confirmVariant="primary"
        >
          <PhotoUploader
            stage="pre_return"
            requestId={request.id}
            photos={actionPhotos}
            onPhotosChange={setActionPhotos}
            label="ถ่ายรูปก่อนส่งคืน"
            maxPhotos={5}
          />
          <textarea
            value={actionNotes}
            onChange={e => setActionNotes(e.target.value)}
            placeholder="หมายเหตุ..."
            rows={2}
            className="input-field resize-none mt-3"
          />
        </ActionPanel>
      )}

      {showAction === 'confirm_return' && (
        <ActionPanel
          title="ยืนยันรับคืน"
          onConfirm={handleConfirmReturn}
          confirmLabel="ยืนยันรับคืน ✓"
          confirmVariant="success"
        >
          <PhotoUploader
            stage="return_receipt"
            requestId={request.id}
            photos={actionPhotos}
            onPhotosChange={setActionPhotos}
            label="ถ่ายรูปตอนรับคืน"
            maxPhotos={5}
          />
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-400 mb-2">ยืนยันจำนวนที่รับคืน</p>
            <div className="space-y-2">
              {items.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 bg-slate-900/50 rounded-xl p-3">
                  <div className="flex-1">
                    <p className="text-sm text-white">{item.name}</p>
                    <p className="text-xs text-slate-500">ค้างคืน {formatQuantity(item.quantity_received - item.quantity_returned)} {item.unit}</p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={item.quantity_received - item.quantity_returned}
                    step="0.01"
                    defaultValue={item.quantity_received - item.quantity_returned}
                    onChange={e => setReceiptQtys(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                    className="w-20 input-field text-center"
                  />
                </div>
              ))}
            </div>
          </div>
          <textarea
            value={actionNotes}
            onChange={e => setActionNotes(e.target.value)}
            placeholder="หมายเหตุ..."
            rows={2}
            className="input-field resize-none mt-3"
          />
        </ActionPanel>
      )}

      {/* Cancel button */}
      {canCancel && (
        <button
          onClick={handleCancel}
          className="w-full py-3 rounded-2xl text-red-400 text-sm font-medium bg-red-500/5 border border-red-500/20 hover:bg-red-500/10 transition-all active:scale-95"
        >
          ยกเลิกรายการ
        </button>
      )}

      {/* Timeline */}
      <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4">
        <button
          onClick={() => setShowTimeline(!showTimeline)}
          className="w-full flex items-center justify-between text-sm font-semibold text-slate-300"
        >
          <span>ประวัติสถานะ ({history.length})</span>
          {showTimeline ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showTimeline && (
          <div className="mt-4 relative pl-10">
            <div className="timeline-line" />
            <div className="space-y-4">
              {history.map((h: any, idx: number) => (
                <div key={h.id} className="relative">
                  <div className={cn(
                    'absolute -left-7 w-5 h-5 rounded-full border-2 flex items-center justify-center',
                    idx === 0 ? 'bg-blue-500 border-blue-400' : 'bg-slate-700 border-slate-600'
                  )}>
                    {idx === 0 && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{STATUS_LABELS[h.to_status] ?? h.to_status}</p>
                      {h.notes && <p className="text-xs text-slate-500 mt-0.5">{h.notes}</p>}
                      <p className="text-xs text-slate-600 mt-1">
                        {h.changer?.full_name ?? '-'} · {formatDateTime(h.changed_at)}
                      </p>
                    </div>
                    {profile?.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => handleAdminDeleteHistoryItem(h.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="ลบบันทึกประวัตินี้ (Admin)"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="ขยายรูป" className="max-w-full max-h-full object-contain rounded-xl" />
          <button
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white"
            onClick={() => setLightboxUrl(null)}
          >
            <X size={20} />
          </button>
        </div>
      )}

      <div className="h-4" />
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  const icons: Record<string, React.ElementType> = {
    pending_confirm: Clock,
    preparing: Package,
    ready_to_send: Package,
    in_transit: Truck,
    partially_received: AlertTriangle,
    completed: CheckCircle,
    problem_reported: AlertCircle,
    returning: RotateCcw,
    return_in_transit: Truck,
    partially_returned: AlertTriangle,
    return_completed: CheckCircle,
    cancelled: X,
  }
  const Icon = icons[status] ?? Package
  return <Icon size={20} />
}

interface ActionDef {
  id: string
  label: string
  icon: React.ElementType
  variant: 'primary' | 'success' | 'warning' | 'danger' | 'default'
}

function getAvailableActions(
  status: string,
  type: string,
  isSender: boolean,
  isReceiver: boolean,
  isAdmin: boolean,
  toLocationName?: string
): ActionDef[] {
  const actions: ActionDef[] = []

  // Step 2: ฝากของไปกับรถแล้ว (ผู้ส่งต้นทาง หรือ Admin เป็นคนกด)
  if (['ready_to_send', 'pending_confirm', 'preparing'].includes(status)) {
    if (isSender || isAdmin) {
      actions.push({ id: 'deposit', label: '🚚 กด “ฝากของไปกับรถแล้ว”', icon: Truck, variant: 'primary' })
    }
  }
  // Step 4: ผู้รับกดยืนยัน (ผู้รับปลายทาง หรือ Admin เป็นคนกด)
  else if (['in_transit', 'partially_received'].includes(status)) {
    if (isReceiver || isAdmin) {
      const targetLabel = toLocationName ? `${toLocationName} กดยืนยันรับของ` : 'ผู้รับกดยืนยันรับของ'
      actions.push({ id: 'receive', label: `✅ ${targetLabel} (ปิดงาน)`, icon: CheckCircle, variant: 'success' })
    }
  }
  // Loan Return Flow (if loan)
  else if (status === 'completed') {
    if (type === 'loan' && (isReceiver || isAdmin)) {
      actions.push({ id: 'return_deposit', label: 'เริ่มส่งคืนเครื่องมือ', icon: RotateCcw, variant: 'primary' })
    }
  }
  else if (['returning', 'return_in_transit', 'partially_returned'].includes(status)) {
    if (isSender || isAdmin) {
      actions.push({ id: 'confirm_return', label: 'ยืนยันรับคืน', icon: CheckCircle, variant: 'success' })
    }
  }
  return actions
}

interface ActionPanelProps {
  title: string
  onConfirm: () => void
  confirmLabel: string
  confirmVariant?: 'primary' | 'success'
  secondaryLabel?: string
  onSecondary?: () => void
  isLoading?: boolean
  children?: React.ReactNode
}

function ActionPanel({
  title, onConfirm, confirmLabel, confirmVariant = 'primary',
  secondaryLabel, onSecondary, isLoading, children
}: ActionPanelProps) {
  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 space-y-4">
      <h3 className="text-sm font-bold text-white">{title}</h3>
      {children}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className={cn(
            'flex-1 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50',
            confirmVariant === 'success'
              ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
          )}
        >
          {isLoading ? 'กำลังบันทึก...' : confirmLabel}
        </button>
        {secondaryLabel && onSecondary && (
          <button
            onClick={onSecondary}
            className="flex-1 py-3 rounded-2xl font-bold text-sm bg-orange-500/20 border border-orange-500/30 text-orange-400 transition-all active:scale-95"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  )
}
