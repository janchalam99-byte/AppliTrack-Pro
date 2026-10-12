import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { 
  ChevronLeft, Save, Package, BookOpen, ArrowRightLeft, 
  Search, Check, Sparkles, User, Tag, HardDrive, Plus, X, Settings2, Database
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useAppStore } from '../store/appStore'
import { useQuickOptions } from '../hooks/useQuickOptions'
import PhotoUploader, { type UploadedPhoto } from '../components/PhotoUploader'
import { cn, compressImage } from '../lib/utils'
import { 
  searchApplicators, 
  type ApplicatorItem 
} from '../data/applicatorMaster'
import { uploadEvidencePhoto } from '../lib/photoUpload'
import toast from 'react-hot-toast'

const formSchema = z.object({
  type: z.enum(['transfer', 'loan']),
  app_no: z.string().optional(),
  terminal_name: z.string().min(1, 'กรุณาระบุชื่อ Terminal หรือสิ่งของ'),
  from_location_id: z.string().min(1, 'กรุณาเลือกสถานที่ต้นทาง'),
  to_location_id: z.string().min(1, 'กรุณาเลือกสถานที่ปลายทาง'),
  sender_staff_name: z.string().min(1, 'กรุณาระบุชื่อผู้รับ-ส่ง'),
  remark_base: z.string().optional(),
  notes: z.string().optional(),
  due_date: z.string().optional(),
  loan_due_date: z.string().optional(),
}).refine(d => d.from_location_id !== d.to_location_id, {
  message: 'สถานที่ต้นทางและปลายทางต้องไม่เหมือนกัน',
  path: ['to_location_id'],
})

type FormData = z.infer<typeof formSchema>

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

  // Location finding
  const het1 = locations.find(l => l.name.includes('1'))
  const het2 = locations.find(l => l.name.includes('2'))

  const defaultFromId = profile?.home_location_id || het1?.id || locations[0]?.id || ''
  const defaultToId = (defaultFromId === het1?.id ? het2?.id : het1?.id) || locations[1]?.id || ''

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: 'transfer',
      app_no: '',
      terminal_name: '',
      from_location_id: defaultFromId,
      to_location_id: defaultToId,
      sender_staff_name: profile?.full_name?.toUpperCase() || '',
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
  const watchRemarkBase = watch('remark_base')

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
      // 1. Instant local search from 1,412 items
      const localResults = searchApplicators(clean, 8)
      setSuggestions(localResults)
      setShowSuggestions(true)

      // 2. Query Supabase applicator_master for newly added items from any user
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
      toast.error('กรุณาระบุ App No หรือ Terminal Name ก่อนบันทึกเข้า Master')
      return
    }
    setIsSavingToMaster(true)
    try {
      const { error } = await supabase.from('applicator_master').insert({
        app_no: appNo || null,
        terminal_name: term || appNo,
        base_location: locations.find(l => l.id === watchFromId)?.name || 'HET 1',
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

      // Create transfer request
      const { data: request, error: reqError } = await supabase
        .from('transfer_requests')
        .insert({
          request_number: requestNumber,
          type: data.type,
          status: 'pending_confirm',
          title: title,
          app_no: cleanAppNo || null,
          terminal_name: cleanTerminal,
          sender_staff_name: data.sender_staff_name.trim(),
          remark_base: data.remark_base?.trim() || null,
          notes: data.notes || null,
          from_location_id: data.from_location_id,
          to_location_id: data.to_location_id,
          requester_id: profile.id,
          due_date: data.due_date || null,
          loan_due_date: data.type === 'loan' ? (data.loan_due_date || null) : null,
        })
        .select()
        .single()

      if (reqError) throw reqError

      // Create item row
      const { error: itemError } = await supabase
        .from('transfer_request_items')
        .insert({
          request_id: request.id,
          name: cleanAppNo || cleanTerminal,
          description: cleanTerminal,
          quantity_sent: 1,
          unit: 'ชุด',
          sort_order: 0,
          notes: data.remark_base || null,
        })

      if (itemError) throw itemError

      // Record initial status history
      await supabase.from('status_history').insert({
        request_id: request.id,
        from_status: null,
        to_status: 'pending_confirm',
        changed_by: profile.id,
        notes: `สร้างรายการรับ-ส่ง: ${title} (ผู้ดำเนินการ: ${data.sender_staff_name})`,
      })

      // Upload any photos that were selected before creating the request
      const pendingPhotos = photos.filter(p => p.file)
      if (pendingPhotos.length > 0) {
        for (const p of pendingPhotos) {
          if (p.file) {
            await uploadEvidencePhoto({
              file: p.file,
              requestId: request.id,
              requestNumber: cleanAppNo || requestNumber,
              stage: 'item_creation',
              userId: profile.id,
              isEvidence: false,
            })
          }
        }
      }

      toast.success(`บันทึกรายการ ${cleanAppNo || requestNumber} สำเร็จ`)
      navigate(`/requests/${request.id}`)
    } catch (err: any) {
      console.error(err)
      toast.error(`ไม่สามารถบันทึกได้: ${err.message ?? 'เกิดข้อผิดพลาด'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const fromLocation = locations.find(l => l.id === watchFromId)
  const toLocation = locations.find(l => l.id === watchToId)

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors touch-feedback"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">ลงรายการ รับ-ส่ง Applicator</h1>
          <p className="text-xs text-slate-400">บันทึกข้อมูลการโอนย้ายเครื่องมือและอะไหล่ระหว่างโรงงาน</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Type Selector */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'transfer', label: 'ฝาก/ส่งของ (ทั่วไป)', icon: Package, desc: 'ส่งงานไปอีกโรงงาน' },
              { value: 'loan', label: 'ยืมของ (ต้องคืน)', icon: BookOpen, desc: 'ยืมใช้งานชั่วคราว' },
            ].map(({ value, label, icon: Icon, desc }) => (
              <label
                key={value}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                  watchType === value
                    ? 'border-blue-500 bg-blue-500/10 text-white'
                    : 'border-slate-700/60 bg-slate-900/40 text-slate-400 hover:bg-slate-900/60'
                )}
              >
                <input {...register('type')} type="radio" value={value} className="sr-only" />
                <div className={cn(
                  'p-2 rounded-lg',
                  watchType === value ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-500'
                )}>
                  <Icon size={18} />
                </div>
                <div>
                  <p className="font-bold text-xs">{label}</p>
                  <p className="text-[10px] text-slate-500">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Section 1: Applicator & Terminal (With Smart Autocomplete) */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-4 relative" ref={searchBoxRef}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <h2 className="text-sm font-bold text-white">ข้อมูล Applicator / Terminal</h2>
            </div>
            <Link
              to="/master-applicators"
              className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1 rounded-lg border border-blue-500/20 transition-all active:scale-95"
              title="เปิดหน้าจัดการฐานข้อมูล Master Applicator"
            >
              <Database size={12} />
              จัดการ Master ⚙️
            </Link>
          </div>

          {/* App No Field with Autocomplete */}
          <div className="space-y-1.5 relative">
            <label className="block text-xs font-semibold text-slate-300">
              App No. (รหัสเครื่องมือ)
            </label>
            <div className="relative">
              <input
                value={watchAppNo}
                onChange={e => handleAppSearch(e.target.value)}
                placeholder="เช่น TW-1158, TW-999, WS-33..."
                className="w-full bg-slate-900/90 border border-slate-700 focus:border-blue-500 text-white rounded-xl px-3 py-2.5 text-sm font-mono placeholder:text-slate-600 focus:outline-none"
              />
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto divide-y divide-slate-800">
                {suggestions.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSelectApplicator(item)}
                    className="p-2.5 hover:bg-slate-800/80 cursor-pointer transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/15 px-1.5 py-0.5 rounded">
                          {item.appNo || '-'}
                        </span>
                        <span className="text-xs font-medium text-white group-hover:text-blue-300">
                          {item.terminalName}
                        </span>
                      </div>
                      {(item.maker || item.terMaker || item.model) && (
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {[item.maker, item.terMaker, item.model, item.serial].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 group-hover:text-white">เลือก</span>
                  </div>
                ))}

                {/* Option to quick-save new Applicator if user entered a custom code */}
                {Boolean(watchAppNo?.trim()) && (
                  <div
                    onClick={handleQuickSaveToMaster}
                    className="p-2.5 bg-blue-950/40 hover:bg-blue-900/50 cursor-pointer transition-colors flex items-center justify-between group text-blue-300"
                  >
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <Plus size={14} className="text-blue-400" />
                      {isSavingToMaster ? 'กำลังบันทึก...' : `บันทึก "${watchAppNo?.trim()}" เป็น Master ใหม่`}
                    </span>
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">
                      + บันทึก
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Terminal Name Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-300">
                TERMINAL NAME / Part No. <span className="text-rose-400">*</span>
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
              placeholder="เช่น 8100-4027 / 8100-4030, SIN-41T-2.4S, ฐานAPP NITON..."
              className="w-full bg-slate-900/90 border border-slate-700 focus:border-blue-500 text-white rounded-xl px-3 py-2.5 text-sm placeholder:text-slate-600 focus:outline-none"
            />
            {errors.terminal_name && (
              <p className="text-rose-400 text-xs">{errors.terminal_name.message}</p>
            )}
          </div>
        </div>

        {/* Section 2: Locations (From <-> To) */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <h2 className="text-sm font-bold text-white">เส้นทาง รับ-ส่ง</h2>
            </div>
            <button
              type="button"
              onClick={handleSwapLocations}
              className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1 rounded-lg border border-blue-500/20 transition-all active:scale-95"
            >
              <ArrowRightLeft size={13} />
              สลับทิศทาง
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700">
              <p className="text-[10px] text-slate-500 font-semibold mb-1">ต้นทาง (ผู้ส่ง)</p>
              <select
                {...register('from_location_id')}
                className="w-full bg-slate-800 text-white text-sm font-bold rounded-lg p-2 border border-slate-700 focus:outline-none focus:border-blue-500"
              >
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700">
              <p className="text-[10px] text-slate-500 font-semibold mb-1">ปลายทาง (ผู้รับ)</p>
              <select
                {...register('to_location_id')}
                className="w-full bg-slate-800 text-white text-sm font-bold rounded-lg p-2 border border-slate-700 focus:outline-none focus:border-blue-500"
              >
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>
          {errors.to_location_id && (
            <p className="text-rose-400 text-xs">{errors.to_location_id.message}</p>
          )}
        </div>

        {/* Section 3: Staff Name (ชื่อผู้รับ-ส่ง) with Dynamic Quick Pills */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <h2 className="text-sm font-bold text-white">ชื่อผู้รับ-ส่ง <span className="text-rose-400">*</span></h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsAddingStaff(!isAddingStaff)}
                className="text-[11px] font-semibold text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 px-2 py-0.5 rounded-lg border border-purple-500/20 flex items-center gap-1 transition-all"
              >
                <Plus size={12} />
                เพิ่มชื่อ
              </button>
              <button
                type="button"
                onClick={() => setIsManagingStaff(!isManagingStaff)}
                className={cn(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-lg border transition-all',
                  isManagingStaff
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-slate-900/60 text-slate-400 border-slate-700 hover:text-white'
                )}
              >
                {isManagingStaff ? 'เสร็จสิ้น' : 'ลบปุ่ม'}
              </button>
            </div>
          </div>

          <input
            {...register('sender_staff_name')}
            placeholder="พิมพ์ชื่อ หรือแตะเลือกชื่อพนักงานด้านล่าง..."
            className="w-full bg-slate-900/90 border border-slate-700 focus:border-purple-500 text-white rounded-xl px-3 py-2.5 text-sm placeholder:text-slate-600 focus:outline-none font-medium"
          />
          {errors.sender_staff_name && (
            <p className="text-rose-400 text-xs">{errors.sender_staff_name.message}</p>
          )}

          {/* Inline Add Staff Box */}
          {isAddingStaff && (
            <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-500/30 space-y-2">
              <p className="text-[11px] font-semibold text-purple-300">เพิ่มชื่อพนักงานใหม่เข้าปุ่มลัด:</p>
              <div className="flex items-center gap-2">
                <input
                  value={newStaffName}
                  onChange={e => setNewStaffName(e.target.value)}
                  placeholder="พิมพ์ชื่อ เช่น SOMCHAI, สมชาย..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-400"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (newStaffName.trim()) {
                        addOption('staff', newStaffName.trim())
                        setValue('sender_staff_name', newStaffName.trim())
                        setNewStaffName('')
                        setIsAddingStaff(false)
                      }
                    }
                  }}
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
                  className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                >
                  บันทึก
                </button>
                <button
                  type="button"
                  onClick={() => { setIsAddingStaff(false); setNewStaffName(''); }}
                  className="text-slate-400 text-xs px-2 py-1.5 hover:text-white"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          {/* Quick Staff Pills */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-slate-500 font-medium">แตะด่วนชื่อพนักงาน (หรือพิมพ์เองด้านบน):</p>
              {isManagingStaff && (
                <span className="text-[10px] text-rose-400 animate-pulse">แตะเครื่องหมาย × เพื่อลบปุ่มที่ไม่ใช้</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {staffOptions.map(name => (
                <div key={name} className="relative group">
                  <button
                    type="button"
                    onClick={() => setValue('sender_staff_name', name)}
                    className={cn(
                      'text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all active:scale-95',
                      watchSenderStaff === name
                        ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                        : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:border-slate-600 hover:bg-slate-900'
                    )}
                  >
                    {name}
                  </button>
                  {isManagingStaff && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeOption('staff', name)
                      }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center text-[10px] shadow"
                      title={`ลบปุ่ม ${name}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section 4: Remarks (พร้อมฐาน App / ไม่ได้ส่งฐาน) with Dynamic Quick Pills */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <h2 className="text-sm font-bold text-white">หมายเหตุ & สถานะฐาน App</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsAddingRemark(!isAddingRemark)}
                className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/20 flex items-center gap-1 transition-all"
              >
                <Plus size={12} />
                เพิ่มปุ่ม
              </button>
              <button
                type="button"
                onClick={() => setIsManagingRemark(!isManagingRemark)}
                className={cn(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-lg border transition-all',
                  isManagingRemark
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-slate-900/60 text-slate-400 border-slate-700 hover:text-white'
                )}
              >
                {isManagingRemark ? 'เสร็จสิ้น' : 'ลบปุ่ม'}
              </button>
            </div>
          </div>

          {/* Inline Add Remark Box */}
          {isAddingRemark && (
            <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 space-y-2">
              <p className="text-[11px] font-semibold text-amber-300">เพิ่มข้อความหมายเหตุใหม่เข้าปุ่มลัด:</p>
              <div className="flex items-center gap-2">
                <input
                  value={newRemarkText}
                  onChange={e => setNewRemarkText(e.target.value)}
                  placeholder="พิมพ์ข้อความ เช่น ปรับตั้งมีดใหม่..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (newRemarkText.trim()) {
                        addOption('remark', newRemarkText.trim())
                        setValue('remark_base', newRemarkText.trim())
                        setNewRemarkText('')
                        setIsAddingRemark(false)
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newRemarkText.trim()) {
                      addOption('remark', newRemarkText.trim())
                      setValue('remark_base', newRemarkText.trim())
                      setNewRemarkText('')
                      setIsAddingRemark(false)
                    }
                  }}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                >
                  บันทึก
                </button>
                <button
                  type="button"
                  onClick={() => { setIsAddingRemark(false); setNewRemarkText(''); }}
                  className="text-slate-400 text-xs px-2 py-1.5 hover:text-white"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          {/* Quick Remark Pills */}
          <div className="flex flex-wrap gap-1.5">
            {remarkOptions.map(rem => (
              <div key={rem} className="relative group">
                <button
                  type="button"
                  onClick={() => setValue('remark_base', rem)}
                  className={cn(
                    'text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all active:scale-95',
                    watchRemarkBase === rem
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:border-slate-600'
                  )}
                >
                  {rem}
                </button>
                {isManagingRemark && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeOption('remark', rem)
                    }}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center text-[10px] shadow"
                    title={`ลบปุ่ม ${rem}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <textarea
            {...register('notes')}
            rows={2}
            placeholder="พิมพ์หมายเหตุเพิ่มเติมได้อิสระ..."
            className="w-full bg-slate-900/90 border border-slate-700 focus:border-blue-500 text-white rounded-xl p-3 text-sm placeholder:text-slate-600 focus:outline-none resize-none"
          />
        </div>

        {/* Section 5: Photos (Client-Side Compression) */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
          <PhotoUploader
            stage="item_creation"
            photos={photos}
            onPhotosChange={setPhotos}
            label="รูปภาพหลักฐานก่อนส่ง"
            hint="ถ่ายรูปตัว App, ป้าย Serial, หน้าสัมผัส หรือสภาพของ (บีบอัดคมชัดอัตโนมัติ)"
            maxPhotos={6}
          />
        </div>

        {/* Submit Button */}
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
              บันทึกรายการลงระบบ
            </>
          )}
        </button>

        <div className="h-4" />
      </form>
    </div>
  )
}
