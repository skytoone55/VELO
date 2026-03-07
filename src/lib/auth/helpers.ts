import { AuthUser, ROLE_HIERARCHY, ROLE_PERMISSIONS, DEFAULT_ROUTES, PROTECTED_ROUTES } from './types'
import { UserRole } from '@/lib/types/database'

/**
 * Vérifie si l'utilisateur a une permission spécifique
 */
export function hasPermission(user: AuthUser, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[user.role]

  // super_admin a accès à tout
  if (user.role === 'super_admin') return true

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
 * Retourne les rôles qu'un utilisateur peut créer (strictement inférieurs)
 */
export function creatableRoles(creatorRole: UserRole): UserRole[] {
  const creatorLevel = ROLE_HIERARCHY[creatorRole]
  return (Object.keys(ROLE_HIERARCHY) as UserRole[])
    .filter(r => r !== 'client' && ROLE_HIERARCHY[r] < creatorLevel)
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
  const protectedRoute = PROTECTED_ROUTES.find(route => path.startsWith(route.path))

  if (!protectedRoute) {
    return true
  }

  return ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[protectedRoute.minRole]
}

/**
 * Vérifie si l'utilisateur peut voir un territoire spécifique
 */
export function canAccessTerritory(user: AuthUser, territory: string): boolean {
  if (user.role === 'super_admin' || user.role === 'admin') return true
  return user.territoire === territory
}

/**
 * Vérifie si l'utilisateur peut voir un dépôt spécifique
 */
export function canAccessDepot(user: AuthUser, depotId: string): boolean {
  if (['super_admin', 'admin'].includes(user.role)) return true
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
    super_admin: 'Super Admin',
    admin: 'Administrateur',
    agent_secteur: 'Agent Secteur',
    livreur: 'Livreur',
    client: 'Client',
  }
  return labels[role] || role
}
