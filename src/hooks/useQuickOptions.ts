import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { COMMON_STAFF, COMMON_REMARKS } from '../data/applicatorMaster'
import toast from 'react-hot-toast'

export interface QuickOption {
  id?: string
  category: 'staff' | 'remark'
  value: string
}

export function useQuickOptions() {
  const qc = useQueryClient()

  // ดึงรายการตัวเลือกจาก Supabase (ถ้ายังไม่มีหรือมีปัญหาให้ใช้ค่าเริ่มต้น)
  const { data, isLoading } = useQuery<{ staff: string[]; remarks: string[] }>({
    queryKey: ['quick_options'],
    queryFn: async () => {
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

        // รวมทั้ง COMMON_STAFF และรายการที่บันทึกเพิ่มใน DB เข้าด้วยกันทั้งหมด
        const allStaff = Array.from(new Set([...COMMON_STAFF, ...staffList]))
        const allRemarks = Array.from(new Set([...COMMON_REMARKS, ...remarkList]))

        return {
          staff: allStaff,
          remarks: allRemarks,
        }
      } catch (err) {
        console.warn('Fallback to local quick options:', err)
        return {
          staff: COMMON_STAFF,
          remarks: COMMON_REMARKS,
        }
      }
    },
    staleTime: 60 * 1000,
  })

  // เพิ่มตัวเลือกใหม่
  const addMutation = useMutation({
    mutationFn: async ({ category, value }: { category: 'staff' | 'remark'; value: string }) => {
      const cleanVal = value.trim()
      if (!cleanVal) return

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
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['quick_options'] })
      toast.success(`เพิ่ม ${variables.category === 'staff' ? 'ชื่อ' : 'หมายเหตุ'} "${variables.value}" สำเร็จ`)
    },
    onError: (err: any) => {
      toast.error(`ไม่สามารถเพิ่มได้: ${err.message}`)
    },
  })

  // ลบตัวเลือก
  const removeMutation = useMutation({
    mutationFn: async ({ category, value }: { category: 'staff' | 'remark'; value: string }) => {
      const { error } = await supabase
        .from('quick_options')
        .delete()
        .eq('category', category)
        .eq('value', value)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['quick_options'] })
      toast.success(`ลบ "${variables.value}" ออกแล้ว`)
    },
    onError: (err: any) => {
      toast.error(`ไม่สามารถลบได้: ${err.message}`)
    },
  })

  return {
    staffOptions: data?.staff || COMMON_STAFF,
    remarkOptions: data?.remarks || COMMON_REMARKS,
    isLoading,
    addOption: (category: 'staff' | 'remark', value: string) => addMutation.mutateAsync({ category, value }),
    removeOption: (category: 'staff' | 'remark', value: string) => removeMutation.mutateAsync({ category, value }),
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
  }
}
