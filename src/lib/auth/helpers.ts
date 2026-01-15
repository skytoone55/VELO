import { AuthUser, ROLE_HIERARCHY, ROLE_PERMISSIONS, DEFAULT_ROUTES, PROTECTED_ROUTES } from './types'
import { UserRole } from '@/lib/types/database'

/**
 * Vérifie si l'utilisateur a une permission spécifique
 */
export function hasPermission(user: AuthUser, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[user.role]

  // admin_general a accès à tout
  if (user.role === 'admin_general') return true

  // Vérification exacte
  if (permissions.includes(permission)) return true

  // Vérification avec wildcard (ex: 'view:all' autorise 'view:clients')
  const [action] = permission.split(':')
  if (permissions.includes(`${action}:all`)) return true

  return false
}

/**
 * Vérifie si un rôle peut gérer un autre rôle
 */
export function canManageRole(managerRole: UserRole, targetRole: UserRole): boolean {
  return ROLE_HIERARCHY[managerRole] > ROLE_HIERARCHY[targetRole]
}

/**
 * Retourne la route par défaut pour un rôle
 */
export function getDefaultRoute(role: UserRole): string {
  return DEFAULT_ROUTES[role] || '/client/dashboard'
}

/**
 * Vérifie si l'utilisateur peut accéder à une route
 */
export function canAccessRoute(user: AuthUser, path: string): boolean {
  // Trouver la route protégée correspondante
  const protectedRoute = PROTECTED_ROUTES.find(route => path.startsWith(route.path))

  if (!protectedRoute) {
    // Route non protégée
    return true
  }

  // Vérifier le niveau de rôle
  return ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[protectedRoute.minRole]
}

/**
 * Vérifie si l'utilisateur peut voir un territoire spécifique
 */
export function canAccessTerritory(user: AuthUser, territory: string): boolean {
  // Admin général voit tout
  if (user.role === 'admin_general') return true

  // Les autres doivent être assignés au territoire
  return user.territoire === territory
}

/**
 * Vérifie si l'utilisateur peut voir un dépôt spécifique
 */
export function canAccessDepot(user: AuthUser, depotId: string): boolean {
  // Admin général et régional voient tout
  if (['admin_general', 'admin_regional'].includes(user.role)) return true

  // Les autres doivent être assignés au dépôt
  return user.depot_id === depotId
}

/**
 * Formate le nom complet de l'utilisateur
 */
export function getFullName(user: AuthUser): string {
  if (user.prenom && user.nom) {
    return `${user.prenom} ${user.nom}`
  }
  if (user.prenom) return user.prenom
  if (user.nom) return user.nom
  return user.email
}

/**
 * Retourne le label français pour un rôle
 */
export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    admin_general: 'Administrateur Général',
    admin_regional: 'Administrateur Régional',
    agent_regional: 'Agent Régional',
    agent_depot: 'Agent Dépôt',
    livreur: 'Livreur',
    client: 'Client',
  }
  return labels[role] || role
}
