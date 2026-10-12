import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export interface MasterApplicator {
  id: string
  app_no: string
  raw_no?: string | null
  item_app?: string | null
  terminal_name: string
  maker?: string | null
  ter_maker?: string | null
  model?: string | null
  serial?: string | null
  base_location?: string | null
  created_at?: string
  updated_at?: string
}

export type NewMasterApplicator = Omit<MasterApplicator, 'id' | 'created_at' | 'updated_at'>

export function useMasterApplicators(search = '', page = 1, pageSize = 20) {
  const qc = useQueryClient()

  // Query master applicators with search and pagination
  const { data, isLoading, refetch, isFetching } = useQuery<{
    items: MasterApplicator[]
    totalCount: number
  }>({
    queryKey: ['master_applicators', search, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from('applicator_master')
        .select('*', { count: 'exact' })
        .order('app_no', { ascending: true })

      if (search.trim()) {
        const s = search.trim()
        query = query.or(`app_no.ilike.%${s}%,terminal_name.ilike.%${s}%,maker.ilike.%${s}%,ter_maker.ilike.%${s}%,serial.ilike.%${s}%`)
      }

      const from = (page - 1) * pageSize
      const to = from + pageSize - 1
      query = query.range(from, to)

      const { data: rows, count, error } = await query

      if (error) throw error

      return {
        items: rows || [],
        totalCount: count || 0,
      }
    },
    staleTime: 30 * 1000,
  })

  // Add new applicator
  const addMutation = useMutation({
    mutationFn: async (item: NewMasterApplicator) => {
      const cleanAppNo = item.app_no.trim()
      const cleanTerminal = item.terminal_name.trim()

      if (!cleanTerminal) {
        throw new Error('กรุณาระบุชื่อ Terminal Name')
      }

      const { data: inserted, error } = await supabase
        .from('applicator_master')
        .insert({
          app_no: cleanAppNo || '-',
          raw_no: cleanAppNo.replace(/^TW-/i, '') || null,
          terminal_name: cleanTerminal,
          maker: item.maker?.trim() || null,
          ter_maker: item.ter_maker?.trim() || null,
          model: item.model?.trim() || null,
          serial: item.serial?.trim() || null,
          base_location: item.base_location?.trim() || null,
        })
        .select()
        .single()

      if (error) throw error
      return inserted
    },
    onSuccess: (newItem) => {
      qc.invalidateQueries({ queryKey: ['master_applicators'] })
      toast.success(`เพิ่ม ${newItem.app_no} (${newItem.terminal_name}) เข้า Master สำเร็จ`)
    },
    onError: (err: any) => {
      toast.error(`ไม่สามารถเพิ่มได้: ${err.message}`)
    },
  })

  // Update applicator
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<NewMasterApplicator> }) => {
      const { data: updated, error } = await supabase
        .from('applicator_master')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return updated
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['master_applicators'] })
      toast.success(`อัปเดต ${updated.app_no} สำเร็จ`)
    },
    onError: (err: any) => {
      toast.error(`ไม่สามารถแก้ไขได้: ${err.message}`)
    },
  })

  // Delete applicator
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('applicator_master')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['master_applicators'] })
      toast.success('ลบข้อมูลออกจาก Master สำเร็จ')
    },
    onError: (err: any) => {
      toast.error(`ไม่สามารถลบได้: ${err.message}`)
    },
  })

  return {
    items: data?.items || [],
    totalCount: data?.totalCount || 0,
    isLoading,
    isFetching,
    refetch,
    addApplicator: addMutation.mutateAsync,
    updateApplicator: (id: string, updates: Partial<NewMasterApplicator>) =>
      updateMutation.mutateAsync({ id, updates }),
    deleteApplicator: deleteMutation.mutateAsync,
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
