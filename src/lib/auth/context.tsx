'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthUser } from './types'
import { UserRole } from '@/lib/types/database'
import { User as SupabaseUser } from '@supabase/supabase-js'

interface AuthContextType {
  user: AuthUser | null
  supabaseUser: SupabaseUser | null
  loading: boolean
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUserProfile = useCallback(async (supabaseUserId: string) => {
    const supabase = createClient()

    const { data: profile, error } = await supabase
      .from('users_profile')
      .select('*')
      .eq('id', supabaseUserId)
      .single()

    if (error || !profile) {
      return null
    }

    return {
      id: profile.id,
      email: profile.email,
      role: profile.role as UserRole,
      nom: profile.nom,
      prenom: profile.prenom,
      territoire: profile.territoire as AuthUser['territoire'],
      depot_id: profile.depot_id,
      actif: profile.actif ?? true,
    }
  }, [])

  const refreshUser = useCallback(async () => {
    const supabase = createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()

    if (currentUser) {
      setSupabaseUser(currentUser)
      const profile = await fetchUserProfile(currentUser.id)
      setUser(profile)
    } else {
      setSupabaseUser(null)
      setUser(null)
    }
  }, [fetchUserProfile])

  useEffect(() => {
    const supabase = createClient()

    // Récupérer la session initiale
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        setSupabaseUser(session.user)
        const profile = await fetchUserProfile(session.user.id)
        setUser(profile)
      }

      setLoading(false)
    }

    initAuth()

    // Écouter les changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          setSupabaseUser(session.user)
          const profile = await fetchUserProfile(session.user.id)
          setUser(profile)
        } else if (event === 'SIGNED_OUT') {
          setSupabaseUser(null)
          setUser(null)
        } else if (event === 'USER_UPDATED' && session?.user) {
          const profile = await fetchUserProfile(session.user.id)
          setUser(profile)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [fetchUserProfile])

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    setSupabaseUser(null)
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <AuthContext.Provider value={{ user, supabaseUser, loading, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
