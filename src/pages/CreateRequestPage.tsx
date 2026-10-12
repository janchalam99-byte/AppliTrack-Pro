import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { 
  ChevronLeft, Save, Package, ArrowRightLeft, 
  Search, Check, Sparkles, User, Tag, HardDrive, Plus, X, 
  Truck, ArrowRight, MapPin, Layers, Hash
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useAppStore } from '../store/appStore'
import { useQuickOptions } from '../hooks/useQuickOptions'
import PhotoUploader, { type UploadedPhoto } from '../components/PhotoUploader'
import { cn } from '../lib/utils'
import { 
  searchApplicators, 
  type ApplicatorItem 
} from '../data/applicatorMaster'
import { uploadEvidencePhoto } from '../lib/photoUpload'
import toast from 'react-hot-toast'

const formSchema = z.object({
  type: z.enum(['transfer', 'loan']),
  terminal_name: z.string().min(1, 'กรุณาระบุชื่อสิ่งของหรือรายการที่ส่ง'),
  app_no: z.string().optional(),
  quantity: z.coerce.number().min(0.01, 'กรุณาระบุจำนวนที่มากกว่า 0'),
  unit: z.string().min(1, 'กรุณาระบุหน่วยนับ'),
  from_location_id: z.string().min(1, 'กรุณาเลือกสถานที่ต้นทาง'),
  to_location_id: z.string().min(1, 'กรุณาเลือกสถานที่ปลายทาง'),
  sender_staff_name: z.string().min(1, 'กรุณาระบุชื่อผู้ส่ง'),
  receiver_staff_name: z.string().min(1, 'กรุณาระบุชื่อผู้รับปลายทาง (ส่งให้ใคร)'),
  deposit_immediately: z.boolean(),
  remark_base: z.string().optional(),
  notes: z.string().optional(),
  due_date: z.string().optional(),
  loan_due_date: z.string().optional(),
}).refine(d => d.from_location_id !== d.to_location_id, {
  message: 'สถานที่ต้นทางและปลายทางต้องไม่เหมือนกัน',
  path: ['to_location_id'],
})

type FormData = z.infer<typeof formSchema>

const COMMON_UNITS = ['ชุด', 'ชิ้น', 'กล่อง', 'อัน', 'ม้วน', 'แพ็ค']

export default function CreateRequestPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const locations = useAppStore((s) => s.locations)
  const [photos, setPhotos] = useState<UploadedPhoto[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Dynamic quick options (Staff & Remarks)
  const { staffOptions, remarkOptions, addOption, removeOption } = useQuickOptions()
  const [isAddingStaff, setIsAddingStaff] = useState(false)
  const [newStaffName, setNewStaffName] = useState('')
  const [isManagingStaff, setIsManagingStaff] = useState(false)

  const [isAddingRemark, setIsAddingRemark] = useState(false)
  const [newRemarkText, setNewRemarkText] = useState('')
  const [isManagingRemark, setIsManagingRemark] = useState(false)

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<ApplicatorItem[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchBoxRef = useRef<HTMLDivElement>(null)

  // Location finding: Match HET-1 and HET-2
  const het1 = locations.find(l => l.name.toUpperCase().includes('1') || l.name.toUpperCase().includes('HET-1'))
  const het2 = locations.find(l => l.name.toUpperCase().includes('2') || l.name.toUpperCase().includes('HET-2'))

  // Default from & to based on current logged-in profile:
  // HET 1 sends -> HET 2 receives; HET 2 sends -> HET 1 receives
  const isUserHet2 = profile?.email?.includes('2') || (het2 && profile?.home_location_id === het2.id)
  const defaultFromId = isUserHet2 ? (het2?.id || locations[0]?.id || '') : (het1?.id || locations[0]?.id || '')
  const defaultToId = isUserHet2 ? (het1?.id || locations[1]?.id || '') : (het2?.id || locations[1]?.id || '')

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: 'transfer',
      terminal_name: '',
      app_no: '',
      quantity: 1,
      unit: 'ชุด',
      from_location_id: defaultFromId,
      to_location_id: defaultToId,
      sender_staff_name: profile?.full_name || '',
      receiver_staff_name: '',
      deposit_immediately: false,
      remark_base: 'พร้อมฐาน App',
      notes: '',
    },
  })

  const watchType = watch('type')
  const watchFromId = watch('from_location_id')
  const watchToId = watch('to_location_id')
  const watchAppNo = watch('app_no')
  const watchTerminalName = watch('terminal_name')
  const watchSenderStaff = watch('sender_staff_name')
  const watchReceiverStaff = watch('receiver_staff_name')
  const watchRemarkBase = watch('remark_base')
  const watchUnit = watch('unit')
  const watchDepositImmediately = watch('deposit_immediately')

  // Automatically sync initial location defaults when locations or profile load
  useEffect(() => {
    if (locations.length >= 2) {
      const h1 = locations.find(l => l.name.toUpperCase().includes('1') || l.name.toUpperCase().includes('HET-1'))
      const h2 = locations.find(l => l.name.toUpperCase().includes('2') || l.name.toUpperCase().includes('HET-2'))
      const userAtHet2 = profile?.email?.includes('2') || (h2 && profile?.home_location_id === h2.id)
      
      const targetFrom = userAtHet2 ? (h2?.id || locations[0]?.id) : (h1?.id || locations[0]?.id)
      const targetTo = userAtHet2 ? (h1?.id || locations[1]?.id) : (h2?.id || locations[1]?.id)
      
      if (targetFrom && !watchFromId) setValue('from_location_id', targetFrom)
      if (targetTo && !watchToId) setValue('to_location_id', targetTo)
    }
  }, [locations, profile, setValue, watchFromId, watchToId])

  // Route helper functions (HET 1 sends -> HET 2 receives; HET 2 sends -> HET 1 receives)
  const handleSelectRoute = (route: '1_to_2' | '2_to_1') => {
    if (het1 && het2) {
      if (route === '1_to_2') {
        setValue('from_location_id', het1.id)
        setValue('to_location_id', het2.id)
      } else {
        setValue('from_location_id', het2.id)
        setValue('to_location_id', het1.id)
      }
    }
  }

  const handleFromLocationChange = (newFromId: string) => {
    setValue('from_location_id', newFromId)
    if (het1 && het2) {
      if (newFromId === het1.id) {
        setValue('to_location_id', het2.id)
      } else if (newFromId === het2.id) {
        setValue('to_location_id', het1.id)
      }
    }
  }

  const handleToLocationChange = (newToId: string) => {
    setValue('to_location_id', newToId)
    if (het1 && het2) {
      if (newToId === het1.id) {
        setValue('from_location_id', het2.id)
      } else if (newToId === het2.id) {
        setValue('from_location_id', het1.id)
      }
    }
  }

  // Handle outside click for suggestions dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const [isSavingToMaster, setIsSavingToMaster] = useState(false)

  // Auto-search suggestions when typing app_no or terminal_name
  const handleAppSearch = async (val: string) => {
    setValue('app_no', val)
    const clean = val.trim()
    if (clean.length >= 1) {
      const localResults = searchApplicators(clean, 8)
      setSuggestions(localResults)
      setShowSuggestions(true)

      try {
        const { data } = await supabase
          .from('applicator_master')
          .select('*')
          .or(`app_no.ilike.%${clean}%,terminal_name.ilike.%${clean}%`)
          .limit(10)

        if (data && data.length > 0) {
          const mapped: ApplicatorItem[] = data.map(d => ({
            appNo: d.app_no || '',
            terminalName: d.terminal_name,
            maker: d.maker || undefined,
            terMaker: d.ter_maker || undefined,
            model: d.model || undefined,
            serial: d.serial || undefined,
            location: d.base_location || undefined,
          }))
          const seen = new Set<string>()
          const combined: ApplicatorItem[] = []
          for (const item of [...mapped, ...localResults]) {
            const key = `${item.appNo}_${item.terminalName}`.toUpperCase()
            if (!seen.has(key)) {
              seen.add(key)
              combined.push(item)
            }
          }
          setSuggestions(combined.slice(0, 10))
          setShowSuggestions(true)
        }
      } catch {
        // Keep local results if network error
      }
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }

  // Quick save to master from create form
  const handleQuickSaveToMaster = async () => {
    const appNo = watchAppNo?.trim() || ''
    const term = watchTerminalName?.trim() || ''
    if (!term && !appNo) {
      toast.error('กรุณาระบุ App No หรือชื่อสิ่งของก่อนบันทึกเข้า Master')
      return
    }
    setIsSavingToMaster(true)
    try {
      const fromLoc = locations.find(l => l.id === watchFromId)?.name || 'HET-1'
      const { error } = await supabase.from('applicator_master').insert({
        app_no: appNo || null,
        terminal_name: term || appNo,
        base_location: fromLoc,
      })
      if (error) throw error
      toast.success(`บันทึก ${appNo || term} เข้า Master เรียบร้อย!`, { icon: '💾' })
      setShowSuggestions(false)
    } catch (err: any) {
      toast.error(`ไม่สามารถบันทึกเข้า Master: ${err.message}`)
    } finally {
      setIsSavingToMaster(false)
    }
  }

  const handleSelectApplicator = (item: ApplicatorItem) => {
    setValue('app_no', item.appNo)
    setValue('terminal_name', item.terminalName)
    setShowSuggestions(false)
    toast.success(`เลือก ${item.appNo} (${item.terminalName})`, { duration: 1500, icon: '⚡' })
  }

  // Swap direction (HET-1 <-> HET-2)
  const handleSwapLocations = () => {
    setValue('from_location_id', watchToId)
    setValue('to_location_id', watchFromId)
  }

  const generateRequestNumber = async (type: string): Promise<string> => {
    try {
      const { data } = await supabase.rpc('generate_request_number', { req_type: type })
      return data ?? `TR-${Date.now()}`
    } catch {
      return `TR-${Date.now()}`
    }
  }

  const onSubmit = async (data: FormData) => {
    if (!profile) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('ขณะนี้ไม่มีสัญญาณอินเทอร์เน็ต กรุณารอเชื่อมต่อเน็ตก่อนบันทึกรายการ', { icon: '📡' })
      return
    }
    setIsSubmitting(true)

    try {
      const pendingUploads = photos.filter(p => p.status === 'uploading')
      if (pendingUploads.length > 0) {
        toast.error('กรุณารอให้รูปภาพอัปโหลดเสร็จก่อน')
        setIsSubmitting(false)
        return
      }

      const requestNumber = await generateRequestNumber(data.type)
      const cleanAppNo = data.app_no?.trim() || ''
      const cleanTerminal = data.terminal_name.trim()
      const title = cleanAppNo ? `${cleanAppNo} - ${cleanTerminal}` : cleanTerminal
      const now = new Date().toISOString()
      const isDeposited = Boolean(data.deposit_immediately)

      const fromLoc = locations.find(l => l.id === data.from_location_id)
      const toLoc = locations.find(l => l.id === data.to_location_id)

      // Create transfer request
      const { data: request, error: reqError } = await supabase
        .from('transfer_requests')
        .insert({
          request_number: requestNumber,
          type: data.type,
          status: isDeposited ? 'in_transit' : 'ready_to_send',
          title: title,
          app_no: cleanAppNo || null,
          terminal_name: cleanTerminal,
          sender_staff_name: data.sender_staff_name.trim(),
          receiver_staff_name: data.receiver_staff_name.trim(),
          remark_base: data.remark_base?.trim() || null,
          notes: data.notes || null,
          from_location_id: data.from_location_id,
          to_location_id: data.to_location_id,
          requester_id: profile.id,
          deposited_at: isDeposited ? now : null,
          deposited_recorded_at: isDeposited ? now : null,
          deposited_by: isDeposited ? profile.id : null,
          is_deposit_backdated: false,
          due_date: data.due_date || null,
          loan_due_date: data.type === 'loan' ? (data.loan_due_date || null) : null,
        })
        .select()
        .single()

      if (reqError) throw reqError

      // Create item row with custom quantity & unit
      const { error: itemError } = await supabase
        .from('transfer_request_items')
        .insert({
          request_id: request.id,
          name: cleanAppNo || cleanTerminal,
          description: cleanTerminal,
          quantity_sent: data.quantity,
          quantity_received: 0,
          unit: data.unit || 'ชุด',
          sort_order: 0,
          notes: data.remark_base || null,
        })

      if (itemError) throw itemError

      // Record initial status history
      const historyNotes = isDeposited
        ? `สร้างรายการและฝากของไปกับรถแล้ว (ผู้ส่ง: ${data.sender_staff_name} → ผู้รับ: ${data.receiver_staff_name})`
        : `สร้างรายการ: ${title} จำนวน ${data.quantity} ${data.unit} (ผู้ส่ง: ${data.sender_staff_name} → ผู้รับ: ${data.receiver_staff_name}) [รอฝากไปกับรถ]`

      await supabase.from('status_history').insert({
        request_id: request.id,
        from_status: null,
        to_status: isDeposited ? 'in_transit' : 'ready_to_send',
        changed_by: profile.id,
        notes: historyNotes,
      })

      // Upload photos
      const pendingPhotos = photos.filter(p => p.file)
      if (pendingPhotos.length > 0) {
        for (const p of pendingPhotos) {
          if (p.file) {
            await uploadEvidencePhoto({
              file: p.file,
              requestId: request.id,
              requestNumber: cleanAppNo || requestNumber,
              stage: isDeposited ? 'deposit' : 'item_creation',
              userId: profile.id,
            })
          }
        }
      }

      // Notify recipient plant
      const { data: others } = await supabase
        .from('profiles')
        .select('id')
        .neq('id', profile.id)
        .eq('is_active', true)

      if (others && others.length > 0) {
        await supabase.from('notifications').insert(
          others.map(p => ({
            recipient_id: p.id,
            request_id: request.id,
            type: isDeposited ? 'deposited' : 'new_request',
            title: isDeposited ? '🚚 ฝากของไปกับรถแล้ว (รอรับ)' : '📦 มีรายการส่งของใหม่',
            message: `${fromLoc?.name || 'ต้นทาง'} ส่งของให้ ${data.receiver_staff_name} (${toLoc?.name || 'ปลายทาง'})`,
            is_read: false,
          }))
        )
      }

      if (isDeposited) {
        toast.success(`ฝากของไปกับรถแล้ว! รอ ${toLoc?.name || 'ปลายทาง'} รับของ`, { duration: 3000, icon: '🚚' })
      } else {
        toast.success(`บันทึกรายการเรียบร้อย! รอฝากไปกับรถ`, { duration: 2500, icon: '✅' })
      }

      navigate(`/requests/${request.id}`)
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาด: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const fromLocation = locations.find(l => l.id === watchFromId)
  const toLocation = locations.find(l => l.id === watchToId)

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-24 font-sans">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors touch-feedback"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <span>สร้างรายการรับ-ส่งของ</span>
            <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold">
              4 ขั้นตอน
            </span>
          </h1>
          <p className="text-slate-400 text-xs">ระบุของ, จำนวน, เส้นทาง และผู้รับปลายทาง</p>
        </div>
      </div>

      {/* 4-Step Process Guide Banner */}
      <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-3.5 text-xs space-y-2 backdrop-blur-md">
        <p className="font-bold text-slate-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles size={13} className="text-cyan-400" />
          <span>ขั้นตอนการทำงานระบบรับ-ส่ง:</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300">
            <span className="font-bold block text-blue-400">1. สร้างรายการ</span>
            ระบุของ, จำนวน, ส่งให้ใคร
          </div>
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
            <span className="font-bold block text-cyan-400">2. ฝากของขึ้นรถ</span>
            กดปุ่มฝาก บันทึกเวลาอัตโนมัติ
          </div>
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
            <span className="font-bold block text-amber-400">3. รอปลายทางรับ</span>
            ค้างอยู่ในระบบรอคนรับ
          </div>
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
            <span className="font-bold block text-emerald-400">4. ผู้รับกดยืนยัน</span>
            บันทึกเวลารับจริง & ปิดงาน
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Type Selection (ส่งของ vs ยืมของ) */}
        <div className="grid grid-cols-2 gap-3 bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800">
          <button
            type="button"
            onClick={() => setValue('type', 'transfer')}
            className={cn(
              'py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all',
              watchType === 'transfer'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                : 'text-slate-400 hover:text-white'
            )}
          >
            <Package size={14} />
            <span>ฝาก/ส่งของปกติ</span>
          </button>
          <button
            type="button"
            onClick={() => setValue('type', 'loan')}
            className={cn(
              'py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all',
              watchType === 'loan'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                : 'text-slate-400 hover:text-white'
            )}
          >
            <Layers size={14} />
            <span>ยืม-คืนเครื่องมือ (Loan)</span>
          </button>
        </div>

        {/* STEP 1: ของอะไร & จำนวนเท่าไร */}
        <div className={cn(
          "bg-slate-900/75 border border-white/10 rounded-2xl p-4 space-y-4 shadow-lg backdrop-blur-md relative transition-all",
          showSuggestions && suggestions.length > 0 ? "z-40" : "z-20"
        )}>
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
            <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-xs font-bold">1</span>
            <h2 className="text-sm font-bold text-white">ระบุสิ่งของ & จำนวนที่ส่ง</h2>
          </div>

          {/* Item Name / Terminal Name (Required) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-300">
                ของอะไร (ชื่อสิ่งของ / Terminal Name / Part No.) <span className="text-rose-400">*</span>
              </label>
              {Boolean(watchTerminalName?.trim() && !isSavingToMaster) && (
                <button
                  type="button"
                  onClick={handleQuickSaveToMaster}
                  className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-0.5 rounded-lg border border-blue-500/20 transition-all"
                  title="บันทึกเข้าฐานข้อมูล Master ทันที"
                >
                  <Plus size={11} />
                  บันทึกเข้า Master
                </button>
              )}
            </div>
            <input
              {...register('terminal_name')}
              placeholder="เช่น Applicator เบอร์..., สายไฟ, กล่องอะไหล่, อุปกรณ์..."
              className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-cyan-400 text-white rounded-xl px-3.5 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none transition-all"
            />
            {errors.terminal_name && (
              <p className="text-rose-400 text-xs">{errors.terminal_name.message}</p>
            )}
          </div>

          {/* Quantity & Unit */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1">
                <Hash size={13} className="text-cyan-400" />
                <span>จำนวนเท่าไร</span> <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                {...register('quantity')}
                placeholder="ระบุจำนวน เช่น 1, 2, 5"
                className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-cyan-400 text-white rounded-xl px-3.5 py-2.5 text-sm font-bold placeholder:text-slate-500 focus:outline-none transition-all"
              />
              {errors.quantity && (
                <p className="text-rose-400 text-xs">{errors.quantity.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                หน่วยนับ <span className="text-rose-400">*</span>
              </label>
              <input
                {...register('unit')}
                placeholder="เช่น ชุด, ชิ้น, กล่อง"
                className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-cyan-400 text-white rounded-xl px-3.5 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none transition-all"
              />
              {/* Quick Unit Pills */}
              <div className="flex flex-wrap gap-1 pt-1">
                {COMMON_UNITS.map(u => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setValue('unit', u)}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-md border transition-all',
                      watchUnit === u
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold'
                        : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white'
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Optional App No. with Instant Search */}
          <div ref={searchBoxRef} className="space-y-1.5 relative pt-1 border-t border-slate-800/80 z-30">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Search size={12} className="text-blue-400" />
                <span>รหัส APP NO. (กรณีเป็น Applicator / มีระบบค้นหาด่วน)</span>
              </label>
              {watchAppNo && (
                <button
                  type="button"
                  onClick={() => { setValue('app_no', ''); setShowSuggestions(false); }}
                  className="text-[10px] text-slate-500 hover:text-slate-300"
                >
                  ล้าง
                </button>
              )}
            </div>
            <input
              value={watchAppNo || ''}
              onChange={(e) => handleAppSearch(e.target.value)}
              placeholder="พิมพ์ค้นหา เช่น TW-208, 1234... (ไม่ระบุก็ได้)"
              className="w-full bg-slate-950/60 border border-slate-800 focus:border-blue-500 text-white font-mono rounded-xl px-3.5 py-2 text-xs placeholder:text-slate-600 focus:outline-none transition-all"
            />

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-[#0f172a] border border-cyan-500/50 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.95)] overflow-hidden max-h-60 overflow-y-auto divide-y divide-slate-800 ring-1 ring-white/15">
                {suggestions.map((item, idx) => (
                  <div
                    key={`${item.appNo}-${item.terminalName}-${idx}`}
                    onClick={() => handleSelectApplicator(item)}
                    className="p-3 hover:bg-slate-800/90 cursor-pointer transition-colors flex items-center justify-between text-left group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-cyan-300 bg-cyan-950/70 px-2 py-0.5 rounded border border-cyan-500/30">
                          {item.appNo}
                        </span>
                        {item.baseLocation && (
                          <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                            📍 {item.baseLocation}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white group-hover:text-cyan-200 mt-1 font-medium">{item.terminalName}</p>
                    </div>
                    <span className="text-[10px] font-bold text-cyan-400 group-hover:text-white bg-cyan-500/10 group-hover:bg-cyan-500 px-2.5 py-1 rounded-lg border border-cyan-500/30 transition-all">
                      เลือก
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* STEP 2: ส่งจากที่ไหน ไปที่ไหน (HET 1 ส่ง HET 2 รับ | HET 2 ส่ง HET 1 รับ) */}
        <div className="bg-slate-900/75 border border-white/10 rounded-2xl p-4 space-y-3.5 shadow-lg backdrop-blur-md relative z-10">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <h2 className="text-sm font-bold text-white">เส้นทางข้ามโรงงาน (HET-1 ⇄ HET-2)</h2>
                <p className="text-[11px] text-slate-400">ระบุต้นทางและปลายทางที่ต้องรับของ</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSwapLocations}
              className="flex items-center gap-1 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-2.5 py-1 rounded-lg border border-cyan-500/20 transition-all active:scale-95"
            >
              <ArrowRightLeft size={13} />
              <span>สลับทิศทาง</span>
            </button>
          </div>

          {/* Quick Route Selector Buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleSelectRoute('1_to_2')}
              className={cn(
                "p-3 rounded-xl border text-left transition-all active:scale-[0.98]",
                watchFromId === het1?.id && watchToId === het2?.id
                  ? "bg-gradient-to-br from-blue-950/80 to-cyan-950/50 border-cyan-400/80 shadow-lg shadow-cyan-500/20"
                  : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-cyan-400">ทิศทาง A</span>
                {watchFromId === het1?.id && watchToId === het2?.id && (
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                )}
              </div>
              <p className="font-extrabold text-xs text-white flex items-center gap-1.5">
                <span>🏭 HET-1</span>
                <ArrowRight size={13} className="text-cyan-400" />
                <span>🏭 HET-2</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                HET-1 ส่งของ ➔ <strong className="text-emerald-300">HET-2 รับ</strong>
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleSelectRoute('2_to_1')}
              className={cn(
                "p-3 rounded-xl border text-left transition-all active:scale-[0.98]",
                watchFromId === het2?.id && watchToId === het1?.id
                  ? "bg-gradient-to-br from-purple-950/80 to-indigo-950/50 border-purple-400/80 shadow-lg shadow-purple-500/20"
                  : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-purple-400">ทิศทาง B</span>
                {watchFromId === het2?.id && watchToId === het1?.id && (
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                )}
              </div>
              <p className="font-extrabold text-xs text-white flex items-center gap-1.5">
                <span>🏭 HET-2</span>
                <ArrowRight size={13} className="text-purple-400" />
                <span>🏭 HET-1</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                HET-2 ส่งของ ➔ <strong className="text-emerald-300">HET-1 รับ</strong>
              </p>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center pt-1">
            {/* Origin Location */}
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
              <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                <MapPin size={11} className="text-cyan-400" />
                <span>ต้นทาง (คนกดส่ง/ฝากของ)</span>
              </p>
              <select
                value={watchFromId}
                onChange={(e) => handleFromLocationChange(e.target.value)}
                className="w-full bg-slate-900 text-white text-sm font-bold rounded-lg p-2 border border-slate-700 focus:outline-none focus:border-cyan-400"
              >
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* Destination Location */}
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
              <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                <MapPin size={11} className="text-emerald-400" />
                <span>ปลายทาง (คนกดยืนยันรับ)</span>
              </p>
              <select
                value={watchToId}
                onChange={(e) => handleToLocationChange(e.target.value)}
                className="w-full bg-slate-900 text-white text-sm font-bold rounded-lg p-2 border border-slate-700 focus:outline-none focus:border-emerald-400"
              >
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Rule Reminder */}
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-2">
            <span className="text-cyan-400 font-bold">ℹ️ กฎการรับ-ส่ง:</span>
            <span>
              {fromLocation?.name || 'ต้นทาง'} ส่งของ ➔ เฉพาะผู้ใช้งานที่ <strong>{toLocation?.name || 'ปลายทาง'}</strong> เท่านั้นที่เป็นคนกดยืนยันรับของจริงเพื่อปิดงาน
            </span>
          </div>

          {errors.to_location_id && (
            <p className="text-rose-400 text-xs">{errors.to_location_id.message}</p>
          )}
        </div>

        {/* STEP 3: ส่งให้ใคร & ผู้ส่งของ */}
        <div className="bg-slate-900/75 border border-white/10 rounded-2xl p-4 space-y-4 shadow-lg backdrop-blur-md relative z-0">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
            <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-xs font-bold">3</span>
            <h2 className="text-sm font-bold text-white">ส่งให้ใคร (ผู้รับปลายทาง) & ผู้ส่ง</h2>
          </div>

          {/* Receiver Staff Name (ส่งให้ใคร) - Required */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
              <User size={13} className="text-emerald-400" />
              <span>ส่งให้ใคร (ชื่อผู้รับปลายทางที่ {toLocation?.name || 'ปลายทาง'})</span> <span className="text-rose-400">*</span>
            </label>
            <input
              {...register('receiver_staff_name')}
              placeholder="ระบุชื่อผู้รับ เช่น คุณสมชาย, ช่างโต้ง, แผนกผลิต..."
              className="w-full bg-slate-950/80 border border-emerald-500/40 focus:border-emerald-400 text-white rounded-xl px-3.5 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none transition-all shadow-inner"
            />
            {errors.receiver_staff_name && (
              <p className="text-rose-400 text-xs">{errors.receiver_staff_name.message}</p>
            )}

            {/* Quick Receiver Suggestions from staffOptions */}
            <div className="pt-1">
              <p className="text-[10px] text-slate-500 mb-1">แตะด่วนชื่อผู้รับปลายทาง:</p>
              <div className="flex flex-wrap gap-1.5">
                {staffOptions.map(name => (
                  <button
                    key={`rec-${name}`}
                    type="button"
                    onClick={() => setValue('receiver_staff_name', name)}
                    className={cn(
                      'text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all active:scale-95',
                      watchReceiverStaff === name
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                        : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white'
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sender Staff Name (ชื่อผู้ส่ง) */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <User size={13} className="text-purple-400" />
                <span>ชื่อผู้ส่ง (ต้นทาง {fromLocation?.name || 'ต้นทาง'})</span> <span className="text-rose-400">*</span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsAddingStaff(!isAddingStaff)}
                  className="text-[10px] font-semibold text-purple-400 hover:text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded-lg border border-purple-500/20 flex items-center gap-1"
                >
                  <Plus size={11} /> เพิ่มชื่อ
                </button>
              </div>
            </div>

            <input
              {...register('sender_staff_name')}
              placeholder="ชื่อผู้ส่งของ..."
              className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-purple-400 text-white rounded-xl px-3.5 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none transition-all"
            />
            {errors.sender_staff_name && (
              <p className="text-rose-400 text-xs">{errors.sender_staff_name.message}</p>
            )}

            {/* Quick Sender Pills */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {staffOptions.map(name => (
                <button
                  key={`send-${name}`}
                  type="button"
                  onClick={() => setValue('sender_staff_name', name)}
                  className={cn(
                    'text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all active:scale-95',
                    watchSenderStaff === name
                      ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                      : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white'
                  )}
                >
                  {name}
                </button>
              ))}
            </div>

            {/* Inline Add Staff Box */}
            {isAddingStaff && (
              <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/30 space-y-2 mt-2">
                <p className="text-[11px] font-semibold text-purple-300">เพิ่มชื่อพนักงานใหม่:</p>
                <div className="flex items-center gap-2">
                  <input
                    value={newStaffName}
                    onChange={e => setNewStaffName(e.target.value)}
                    placeholder="พิมพ์ชื่อ เช่น สมชาย, ช่างเอ็ม..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newStaffName.trim()) {
                        addOption('staff', newStaffName.trim())
                        setValue('sender_staff_name', newStaffName.trim())
                        setNewStaffName('')
                        setIsAddingStaff(false)
                      }
                    }}
                    className="bg-purple-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
                  >
                    บันทึก
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsAddingStaff(false); setNewStaffName(''); }}
                    className="text-slate-400 text-xs px-2"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* STEP 4: ตัวเลือกการฝากของขึ้นรถ */}
        <div className="bg-slate-900/75 border border-white/10 rounded-2xl p-4 space-y-3 shadow-lg backdrop-blur-md relative z-0">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center text-xs font-bold">4</span>
            <h2 className="text-sm font-bold text-white">การนำส่งขึ้นรถ</h2>
          </div>

          <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-cyan-500/40 cursor-pointer transition-colors">
            <input
              type="checkbox"
              {...register('deposit_immediately')}
              className="w-4 h-4 mt-0.5 rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-cyan-500/20"
            />
            <div className="flex-1">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Truck size={14} className="text-cyan-400" />
                <span>ฝากของไปกับรถแล้วทันที</span>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded font-semibold border border-cyan-500/30">
                  บันทึกเวลานี้
                </span>
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                ติ๊กตัวเลือกนี้เมื่อของขึ้นรถแล้ว ระบบจะบันทึกวันเวลาและชื่อคนส่งทันที สถานะจะกลายเป็น "รอปลายทางรับของ"
              </p>
            </div>
          </label>
        </div>

        {/* Remarks & Notes (Optional) */}
        <div className="bg-slate-900/75 border border-white/10 rounded-2xl p-4 space-y-3 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-300">หมายเหตุเพิ่มเติม (ถ้ามี)</h2>
          </div>

          {/* Quick Remark Pills */}
          <div className="flex flex-wrap gap-1.5">
            {remarkOptions.map(rem => (
              <button
                key={rem}
                type="button"
                onClick={() => setValue('remark_base', rem)}
                className={cn(
                  'text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all active:scale-95',
                  watchRemarkBase === rem
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700'
                )}
              >
                {rem}
              </button>
            ))}
          </div>

          <textarea
            {...register('notes')}
            rows={2}
            placeholder="พิมพ์หมายเหตุเพิ่มเติมได้อิสระ..."
            className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-cyan-400 text-white rounded-xl p-3 text-xs placeholder:text-slate-500 focus:outline-none resize-none transition-all"
          />
        </div>

        {/* Photos (Optional) */}
        <div className="bg-slate-900/75 border border-white/10 rounded-2xl p-4 shadow-lg backdrop-blur-md">
          <PhotoUploader
            stage="item_creation"
            photos={photos}
            onPhotosChange={setPhotos}
            label="รูปภาพสิ่งของที่ส่ง (ไม่บังคับ)"
            hint="ถ่ายรูปตัวของ, ป้าย, หรือสภาพของก่อนส่งขึ้นรถ"
            maxPhotos={4}
          />
        </div>

        {/* Submit Actions */}
        <div className="pt-2 space-y-2">
          {watchDepositImmediately ? (
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-cyan-500/20 text-sm"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin w-5 h-5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  กำลังบันทึกรายการ...
                </>
              ) : (
                <>
                  <Truck size={18} />
                  <span>บันทึกและฝากของไปกับรถแล้ว (รอปลายทางรับ)</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-500/20 text-sm"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin w-5 h-5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  กำลังบันทึกรายการ...
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span>บันทึกรายการ (รอฝากไปกับรถ)</span>
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
