'use client'

import { createContext, useContext, ReactNode } from 'react'

export interface ClientUser {
  id: string
  email: string
  nom: string
  prenom: string
}

const ClientUserContext = createContext<ClientUser | null>(null)

export function ClientUserProvider({
  children,
  user,
}: {
  children: ReactNode
  user: ClientUser
}) {
  return (
    <ClientUserContext.Provider value={user}>
      {children}
    </ClientUserContext.Provider>
  )
}

export function useClientUser() {
  const context = useContext(ClientUserContext)
  if (context === null) {
    throw new Error('useClientUser must be used within a ClientUserProvider')
  }
  return context
}
