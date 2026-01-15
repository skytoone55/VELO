'use client'

import { createContext, useContext, ReactNode } from 'react'
import { UserRole } from '@/lib/types/database'

export interface AdminUser {
  id: string
  email: string
  role: UserRole
  nom: string
  prenom: string
  territoire?: string | null
  depot_id?: string | null
  actif: boolean
}

const AdminUserContext = createContext<AdminUser | null>(null)

export function AdminUserProvider({
  children,
  user
}: {
  children: ReactNode
  user: AdminUser
}) {
  return (
    <AdminUserContext.Provider value={user}>
      {children}
    </AdminUserContext.Provider>
  )
}

export function useAdminUser() {
  const context = useContext(AdminUserContext)
  if (context === null) {
    throw new Error('useAdminUser must be used within an AdminUserProvider')
  }
  return context
}
