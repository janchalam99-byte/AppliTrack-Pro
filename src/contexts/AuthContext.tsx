import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { useAppStore } from '../store/appStore'
import type { Profile } from '../types/database'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  isConfigured: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const { setUser: setStoreUser, fetchLocations, fetchUnreadCount } = useAppStore()

  const fetchProfile = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (data) {
        setStoreUser(data)
      }
      return data
    } catch {
      return null
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    // Get initial session with fallback timeout
    const timeout = setTimeout(() => {
      setLoading(false)
    }, 5000)

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeout)
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          fetchProfile(session.user.id).then(() => {
            fetchLocations().catch(() => {})
            fetchUnreadCount().catch(() => {})
            setLoading(false)
          }).catch(() => setLoading(false))
        } else {
          setLoading(false)
        }
      })
      .catch((err) => {
        clearTimeout(timeout)
        console.warn('Supabase session load error:', err)
        setLoading(false)
      })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchProfile(session.user.id)
          fetchLocations().catch(() => {})
          fetchUnreadCount().catch(() => {})
        } else {
          setStoreUser(null)
        }
      }
    )

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setStoreUser(null)
  }

  const profile = useAppStore((s) => s.user)

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, isConfigured: isSupabaseConfigured, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
