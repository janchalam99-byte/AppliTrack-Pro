import { create } from 'zustand'
import type { Profile, Location } from '../types/database'
import { supabase } from '../lib/supabase'

interface AppState {
  user: Profile | null
  locations: Location[]
  unreadCount: number
  isLoading: boolean
  setUser: (user: Profile | null) => void
  setLocations: (locations: Location[]) => void
  setUnreadCount: (count: number) => void
  setLoading: (loading: boolean) => void
  fetchLocations: () => Promise<void>
  fetchUnreadCount: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  locations: [],
  unreadCount: 0,
  isLoading: false,

  setUser: (user) => set({ user }),
  setLocations: (locations) => set({ locations }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  setLoading: (isLoading) => set({ isLoading }),

  fetchLocations: async () => {
    const { data } = await supabase
      .from('locations')
      .select('*')
      .order('sort_order')
    if (data) set({ locations: data })
  },

  fetchUnreadCount: async () => {
    const user = get().user
    if (!user) return
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('is_read', false)
    set({ unreadCount: count ?? 0 })
  },
}))
