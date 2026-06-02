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
  maxPageSize: 5000,
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
// STATUTS PROCESS (parcours client — 10 statuts)
// =================================================================
export const PROCESS_STATUTS = {
  controle_valide: 'Contrôle validé',
  formulaire_envoye: 'Formulaire envoyé',
  formulaire_valide: 'Formulaire validé',
  a_livrer: 'À livrer',
  en_livraison: 'En livraison',
  livre: 'Livré',
  probleme_livraison: 'Problème de livraison',
  a_relivrer: 'À relivrer',
  retractation: 'Rétractation',
  anomalie: 'Anomalie',
  client_hs: 'Client HS',
  rcs_ferme: 'RCS fermé',
} as const

export type ProcessStatut = keyof typeof PROCESS_STATUTS

// Couleurs par statut process (pour badges)
export const STATUT_COLORS: Record<ProcessStatut, string> = {
  controle_valide: 'bg-blue-100 text-blue-800',
  formulaire_envoye: 'bg-cyan-100 text-cyan-800',
  formulaire_valide: 'bg-emerald-100 text-emerald-800',
  a_livrer: 'bg-amber-100 text-amber-800',
  en_livraison: 'bg-orange-100 text-orange-800',
  livre: 'bg-green-100 text-green-800',
  probleme_livraison: 'bg-red-100 text-red-800',
  a_relivrer: 'bg-pink-100 text-pink-800',
  retractation: 'bg-gray-100 text-gray-800',
  anomalie: 'bg-rose-100 text-rose-800',
  client_hs: 'bg-red-600 text-white',
  rcs_ferme: 'bg-gray-800 text-white',
}

// Transitions autorisées entre statuts
export const STATUT_TRANSITIONS: Record<ProcessStatut, ProcessStatut[]> = {
  controle_valide: ['formulaire_envoye', 'retractation', 'anomalie'],
  formulaire_envoye: ['formulaire_valide', 'retractation', 'anomalie'],
  formulaire_valide: ['a_livrer', 'retractation', 'anomalie'],
  a_livrer: ['en_livraison', 'retractation', 'anomalie'],
  en_livraison: ['livre', 'probleme_livraison', 'retractation', 'anomalie'],
  livre: ['retractation', 'anomalie'],
  probleme_livraison: ['a_relivrer', 'retractation', 'anomalie'],
  a_relivrer: ['en_livraison', 'retractation', 'anomalie'],
  retractation: [],
  anomalie: [],
  client_hs: [],
  rcs_ferme: [],
}

// =================================================================
// ZONES DE LIVRAISON
// =================================================================
export const DELIVERY_ZONES = {
  gratuit: 'Zone gratuite',
  hors_zone: 'Hors zone',
} as const

export type DeliveryZone = keyof typeof DELIVERY_ZONES

// =================================================================
// MODES DE LIVRAISON
// =================================================================
export const DELIVERY_MODES = {
  retrait: 'Retrait en dépôt',
  livraison: 'Livraison à domicile',
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
// CONTROLE QUALITE POST-LIVRAISON
// =================================================================
export const CQ_CHECKS = {
  cq_piece_identite: { label: "Pièce d'identité", shortLine1: 'Pièce', shortLine2: "d'identité", description: "Pièce d'identité du bénéficiaire vérifiée" },
  cq_photo_enemat: { label: 'Photo ENEMAT', shortLine1: 'Photo', shortLine2: 'ENEMAT', description: 'Photo de la plaque ENEMAT présente' },
  cq_signature_installateur: { label: 'Signature installateur', shortLine1: 'Signature', shortLine2: 'installateur', description: "Signature de l'installateur présente" },
  cq_signature_client: { label: 'Signature client', shortLine1: 'Signature', shortLine2: 'client', description: 'Signature du client/bénéficiaire présente' },
  cq_fnuci: { label: 'N° FNUCI', shortLine1: 'N°', shortLine2: 'FNUCI', description: 'Enregistrement FNUCI effectué' },
  cq_velo: { label: 'NB vélo', shortLine1: 'NB', shortLine2: 'vélo', description: 'État du vélo vérifié conforme' },
} as const

export type CqCheckKey = keyof typeof CQ_CHECKS
export const CQ_CHECK_KEYS = Object.keys(CQ_CHECKS) as CqCheckKey[]

// Catégories (tags) posées manuellement sur un dossier pendant le contrôle qualité.
// Transitoires : visibles tant que le dossier est dans la file de contrôle.
export const CQ_CATEGORIES = {
  radie: 'Radié',
  naf: 'NAF',
  mail_client_recu: 'Mail client reçu',
  mail_enemat_sav: 'Mail enemat SAV',
  client_nrp: 'Client NRP',
  urgent: 'URGENT',
  a_refaire: 'À refaire',
  attente_signature: 'Attente signature',
  attente_photo: 'Attente photo',
  attente_mail_client: 'Attente mail client',
  velo_a_recuperer: 'Vélo à récupérer',
  velo_facture: 'Vélo facturé',
  autre: 'Autre',
} as const

export type CqCategorie = keyof typeof CQ_CATEGORIES
export const CQ_CATEGORIE_KEYS = Object.keys(CQ_CATEGORIES) as CqCategorie[]

// Couleurs par catégorie CQ (pour les badges)
export const CQ_CATEGORIE_COLORS: Record<CqCategorie, string> = {
  radie: 'bg-red-100 text-red-800',
  naf: 'bg-blue-100 text-blue-800',
  mail_client_recu: 'bg-green-100 text-green-800',
  mail_enemat_sav: 'bg-purple-100 text-purple-800',
  client_nrp: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-600 text-white',
  a_refaire: 'bg-green-600 text-white',
  attente_signature: 'bg-amber-100 text-amber-800',
  attente_photo: 'bg-cyan-100 text-cyan-800',
  attente_mail_client: 'bg-indigo-100 text-indigo-800',
  velo_a_recuperer: 'bg-rose-100 text-rose-800',
  velo_facture: 'bg-teal-100 text-teal-800',
  autre: 'bg-slate-100 text-slate-800',
}

// =================================================================
// STATUTS ENEMAT (module suivi post-livraison)
// =================================================================
export const ENEMAT_STATUTS = {
  a_deposer_enemat: 'À déposer',
  depose_enemat: 'Déposé',
  apf_enemat: 'APF reçu',
  paye_enemat: 'Payé',
} as const

export type EnematStatut = keyof typeof ENEMAT_STATUTS

// Couleurs par statut ENEMAT (pour badges)
export const ENEMAT_STATUT_COLORS: Record<EnematStatut, string> = {
  a_deposer_enemat: 'bg-amber-100 text-amber-800',
  depose_enemat: 'bg-blue-100 text-blue-800',
  apf_enemat: 'bg-indigo-100 text-indigo-800',
  paye_enemat: 'bg-green-100 text-green-800',
}

// Pastille ENEMAT (pour la page livraisons — quand in_enemat = true)
export const ENEMAT_BADGE_COLOR = 'bg-violet-100 text-violet-800'

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
