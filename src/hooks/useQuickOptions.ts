import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { COMMON_STAFF, COMMON_REMARKS } from '../data/applicatorMaster'
import { safeJsonParse, sanitizeString } from '../lib/safety'
import toast from 'react-hot-toast'

export interface QuickOption {
  id?: string
  category: 'staff' | 'remark'
  value: string
}

const DELETED_STORAGE_KEY = 'applitrack_deleted_quick_options_v1'

interface DeletedOptionsState {
  staff: string[]
  remark: string[]
}

function getDeletedOptions(): DeletedOptionsState {
  if (typeof window === 'undefined') return { staff: [], remark: [] }
  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY)
    const parsed = safeJsonParse<any>(raw, {})
    return {
      staff: Array.isArray(parsed?.staff) ? parsed.staff : [],
      remark: Array.isArray(parsed?.remark) ? parsed.remark : [],
    }
  } catch (e) {
    console.error('Failed to load deleted quick options from localStorage', e)
    return { staff: [], remark: [] }
  }
}

function saveDeletedOption(category: 'staff' | 'remark', value: string) {
  try {
    if (typeof window === 'undefined') return
    const clean = sanitizeString(value, 60)
    if (!clean) return
    const current = getDeletedOptions()
    if (!current[category].includes(clean)) {
      current[category].push(clean)
      localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(current))
    }
  } catch (e) {
    console.error('Failed to save deleted quick option', e)
  }
}

function unmarkDeletedOption(category: 'staff' | 'remark', value: string) {
  try {
    if (typeof window === 'undefined') return
    const clean = sanitizeString(value, 60)
    const current = getDeletedOptions()
    current[category] = current[category].filter(v => v !== clean)
    localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(current))
  } catch (e) {
    console.error('Failed to unmark deleted quick option', e)
  }
}

export function useQuickOptions() {
  const qc = useQueryClient()

  // ดึงรายการตัวเลือกจาก Supabase และกรองรายการที่ถูกลบออก
  const { data, isLoading } = useQuery<{ staff: string[]; remarks: string[] }>({
    queryKey: ['quick_options'],
    queryFn: async () => {
      const deleted = getDeletedOptions()
      try {
        const { data: rows, error } = await supabase
          .from('quick_options')
          .select('category, value')
          .order('sort_order', { ascending: true })

        if (error) throw error

        const staffList: string[] = []
        const remarkList: string[] = []

        rows?.forEach(r => {
          if (r.category === 'staff' && !staffList.includes(r.value)) staffList.push(r.value)
          if (r.category === 'remark' && !remarkList.includes(r.value)) remarkList.push(r.value)
        })

        // ถ้าใน DB มีข้อมูล staff ให้ยึดจาก DB เป็นหลัก (ไม่นำ COMMON_STAFF ที่เคยลบไปกลับมา)
        // ถ้า DB ยังว่างอยู่ (เปิดใช้ครั้งแรก) ให้ใช้ COMMON_STAFF เป็นค่าเริ่มต้น
        let finalStaff: string[]
        if (staffList.length > 0) {
          finalStaff = staffList
        } else {
          finalStaff = COMMON_STAFF
        }

        // สำหรับหมายเหตุ: รวมรายการหมายเหตุจาก DB และรายการเริ่มต้นที่ไม่เคยถูกลบ
        let finalRemarks: string[]
        if (remarkList.length > 0) {
          const remainingCommonRemarks = COMMON_REMARKS.filter(r => !deleted.remark.includes(r))
          finalRemarks = Array.from(new Set([...remainingCommonRemarks, ...remarkList]))
        } else {
          finalRemarks = COMMON_REMARKS
        }

        // กรองรายการที่ผู้ใช้กดลบออกทั้ง staff และ remarks
        const activeStaff = finalStaff.filter(name => !deleted.staff.includes(name))
        const activeRemarks = finalRemarks.filter(rem => !deleted.remark.includes(rem))

        return {
          staff: activeStaff,
          remarks: activeRemarks,
        }
      } catch (err) {
        console.warn('Fallback to local quick options:', err)
        return {
          staff: COMMON_STAFF.filter(s => !deleted.staff.includes(s)),
          remarks: COMMON_REMARKS.filter(r => !deleted.remark.includes(r)),
        }
      }
    },
    staleTime: 60 * 1000,
  })

  // เพิ่มตัวเลือกใหม่
  const addMutation = useMutation({
    onMutate: async ({ category, value }) => {
      const cleanVal = sanitizeString(value, 60)
      if (!cleanVal) return

      unmarkDeletedOption(category, cleanVal)

      // Optimistic update
      await qc.cancelQueries({ queryKey: ['quick_options'] })
      const previous = qc.getQueryData<{ staff: string[]; remarks: string[] }>(['quick_options'])
      if (previous) {
        const key = category === 'staff' ? 'staff' : 'remarks'
        if (!previous[key].includes(cleanVal)) {
          qc.setQueryData(['quick_options'], {
            ...previous,
            [key]: [...previous[key], cleanVal],
          })
        }
      }
      return { previous }
    },
    mutationFn: async ({ category, value }: { category: 'staff' | 'remark'; value: string }) => {
      const cleanVal = sanitizeString(value, 60)
      if (!cleanVal) return

      unmarkDeletedOption(category, cleanVal)

      const { error } = await supabase
        .from('quick_options')
        .insert({
          category,
          value: cleanVal,
          sort_order: 999,
        })

      if (error && error.code !== '23505') { // ignore duplicate unique constraint
        throw error
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['quick_options'] })
    },
    onSuccess: (_, variables) => {
      toast.success(`เพิ่ม ${variables.category === 'staff' ? 'ชื่อ' : 'หมายเหตุ'} "${variables.value}" สำเร็จ`)
    },
    onError: (err: any, _, context) => {
      if (context?.previous) {
        qc.setQueryData(['quick_options'], context.previous)
      }
      toast.error(`ไม่สามารถเพิ่มได้: ${err.message}`)
    },
  })

  // ลบตัวเลือก
  const removeMutation = useMutation({
    onMutate: async ({ category, value }) => {
      const cleanVal = sanitizeString(value, 60)
      if (!cleanVal) return
      saveDeletedOption(category, cleanVal)

      // Optimistic update: ลบออกจากหน้าจอทันที ไม่ต้องรอนาน
      await qc.cancelQueries({ queryKey: ['quick_options'] })
      const previous = qc.getQueryData<{ staff: string[]; remarks: string[] }>(['quick_options'])
      if (previous) {
        const key = category === 'staff' ? 'staff' : 'remarks'
        qc.setQueryData(['quick_options'], {
          ...previous,
          [key]: previous[key].filter(item => item !== cleanVal),
        })
      }
      return { previous }
    },
    mutationFn: async ({ category, value }: { category: 'staff' | 'remark'; value: string }) => {
      const cleanVal = sanitizeString(value, 60)
      if (!cleanVal) return
      saveDeletedOption(category, cleanVal)

      const { error } = await supabase
        .from('quick_options')
        .delete()
        .eq('category', category)
        .eq('value', cleanVal)

      if (error) {
        // แม้ใน DB จะไม่มีแถวนี้ (เช่น เป็นค่า default เริ่มต้น) บันทึกใน localStorage สำเร็จแล้ว
        console.warn('Supabase delete option warning:', error)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['quick_options'] })
    },
    onSuccess: (_, variables) => {
      toast.success(`ลบ "${variables.value}" ออกแล้ว`, { id: `del-${variables.value}` })
    },
    onError: (err: any) => {
      toast.error(`ไม่สามารถลบได้: ${err.message}`)
    },
  })

  const deleted = getDeletedOptions()
  const fallbackStaff = COMMON_STAFF.filter(s => !deleted.staff.includes(s))
  const fallbackRemarks = COMMON_REMARKS.filter(r => !deleted.remark.includes(r))

  return {
    staffOptions: data?.staff || fallbackStaff,
    remarkOptions: data?.remarks || fallbackRemarks,
    isLoading,
    addOption: (category: 'staff' | 'remark', value: string) => addMutation.mutateAsync({ category, value }),
    removeOption: (category: 'staff' | 'remark', value: string) => removeMutation.mutateAsync({ category, value }),
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
  }
}

