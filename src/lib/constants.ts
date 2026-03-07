/**
 * Constantes globales de l'application
 * Centralise toutes les valeurs hardcodées pour une maintenance facile
 *
 * MULTI-TENANT: Les valeurs spécifiques au tenant sont dans /lib/tenants/config.ts
 */

import { getTenantConfig } from '@/lib/tenants'

// =================================================================
// CONTACT SUPPORT (dynamique selon le tenant)
// =================================================================
// Note: Utiliser getTenantConfig() pour accéder aux infos de contact
// Exemple: const tenant = getTenantConfig(); tenant.email, tenant.phone
// SUPPORT est conservé pour la rétrocompatibilité mais utilise le tenant actif
export const SUPPORT = {
  get phone() {
    return getTenantConfig().phone
  },
  get phoneFormatted() {
    return getTenantConfig().phoneFormatted
  },
  get email() {
    return getTenantConfig().email
  },
} as const

// =================================================================
// VALIDATION FORMULAIRE
// =================================================================
export const FORM_VALIDATION = {
  // Nombre maximum de tentatives pour le code ENEMAT
  maxEnemtAttempts: 3,
  // Longueur du code ENEMAT
  codeEnemtLength: 10,
  // Durée de validité du token formulaire (en heures)
  tokenValidityHours: 48,
} as const

// =================================================================
// PAGINATION
// =================================================================
export const PAGINATION = {
  defaultPageSize: 20,
  maxPageSize: 500,
  minPage: 1,
} as const

// =================================================================
// SYNCHRONISATION MONDAY
// =================================================================
export const MONDAY_SYNC = {
  // Intervalle de synchronisation (en ms)
  syncInterval: 5 * 60 * 1000, // 5 minutes
  // Nombre maximum de retries
  maxRetries: 3,
  // Délai entre les retries (en ms)
  retryDelay: 1000,
  // Nombre d'items par batch
  batchSize: 100,
  // Délai entre les requêtes batch (en ms)
  batchDelay: 100,
  // Limite d'items par requête Monday
  mondayPageSize: 500,
} as const

// =================================================================
// RÔLES UTILISATEURS
// =================================================================
export const USER_ROLES = {
  super_admin: 'Super Admin',
  admin: 'Administrateur',
  agent_secteur: 'Agent Secteur',
  livreur: 'Livreur',
  client: 'Client',
} as const

export type UserRole = keyof typeof USER_ROLES

// =================================================================
// TERRITOIRES
// =================================================================
export const TERRITOIRES = {
  FR: 'France métropolitaine',
  '971': 'Guadeloupe',
  '972': 'Martinique',
  '973': 'Guyane',
  '974': 'La Réunion',
  '976': 'Mayotte',
} as const

export type Territoire = keyof typeof TERRITOIRES

// =================================================================
// STATUTS LIVRAISON
// =================================================================
export const DELIVERY_STATUS = {
  en_attente: 'En attente',
  programmee: 'Programmée',
  en_cours: 'En cours',
  livree: 'Livrée',
  annulee: 'Annulée',
} as const

export type DeliveryStatus = keyof typeof DELIVERY_STATUS

// =================================================================
// STATUTS FORMULAIRE
// =================================================================
export const FORM_STATUS = {
  en_attente: 'En attente',
  formulaire_envoye: 'Formulaire envoyé',
  formulaire_en_cours: 'Formulaire en cours',
  formulaire_complete: 'Formulaire complété',
  formulaire_valide: 'Formulaire validé',
} as const

export type FormStatus = keyof typeof FORM_STATUS

// =================================================================
// ZONES DE LIVRAISON
// =================================================================
export const DELIVERY_ZONES = {
  gratuit: 'Zone gratuite',
  payant: 'Zone payante',
  hors_zone: 'Hors zone',
} as const

export type DeliveryZone = keyof typeof DELIVERY_ZONES

// =================================================================
// MODES DE LIVRAISON
// =================================================================
export const DELIVERY_MODES = {
  retrait: 'Retrait en dépôt',
  livraison_gratuite: 'Livraison gratuite',
  livraison_payante: 'Livraison payante',
} as const

export type DeliveryMode = keyof typeof DELIVERY_MODES

// =================================================================
// COULEURS PAR RÔLE (pour les badges)
// =================================================================
export const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-purple-100 text-purple-800',
  admin: 'bg-indigo-100 text-indigo-800',
  agent_secteur: 'bg-blue-100 text-blue-800',
  livreur: 'bg-teal-100 text-teal-800',
  client: 'bg-gray-100 text-gray-800',
}

// =================================================================
// VALIDATION HELPERS
// =================================================================

/**
 * Valide et normalise les paramètres de pagination
 */
export function validatePagination(page: number | string, pageSize: number | string): { page: number; pageSize: number } {
  let validPage = typeof page === 'string' ? parseInt(page, 10) : page
  let validPageSize = typeof pageSize === 'string' ? parseInt(pageSize, 10) : pageSize

  // Appliquer les limites
  if (isNaN(validPage) || validPage < PAGINATION.minPage) {
    validPage = PAGINATION.minPage
  }
  if (isNaN(validPageSize) || validPageSize < 1) {
    validPageSize = PAGINATION.defaultPageSize
  }
  if (validPageSize > PAGINATION.maxPageSize) {
    validPageSize = PAGINATION.maxPageSize
  }

  return { page: validPage, pageSize: validPageSize }
}
