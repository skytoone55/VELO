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

    // Utiliser des champs spécifiques au lieu de '*'
    const { data: profile, error } = await supabase
      .from('users_profile')
      .select('id, email, role, nom, prenom, territoire, depot_id, actif')
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
    let mounted = true

    // Récupérer la session initiale
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user && mounted) {
        setSupabaseUser(session.user)
        const profile = await fetchUserProfile(session.user.id)
        if (mounted) {
          setUser(profile)
        }
      }

      if (mounted) {
        setLoading(false)
      }
    }

    initAuth()

    // Écouter les changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (event === 'SIGNED_IN' && session?.user) {
          setSupabaseUser(session.user)
          const profile = await fetchUserProfile(session.user.id)
          if (mounted) {
            setUser(profile)
          }
        } else if (event === 'SIGNED_OUT') {
          setSupabaseUser(null)
          setUser(null)
        } else if (event === 'USER_UPDATED' && session?.user) {
          const profile = await fetchUserProfile(session.user.id)
          if (mounted) {
            setUser(profile)
          }
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchUserProfile])

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    setSupabaseUser(null)
    // IMPORTANT: Pas de router.refresh() ici - cela causait une boucle infinie !
    // Le push vers /auth/login suffit
    router.push('/auth/login')
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
