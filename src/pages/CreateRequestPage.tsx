import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { 
  ChevronLeft, Save, Package, ArrowRightLeft, 
  Search, Check, Sparkles, User, Tag, HardDrive, Plus, X, 
  Truck, ArrowRight, MapPin, Layers, Hash, Trash2
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
import { generateUniqueRequestNumber, sanitizeString } from '../lib/safety'
import toast from 'react-hot-toast'

export interface SendItem {
  id: string
  terminal_name: string
  app_no: string
  quantity: number | string
  unit: string
  notes?: string
}

const formSchema = z.object({
  type: z.enum(['transfer', 'loan']),
  terminal_name: z.string().optional(),
  app_no: z.string().optional(),
  quantity: z.coerce.number().optional(),
  unit: z.string().optional(),
  from_location_id: z.string().min(1, 'กรุณาเลือกสถานที่ต้นทาง'),
  to_location_id: z.string().min(1, 'กรุณาเลือกสถานที่ปลายทาง'),
  sender_staff_name: z.string().min(1, 'กรุณาระบุชื่อผู้ส่ง'),
  receiver_staff_name: z.string().optional(),
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
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const locations = useAppStore((s) => s.locations)
  const [photos, setPhotos] = useState<UploadedPhoto[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSubmittingRef = useRef(false)
  const lastSubmitTimeRef = useRef(0)

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

  // Dynamic send items state (supports adding multiple items to 1 request)
  const [items, setItems] = useState<SendItem[]>([
    {
      id: 'item-1',
      terminal_name: '',
      app_no: '',
      quantity: 1,
      unit: 'ชุด',
      notes: '',
    }
  ])
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: 'transfer',
      from_location_id: defaultFromId,
      to_location_id: defaultToId,
      sender_staff_name: profile?.full_name || '',
      receiver_staff_name: '',
      deposit_immediately: false,
      remark_base: '',
      notes: '',
    },
  })

  const watchType = watch('type')
  const watchFromId = watch('from_location_id')
  const watchToId = watch('to_location_id')
  const watchSenderStaff = watch('sender_staff_name')
  const watchReceiverStaff = watch('receiver_staff_name')
  const watchRemarkBase = watch('remark_base')
  const watchDepositImmediately = watch('deposit_immediately')

  // Handle return items from query parameters (e.g. ?from=...&to=...&app_no=...&name=...)
  useEffect(() => {
    const retFrom = searchParams.get('from')
    const retTo = searchParams.get('to')
    const appNo = searchParams.get('app_no')
    const name = searchParams.get('name')
    if (retFrom) setValue('from_location_id', retFrom)
    if (retTo) setValue('to_location_id', retTo)
    if (name || appNo) {
      setItems([
        {
          id: 'item-1',
          terminal_name: name || appNo || '',
          app_no: appNo || '',
          quantity: 1,
          unit: 'ชุด',
          notes: '',
        }
      ])
    }
  }, [searchParams, setValue])

  const [hasDraftSaved, setHasDraftSaved] = useState(false)

  // Auto-load draft from localStorage on mount (if no query params)
  useEffect(() => {
    if (searchParams.get('from') || searchParams.get('app_no') || searchParams.get('name')) return
    try {
      const saved = localStorage.getItem('applitrack_request_draft')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          setItems(parsed.items)
          setHasDraftSaved(true)
        }
        if (parsed.sender_staff_name) setValue('sender_staff_name', parsed.sender_staff_name)
        if (parsed.remark_base) setValue('remark_base', parsed.remark_base)
      }
    } catch (e) {
      console.warn('Error restoring draft:', e)
    }
  }, [searchParams, setValue])

  // Auto-save draft to localStorage whenever user modifies items or fields
  useEffect(() => {
    try {
      const hasContent = items.some(i => i.terminal_name.trim() || i.app_no?.trim())
      if (hasContent) {
        localStorage.setItem('applitrack_request_draft', JSON.stringify({
          items,
          sender_staff_name: watchSenderStaff,
          remark_base: watchRemarkBase,
        }))
        setHasDraftSaved(true)
      }
    } catch {}
  }, [items, watchSenderStaff, watchRemarkBase])

  const handleClearDraft = () => {
    localStorage.removeItem('applitrack_request_draft')
    setItems([
      { id: 'item-1', terminal_name: '', app_no: '', quantity: 1, unit: 'ชุด', notes: '' }
    ])
    setValue('remark_base', '')
    setHasDraftSaved(false)
    toast.success('ล้างข้อมูลร่างเรียบร้อย')
  }

  // Automatically sync initial location defaults when locations or profile load
  useEffect(() => {
    if (locations.length >= 2 && !searchParams.get('from')) {
      const h1 = locations.find(l => l.name.toUpperCase().includes('1') || l.name.toUpperCase().includes('HET-1'))
      const h2 = locations.find(l => l.name.toUpperCase().includes('2') || l.name.toUpperCase().includes('HET-2'))
      const userAtHet2 = profile?.email?.includes('2') || (h2 && profile?.home_location_id === h2.id)
      
      const targetFrom = userAtHet2 ? (h2?.id || locations[0]?.id) : (h1?.id || locations[0]?.id)
      const targetTo = userAtHet2 ? (h1?.id || locations[1]?.id) : (h2?.id || locations[1]?.id)
      
      if (targetFrom && !watchFromId) setValue('from_location_id', targetFrom)
      if (targetTo && !watchToId) setValue('to_location_id', targetTo)
    }
  }, [locations, profile, setValue, watchFromId, watchToId, searchParams])

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
        setActiveSearchIndex(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const [isSavingToMaster, setIsSavingToMaster] = useState(false)

  // Item List Management
  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        terminal_name: '',
        app_no: '',
        quantity: 1,
        unit: 'ชุด',
        notes: '',
      }
    ])
    toast.success('เพิ่มช่องรายการสิ่งของแล้ว', { duration: 1500, icon: '➕' })
  }

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      toast.error('ต้องมีรายการสิ่งของอย่างน้อย 1 รายการ')
      return
    }
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpdateItem = (index: number, field: keyof SendItem, value: any) => {
    setItems(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  // Auto-search suggestions per item
  const handleAppSearch = async (index: number, val: string) => {
    handleUpdateItem(index, 'app_no', val)
    setActiveSearchIndex(index)
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

  const handleSelectApplicator = (index: number, item: ApplicatorItem) => {
    setItems(prev => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        app_no: item.appNo,
        terminal_name: item.terminalName,
      }
      return next
    })
    setShowSuggestions(false)
    setActiveSearchIndex(null)
    toast.success(`เลือก ${item.appNo} (${item.terminalName})`, { duration: 1500, icon: '⚡' })
  }

  // Quick save item to master from create form
  const handleQuickSaveToMaster = async (index: number) => {
    const it = items[index]
    const appNo = it?.app_no?.trim() || ''
    const term = it?.terminal_name?.trim() || ''
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

  // Swap direction (HET-1 <-> HET-2)
  const handleSwapLocations = () => {
    setValue('from_location_id', watchToId)
    setValue('to_location_id', watchFromId)
  }

  const generateRequestNumber = async (type: string, retryAttempt = 0): Promise<string> => {
    const prefix = type === 'loan' ? 'LN' : 'TR'
    if (retryAttempt === 0) {
      try {
        const { data, error } = await supabase.rpc('generate_request_number', { req_type: type })
        if (!error && data) {
          // Double check uniqueness just in case
          const { data: existing } = await supabase
            .from('transfer_requests')
            .select('id')
            .eq('request_number', data)
            .maybeSingle()
          if (!existing) return data
        }
      } catch {
        // Fallback below
      }
    }

    // Client-side fallback generator based on current date and latest record
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const datePart = `${y}${m}${d}`

    try {
      const { data: latest } = await supabase
        .from('transfer_requests')
        .select('request_number')
        .ilike('request_number', `${prefix}-${datePart}-%`)
        .order('request_number', { ascending: false })
        .limit(1)

      let nextSeq = 1
      if (latest && latest.length > 0) {
        const match = latest[0].request_number.match(/(\d+)$/)
        if (match) {
          nextSeq = parseInt(match[1], 10) + 1
        }
      }
      return generateUniqueRequestNumber(prefix, datePart, nextSeq, retryAttempt)
    } catch {
      return generateUniqueRequestNumber(prefix, datePart, Date.now() % 1000, retryAttempt + 1)
    }
  }

  const onSubmit = async (data: FormData) => {
    if (!profile) return

    // Prevent duplicate/repeated submit clicks
    const nowTs = Date.now()
    if (isSubmittingRef.current || (nowTs - lastSubmitTimeRef.current < 2500)) {
      console.warn('Duplicate submit blocked')
      return
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('ขณะนี้ไม่มีสัญญาณอินเทอร์เน็ต กรุณารอเชื่อมต่อเน็ตก่อนบันทึกรายการ', { icon: '📡' })
      return
    }

    // Validate all items BEFORE engaging submission lock
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!it.terminal_name.trim() && !it.app_no.trim()) {
        toast.error(`กรุณาระบุชื่อสิ่งของในรายการที่ ${i + 1}`)
        return
      }
      if (!it.quantity || Number(it.quantity) <= 0) {
        toast.error(`กรุณาระบุจำนวนที่มากกว่า 0 ในรายการที่ ${i + 1}`)
        return
      }
    }

    const pendingUploads = photos.filter(p => p.status === 'uploading')
    if (pendingUploads.length > 0) {
      toast.error('กรุณารอให้รูปภาพอัปโหลดเสร็จก่อน')
      return
    }

    isSubmittingRef.current = true
    lastSubmitTimeRef.current = nowTs
    setIsSubmitting(true)

    try {

      let requestNumber = await generateRequestNumber(data.type)
      const now = new Date().toISOString()
      const isDeposited = Boolean(data.deposit_immediately)

      const fromLoc = locations.find(l => l.id === data.from_location_id)
      const toLoc = locations.find(l => l.id === data.to_location_id)

      const validAppNos = items.map(i => i.app_no?.trim()).filter(Boolean) as string[]
      const cleanAppNo = validAppNos.length > 0 ? validAppNos.join(', ') : null
      const cleanTerminal = items.map(i => i.terminal_name.trim() || i.app_no?.trim()).filter(Boolean).join(', ')

      const firstItem = items[0]
      const firstApp = firstItem.app_no?.trim()
      const firstTerm = firstItem.terminal_name.trim() || firstApp || 'สิ่งของ'
      const firstItemTitle = firstApp ? `${firstApp} - ${firstTerm}` : firstTerm

      const title = items.length === 1
        ? firstItemTitle
        : `${firstItemTitle} และอื่นๆ รวม ${items.length} รายการ`

      // Create transfer request
      let reqInsert = await supabase
        .from('transfer_requests')
        .insert({
          request_number: requestNumber,
          type: 'transfer',
          status: isDeposited ? 'in_transit' : 'ready_to_send',
          title: title,
          app_no: cleanAppNo,
          terminal_name: cleanTerminal,
          sender_staff_name: data.sender_staff_name.trim(),
          receiver_staff_name: data.receiver_staff_name?.trim() || null,
          remark_base: data.remark_base?.trim() || null,
          notes: data.notes || null,
          from_location_id: data.from_location_id,
          to_location_id: data.to_location_id,
          requester_id: profile.id,
          deposited_at: isDeposited ? now : null,
          deposited_recorded_at: isDeposited ? now : null,
          deposited_by: isDeposited ? profile.id : null,
          is_deposit_backdated: false,
          due_date: null,
          loan_due_date: null,
        })
        .select()
        .single()

      // If duplicate key error, retry up to 2 times with collision-breaker suffix
      if (reqInsert.error && (reqInsert.error.code === '23505' || reqInsert.error.message?.includes('unique'))) {
        console.warn('Duplicate request number detected, retrying with unique suffix...')
        for (let attempt = 1; attempt <= 2; attempt++) {
          requestNumber = await generateRequestNumber('transfer', attempt)
          reqInsert = await supabase
            .from('transfer_requests')
            .insert({
              request_number: requestNumber,
              type: 'transfer',
              status: isDeposited ? 'in_transit' : 'ready_to_send',
              title: title,
              app_no: cleanAppNo,
              terminal_name: cleanTerminal,
              sender_staff_name: data.sender_staff_name.trim(),
              receiver_staff_name: data.receiver_staff_name?.trim() || null,
              remark_base: data.remark_base?.trim() || null,
              notes: data.notes || null,
              from_location_id: data.from_location_id,
              to_location_id: data.to_location_id,
              requester_id: profile.id,
              deposited_at: isDeposited ? now : null,
              deposited_recorded_at: isDeposited ? now : null,
              deposited_by: isDeposited ? profile.id : null,
              is_deposit_backdated: false,
              due_date: null,
              loan_due_date: null,
            })
            .select()
            .single()

          if (!reqInsert.error) break
        }
      }

      const { data: request, error: reqError } = reqInsert
      if (reqError) throw reqError

      // Create item rows with custom quantities & units
      const itemsToInsert = items.map((it, idx) => {
        const itemApp = it.app_no?.trim() || ''
        const itemTerm = it.terminal_name.trim() || itemApp || 'สิ่งของ'
        const itemName = itemApp ? `${itemApp} - ${itemTerm}` : itemTerm
        return {
          request_id: request.id,
          name: itemName,
          description: itemTerm,
          quantity_sent: Number(it.quantity) || 1,
          quantity_received: 0,
          quantity_returned: 0,
          unit: it.unit?.trim() || 'ชุด',
          sort_order: idx,
          notes: (it.notes?.trim() || data.remark_base?.trim() || data.notes?.trim()) || null,
        }
      })

      const { error: itemError } = await supabase
        .from('transfer_request_items')
        .insert(itemsToInsert)

      if (itemError) throw itemError

      // Record initial status history
      const totalUnits = items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0)
      const historyNotes = isDeposited
        ? `สร้างรายการและฝากของ (${items.length} รายการ, รวม ${totalUnits}) ไปกับรถแล้ว (ผู้ส่ง: ${data.sender_staff_name})`
        : `สร้างรายการ (${items.length} รายการ): ${title} (ผู้ส่ง: ${data.sender_staff_name}) [รอฝากไปกับรถ]`

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
            message: `${fromLoc?.name || 'ต้นทาง'} ส่งของไปยัง ${toLoc?.name || 'ปลายทาง'} (ผู้ส่ง: ${data.sender_staff_name})`,
            is_read: false,
          }))
        )
      }

      if (isDeposited) {
        toast.success(`ฝากของไปกับรถแล้ว! รอ ${toLoc?.name || 'ปลายทาง'} รับของ`, { duration: 3000, icon: '🚚' })
      } else {
        toast.success(`บันทึกรายการเรียบร้อย! รอฝากไปกับรถ`, { duration: 2500, icon: '✅' })
      }

      // Immediately invalidate all caches so Dashboard, Requests, and History show new item instantly
      qc.invalidateQueries({ queryKey: ['requests'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      qc.invalidateQueries({ queryKey: ['recent-requests'] })
      qc.invalidateQueries({ queryKey: ['history'] })
      qc.invalidateQueries({ queryKey: ['tool-journey'] })

      try {
        localStorage.removeItem('applitrack_request_draft')
      } catch {}

      navigate(`/requests/${request.id}`)
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาด: ${err.message}`)
    } finally {
      setIsSubmitting(false)
      isSubmittingRef.current = false
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
          <h1 className="text-lg font-bold text-white">สร้างรายการรับ-ส่งของ</h1>
          <p className="text-slate-400 text-xs">ระบุของ, จำนวน, เส้นทาง และผู้รับปลายทาง</p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          if (isSubmittingRef.current) {
            e.preventDefault()
            e.stopPropagation()
            return
          }
          handleSubmit(onSubmit)(e)
        }}
        className="space-y-4"
      >

        {/* Offline Draft Auto-Saved Indicator */}
        {hasDraftSaved && (
          <div className="flex items-center justify-between bg-slate-900/80 border border-cyan-500/30 rounded-xl px-3.5 py-2 text-xs text-cyan-300 backdrop-blur-md shadow-sm">
            <span className="flex items-center gap-1.5 text-[11px] font-medium">
              <span className="text-cyan-400">💾</span>
              <span>บันทึกร่างอัตโนมัติในเครื่องแล้ว (เน็ตหลุดข้อมูลไม่หาย)</span>
            </span>
            <button
              type="button"
              onClick={handleClearDraft}
              className="text-[10px] text-slate-400 hover:text-rose-400 transition-colors underline"
            >
              ล้างร่างใหม่
            </button>
          </div>
        )}

        {/* STEP 1: ระบุสิ่งของ & จำนวนที่ส่ง (รองรับการเพิ่มหลายรายการ) */}
        <div ref={searchBoxRef} className="bg-slate-900/75 border border-white/10 rounded-2xl p-4 space-y-4 shadow-lg backdrop-blur-md relative z-20">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>ระบุสิ่งของ & จำนวนที่ส่ง</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                    {items.length} รายการ
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400">สามารถเพิ่มหลายรายการเพื่อส่งไปในเที่ยวรถเดียวกันได้</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddItem}
              className="flex items-center gap-1.5 text-xs font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-3 py-1.5 rounded-xl shadow-md shadow-cyan-500/20 active:scale-95 transition-all"
            >
              <Plus size={14} />
              <span>เพิ่มรายการ</span>
            </button>
          </div>

          {/* List of send items */}
          <div className="space-y-3.5">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 hover:border-slate-700/80 space-y-3 transition-all relative"
              >
                {/* Item Card Header */}
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg bg-slate-800 text-cyan-300 border border-slate-700 flex items-center justify-center text-[11px] font-bold">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-white">
                      รายการสิ่งของ #{idx + 1}
                    </span>
                    {item.app_no && (
                      <span className="text-[10px] font-mono font-bold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">
                        {item.app_no}
                      </span>
                    )}
                  </div>

                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-2 py-1 rounded-lg border border-rose-500/20 flex items-center gap-1 transition-all active:scale-95"
                      title="ลบรายการนี้"
                    >
                      <Trash2 size={12} />
                      <span>ลบ</span>
                    </button>
                  )}
                </div>

                {/* 1. Item Name / Terminal Name */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-300">
                      ชื่อสิ่งของ / Terminal Name / Part No. <span className="text-rose-400">*</span>
                    </label>
                    {item.terminal_name?.trim() && (
                      <button
                        type="button"
                        onClick={() => handleQuickSaveToMaster(idx)}
                        disabled={isSavingToMaster}
                        className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-0.5 rounded-lg border border-blue-500/20 transition-all"
                        title="บันทึกเข้าฐานข้อมูล Master ทันที"
                      >
                        <Save size={10} />
                        บันทึกเข้า Master
                      </button>
                    )}
                  </div>
                  <input
                    value={item.terminal_name}
                    onChange={(e) => handleUpdateItem(idx, 'terminal_name', e.target.value)}
                    placeholder="เช่น Applicator เบอร์..., สายไฟ, กล่องอะไหล่, อุปกรณ์..."
                    className="w-full bg-slate-900 border border-slate-700/80 focus:border-cyan-400 text-white rounded-xl px-3.5 py-2 text-sm placeholder:text-slate-500 focus:outline-none transition-all"
                  />
                </div>

                {/* 2. Quantity & Unit */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                      <Hash size={12} className="text-cyan-400" />
                      <span>จำนวน</span> <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={item.quantity}
                      onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)}
                      placeholder="เช่น 1, 2"
                      className="w-full bg-slate-900 border border-slate-700/80 focus:border-cyan-400 text-white rounded-xl px-3 py-2 text-sm font-bold placeholder:text-slate-500 focus:outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-300">
                      หน่วยนับ <span className="text-rose-400">*</span>
                    </label>
                    <input
                      value={item.unit}
                      onChange={(e) => handleUpdateItem(idx, 'unit', e.target.value)}
                      placeholder="เช่น ชุด, ชิ้น"
                      className="w-full bg-slate-900 border border-slate-700/80 focus:border-cyan-400 text-white rounded-xl px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Quick Unit Pills */}
                <div className="flex flex-wrap gap-1">
                  {COMMON_UNITS.map(u => (
                    <button
                      key={`${item.id}-${u}`}
                      type="button"
                      onClick={() => handleUpdateItem(idx, 'unit', u)}
                      className={cn(
                        'text-[10px] px-2 py-0.5 rounded-lg border transition-all active:scale-95',
                        item.unit === u
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold'
                          : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
                      )}
                    >
                      {u}
                    </button>
                  ))}
                </div>

                {/* 3. Optional App No. with Instant Search */}
                <div className="space-y-1 relative pt-2 border-t border-slate-800/60">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                      <Search size={11} className="text-blue-400" />
                      <span>รหัส APP NO. (ถ้ามี / พิมพ์เพื่อค้นหาจาก Master)</span>
                    </label>
                    {item.app_no && (
                      <button
                        type="button"
                        onClick={() => {
                          handleUpdateItem(idx, 'app_no', '')
                          setShowSuggestions(false)
                        }}
                        className="text-[10px] text-slate-500 hover:text-slate-300"
                      >
                        ล้าง
                      </button>
                    )}
                  </div>
                  <input
                    value={item.app_no || ''}
                    onChange={(e) => handleAppSearch(idx, e.target.value)}
                    placeholder="พิมพ์ค้นหา เช่น TW-208, 1234... (ไม่ระบุก็ได้)"
                    className="w-full bg-slate-900/80 border border-slate-800 focus:border-blue-500 text-white font-mono rounded-xl px-3 py-1.5 text-xs placeholder:text-slate-600 focus:outline-none transition-all"
                  />

                  {/* Dropdown suggestions for this active item */}
                  {showSuggestions && activeSearchIndex === idx && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-[#0f172a] border border-cyan-500/50 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.95)] overflow-hidden max-h-60 overflow-y-auto divide-y divide-slate-800 ring-1 ring-white/15">
                      {suggestions.map((sug, sIdx) => (
                        <div
                          key={`${sug.appNo}-${sug.terminalName}-${sIdx}`}
                          onClick={() => handleSelectApplicator(idx, sug)}
                          className="p-3 hover:bg-slate-800/90 cursor-pointer transition-colors flex items-center justify-between text-left group"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-cyan-300 bg-cyan-950/70 px-2 py-0.5 rounded border border-cyan-500/30">
                                {sug.appNo}
                              </span>
                              {sug.baseLocation && (
                                <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                                  📍 {sug.baseLocation}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-white group-hover:text-cyan-200 mt-1 font-medium">{sug.terminalName}</p>
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
            ))}
          </div>

          {/* Bottom Add Item Button */}
          <button
            type="button"
            onClick={handleAddItem}
            className="w-full py-3 rounded-xl border border-dashed border-cyan-500/40 hover:border-cyan-400 bg-cyan-500/5 hover:bg-cyan-500/10 text-cyan-400 hover:text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
          >
            <Plus size={16} />
            <span>+ เพิ่มรายการสิ่งของอีกชิ้น (ส่งพร้อมกันในเที่ยวนี้)</span>
          </button>
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


          <div className="grid grid-cols-2 gap-3 items-center pt-1">
            {/* Origin Location */}
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
              <p className="text-[11px] text-slate-400 font-semibold flex items-center gap-1 truncate">
                <MapPin size={12} className="text-cyan-400 shrink-0" />
                <span>ต้นทาง (ส่งของ)</span>
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
              <p className="text-[11px] text-slate-400 font-semibold flex items-center gap-1 truncate">
                <MapPin size={12} className="text-emerald-400 shrink-0" />
                <span>ปลายทาง (รับของ)</span>
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


          {errors.to_location_id && (
            <p className="text-rose-400 text-xs">{errors.to_location_id.message}</p>
          )}
        </div>

        {/* STEP 3: ผู้ส่งของ */}
        <div className="bg-slate-900/75 border border-white/10 rounded-2xl p-4 space-y-4 shadow-lg backdrop-blur-md relative z-0">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
            <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-xs font-bold">3</span>
            <div>
              <h2 className="text-sm font-bold text-white">ผู้ส่งของ (ต้นทาง {fromLocation?.name || ''})</h2>
              <p className="text-[11px] text-slate-400">ระบุเฉพาะคนส่ง · ผู้รับปลายทางจะเป็นคนลงชื่อรับของเองเมื่อของส่งถึง</p>
            </div>
          </div>

          {/* Sender Staff Name (ชื่อผู้ส่ง) */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <User size={13} className="text-purple-400" />
                <span>ชื่อผู้ส่ง (ต้นทาง {fromLocation?.name || 'ต้นทาง'})</span> <span className="text-rose-400">*</span>
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsManagingStaff(!isManagingStaff)
                    if (isAddingStaff) setIsAddingStaff(false)
                  }}
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-lg border flex items-center gap-1 transition-all active:scale-95",
                    isManagingStaff 
                      ? "bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 bg-slate-800/60 border-slate-700/60"
                  )}
                  title="จัดการหรือลบชื่อด่วน"
                >
                  <Trash2 size={11} className={isManagingStaff ? "text-rose-400" : "text-slate-400"} />
                  <span>{isManagingStaff ? 'เสร็จสิ้น' : 'ลบชื่อด่วน'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingStaff(!isAddingStaff)
                    if (isManagingStaff) setIsManagingStaff(false)
                  }}
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
                  onClick={() => {
                    if (isManagingStaff) {
                      if (window.confirm(`ต้องการลบชื่อด่วน "${name}" ออกจากระบบใช่หรือไม่?`)) {
                        removeOption('staff', name)
                        if (watchSenderStaff === name) {
                          setValue('sender_staff_name', '')
                        }
                      }
                    } else {
                      setValue('sender_staff_name', name)
                    }
                  }}
                  className={cn(
                    'text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all active:scale-95 flex items-center gap-1',
                    isManagingStaff
                      ? 'bg-rose-950/40 text-rose-300 border-rose-500/50 hover:bg-rose-900/60'
                      : watchSenderStaff === name
                        ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                        : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white'
                  )}
                  title={isManagingStaff ? `แตะเพื่อลบ "${name}"` : undefined}
                >
                  <span>{name}</span>
                  {isManagingStaff && (
                    <span className="w-3.5 h-3.5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] ml-0.5 leading-none">
                      ×
                    </span>
                  )}
                </button>
              ))}
            </div>

            {isManagingStaff && (
              <p className="text-[11px] text-rose-300 bg-rose-950/30 border border-rose-500/20 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 animate-in fade-in duration-150">
                <span>⚠️</span>
                <span>โหมดลบชื่อ: แตะที่ชื่อที่ต้องการลบเพื่อยืนยันนำชื่อออก</span>
              </p>
            )}

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

        {/* Remarks & Notes */}
        <div className="bg-slate-900/75 border border-white/10 rounded-2xl p-4 space-y-3 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-300">หมายเหตุ (ถ้ามี)</h2>
            <div className="flex items-center gap-2">
              {watchRemarkBase && (
                <button
                  type="button"
                  onClick={() => setValue('remark_base', '')}
                  className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/20 flex items-center gap-1 active:scale-95 transition-all"
                >
                  <X size={11} /> ล้างออก (เว้นว่างไว้)
                </button>
              )}
              <span className="text-[10px] text-slate-500">แตะเพื่อเลือก หรือ แตะซ้ำเพื่อยกเลิก</span>
            </div>
          </div>

          {/* Quick Remark Pills */}
          <div className="flex flex-wrap gap-1.5">
            {remarkOptions.map(rem => {
              const isSelected = watchRemarkBase === rem
              return (
                <button
                  key={rem}
                  type="button"
                  onClick={() => setValue('remark_base', isSelected ? '' : rem)}
                  className={cn(
                    'text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all active:scale-95 flex items-center gap-1',
                    isSelected
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                      : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                  )}
                >
                  <span>{rem}</span>
                  {isSelected && <X size={10} className="text-amber-300/70" />}
                </button>
              )
            })}
          </div>

          <textarea
            {...register('notes')}
            rows={2}
            placeholder="พิมพ์หมายเหตุเพิ่มเติมได้อิสระ... (ถ้าไม่ระบุจะเว้นว่างไว้)"
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
              className="w-full bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-50 disabled:pointer-events-none text-white font-bold py-3.5 sm:py-4 px-3 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-cyan-500/20 text-xs sm:text-sm cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin w-5 h-5 text-white shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>กำลังบันทึกรายการ... (ห้ามกดซ้ำ)</span>
                </>
              ) : (
                <>
                  <Truck size={18} className="shrink-0" />
                  <span className="text-center">บันทึกและฝากของไปกับรถแล้ว (รอปลายทางรับ)</span>
                  <ArrowRight size={16} className="shrink-0" />
                </>
              )}
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:pointer-events-none text-white font-bold py-3.5 sm:py-4 px-3 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-500/20 text-xs sm:text-sm cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin w-5 h-5 text-white shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>กำลังบันทึกรายการ... (ห้ามกดซ้ำ)</span>
                </>
              ) : (
                <>
                  <Save size={18} className="shrink-0" />
                  <span className="text-center">บันทึกรายการ (รอฝากไปกับรถ)</span>
                </>
              )}
            </button>
          )}
        </div>
      </form>

      {/* Fullscreen Overlay while submitting to strictly prevent any repeated clicks */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 select-none">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <h3 className="text-sm font-bold text-white">กำลังบันทึกรายการส่งของ...</h3>
            <p className="text-xs text-slate-400">ระบบกำลังส่งข้อมูลขึ้นคลาวด์และแจ้งเตือน กรุณาอย่ากดส่งซ้ำ</p>
          </div>
        </div>
      )}
    </div>
  )
}
