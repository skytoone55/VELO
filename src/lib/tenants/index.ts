/**
 * Module Multi-Tenant
 *
 * Fournit les fonctions pour récupérer la configuration du tenant actif.
 * Le tenant est déterminé par la variable d'environnement NEXT_PUBLIC_TENANT_ID
 */

import { TENANTS, DEFAULT_TENANT, type TenantId, type TenantConfig } from './config'

/**
 * Récupère l'ID du tenant actif depuis les variables d'environnement
 */
export function getTenantId(): TenantId {
  const rawTenantId = process.env.NEXT_PUBLIC_TENANT_ID
  const tenantId = (rawTenantId?.trim() || undefined) as TenantId | undefined

  if (!tenantId || !TENANTS[tenantId]) {
    console.warn(
      `[Tenant] NEXT_PUBLIC_TENANT_ID non défini ou invalide ("${tenantId}"). ` +
        `Utilisation du tenant par défaut: "${DEFAULT_TENANT}"`
    )
    return DEFAULT_TENANT
  }

  return tenantId
}

/**
 * Récupère la configuration complète du tenant actif
 */
export function getTenantConfig(): TenantConfig {
  const tenantId = getTenantId()
  return TENANTS[tenantId]
}

/**
 * Récupère une configuration spécifique d'un tenant par son ID
 */
export function getTenantConfigById(tenantId: TenantId): TenantConfig {
  return TENANTS[tenantId]
}

/**
 * Vérifie si un tenant existe
 */
export function isValidTenant(tenantId: string): tenantId is TenantId {
  return tenantId.trim() in TENANTS
}

/**
 * Retourne la liste de tous les tenants disponibles
 */
export function getAllTenants(): TenantConfig[] {
  return Object.values(TENANTS)
}

/**
 * Retourne la liste des IDs de tous les tenants
 */
export function getAllTenantIds(): TenantId[] {
  return Object.keys(TENANTS) as TenantId[]
}

// Réexporte les types et constantes utiles
export type { TenantId, TenantConfig }
export { TENANTS, DEFAULT_TENANT }
