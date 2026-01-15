import { UserRole, Departement } from '@/lib/types/database'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  nom?: string | null
  prenom?: string | null
  territoire?: Departement | null
  depot_id?: string | null
  actif: boolean
}

export interface AuthSession {
  user: AuthUser
  accessToken: string
}

// Permissions par rôle
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin_general: [
    'view:all',
    'edit:all',
    'delete:all',
    'manage:users',
    'manage:depots',
    'view:all_territories',
    'sync:monday',
    'export:data',
  ],
  admin_regional: [
    'view:territory',
    'edit:territory',
    'manage:users:territory',
    'manage:depots:territory',
    'view:reports:territory',
    'export:data:territory',
  ],
  agent_regional: [
    'view:territory',
    'edit:clients:territory',
    'manage:livraisons:territory',
    'view:reports:territory',
  ],
  agent_depot: [
    'view:depot',
    'edit:livraisons:depot',
    'manage:stock:depot',
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

// Hiérarchie des rôles (pour vérifier si un rôle peut en gérer un autre)
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin_general: 100,
  admin_regional: 80,
  agent_regional: 60,
  agent_depot: 40,
  livreur: 20,
  client: 10,
}

// Routes par défaut après connexion
export const DEFAULT_ROUTES: Record<UserRole, string> = {
  admin_general: '/admin/dashboard',
  admin_regional: '/admin/dashboard',
  agent_regional: '/admin/clients',
  agent_depot: '/admin/depot',
  livreur: '/admin/livraisons',
  client: '/client/dashboard',
}

// Routes protégées par rôle minimum
export const PROTECTED_ROUTES: { path: string; minRole: UserRole }[] = [
  { path: '/admin', minRole: 'livreur' },
  { path: '/admin/users', minRole: 'admin_regional' },
  { path: '/admin/depots', minRole: 'admin_regional' },
  { path: '/admin/settings', minRole: 'admin_general' },
  { path: '/admin/sync', minRole: 'admin_general' },
  { path: '/client', minRole: 'client' },
]
