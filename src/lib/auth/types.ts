import { UserRole, Departement } from '@/lib/types/database'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  is_super_admin: boolean
  nom?: string | null
  prenom?: string | null
  territoire?: Departement | null
  departement?: string | null
  depot_ids?: string[] | null
  actif: boolean
}

export interface AuthSession {
  user: AuthUser
  accessToken: string
}

// Permissions par rôle
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: [
    'view:all',
    'edit:all',
    'delete:all',
    'manage:users',
    'manage:depots',
    'view:all_territories',
    'sync:monday',
    'export:data',
  ],
  admin: [
    'view:all',
    'edit:all',
    'manage:users',
    'view:all_territories',
    'export:data',
  ],
  agent_secteur: [
    'view:territory',
    'edit:clients:territory',
    'manage:livraisons:territory',
    'view:reports:territory',
  ],
  livreur: [
    'view:livraisons:assigned',
    'edit:livraisons:assigned',
    'upload:photos',
    'collect:signature',
  ],
  client: [
    'view:own_data',
    'edit:own_profile',
    'submit:form',
    'view:livraisons:own',
  ],
}

// Hiérarchie des rôles
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  super_admin: 100,
  admin: 80,
  agent_secteur: 60,
  livreur: 20,
  client: 10,
}

// Routes par défaut après connexion
export const DEFAULT_ROUTES: Record<UserRole, string> = {
  super_admin: '/admin/dashboard',
  admin: '/admin/dashboard',
  agent_secteur: '/admin/clients',
  livreur: '/admin/livraisons',
  client: '/client/dashboard',
}

// Routes protégées par rôle minimum
export const PROTECTED_ROUTES: { path: string; minRole: UserRole }[] = [
  { path: '/admin', minRole: 'livreur' },
  { path: '/admin/users', minRole: 'admin' },
  { path: '/admin/depots', minRole: 'super_admin' },
  { path: '/admin/settings', minRole: 'super_admin' },
  { path: '/admin/sync', minRole: 'super_admin' },
  { path: '/client', minRole: 'client' },
]
