import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface ToolMovementEvent {
  requestId: string
  requestNumber: string
  type: 'transfer' | 'loan'
  status: string
  fromLocationName: string
  toLocationName: string
  senderStaffName: string
  date: string
  notes?: string
  itemName: string
  itemDescription?: string
  photos: { publicUrl: string; stage: string }[]
}

export interface ToolJourneyData {
  appNo: string
  terminalName: string
  maker?: string
  terMaker?: string
  model?: string
  serial?: string
  baseLocation?: string
  currentLocation: string
  currentCustodian: string
  totalTrips: number
  lastUpdated?: string
  isCurrentlyInTransit: boolean
  isCurrentlyLoaned: boolean
  timeline: ToolMovementEvent[]
}

export function useToolJourney(searchQuery: string) {
  return useQuery({
    queryKey: ['tool-journey', searchQuery],
    queryFn: async (): Promise<ToolJourneyData | null> => {
      const q = searchQuery.trim()
      if (!q) return null

      // 1. Fetch master info if available
      const { data: masterList } = await supabase
        .from('applicator_master')
        .select('*')
        .or(`app_no.ilike.%${q}%,terminal_name.ilike.%${q}%`)
        .limit(1)

      const master = masterList && masterList.length > 0 ? masterList[0] : null
      const targetAppNo = master?.app_no || q
      const targetTermName = master?.terminal_name || q

      // 2. Fetch all transfer request items matching this app_no or terminal_name
      const { data: items, error } = await supabase
        .from('transfer_request_items')
        .select(`
          id,
          name,
          description,
          notes,
          request:transfer_requests!transfer_request_items_request_id_fkey(
            id,
            request_number,
            type,
            status,
            sender_staff_name,
            notes,
            created_at,
            updated_at,
            from_location:locations!transfer_requests_from_location_id_fkey(name),
            to_location:locations!transfer_requests_to_location_id_fkey(name),
            photos:item_photos(public_url, photo_stage)
          )
        `)
        .or(`name.ilike.%${targetAppNo}%,description.ilike.%${targetTermName}%,name.ilike.%${targetTermName}%`)
        .order('id', { ascending: false })

      if (error) {
        console.error('Error fetching tool journey items:', error)
      }

      // Map timeline movements
      const timeline: ToolMovementEvent[] = []
      const seenRequestIds = new Set<string>()

      if (items) {
        for (const it of items) {
          const req: any = it.request
          if (!req || seenRequestIds.has(req.id)) continue
          seenRequestIds.add(req.id)

          timeline.push({
            requestId: req.id,
            requestNumber: req.request_number || 'TR-REQ',
            type: req.type || 'transfer',
            status: req.status || 'completed',
            fromLocationName: req.from_location?.name || 'ต้นทาง',
            toLocationName: req.to_location?.name || 'ปลายทาง',
            senderStaffName: req.sender_staff_name || '-',
            date: req.created_at,
            notes: req.notes || it.notes,
            itemName: it.name,
            itemDescription: it.description,
            photos: (req.photos || []).map((p: any) => ({
              publicUrl: p.public_url,
              stage: p.photo_stage,
            })),
          })
        }
      }

      // Sort timeline newest first
      timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      // Determine current location & custodian
      const latest = timeline.length > 0 ? timeline[0] : null
      let currentLocation = master?.base_location || 'HET 1'
      let currentCustodian = '-'
      let isCurrentlyInTransit = false
      let isCurrentlyLoaned = false

      if (latest) {
        currentCustodian = latest.senderStaffName
        if (latest.status === 'in_transit' || latest.status === 'ready_to_send') {
          currentLocation = `อยู่ระหว่างเดินทาง (${latest.fromLocationName} ➔ ${latest.toLocationName})`
          isCurrentlyInTransit = true
        } else if (latest.status === 'completed') {
          currentLocation = latest.toLocationName
        } else if (latest.type === 'loan' && latest.status !== 'return_completed') {
          currentLocation = `${latest.toLocationName} (ยืมใช้งาน)`
          isCurrentlyLoaned = true
        } else if (latest.status === 'return_completed') {
          currentLocation = latest.toLocationName
        } else {
          currentLocation = latest.toLocationName
        }
      }

      return {
        appNo: master?.app_no || q,
        terminalName: master?.terminal_name || targetTermName,
        maker: master?.maker,
        terMaker: master?.ter_maker,
        model: master?.model,
        serial: master?.serial,
        baseLocation: master?.base_location,
        currentLocation,
        currentCustodian,
        totalTrips: timeline.length,
        lastUpdated: latest?.date,
        isCurrentlyInTransit,
        isCurrentlyLoaned,
        timeline,
      }
    },
    enabled: Boolean(searchQuery.trim()),
    staleTime: 1000 * 30, // 30s
  })
}
