/**
 * Utilitaires tenant-aware pour commerciaux et départements.
 * PPE : 7 boards Monday = 7 commerciaux (identifiés par monday_board_id)
 * Ecovolt : 1 board, commercial identifié par champ email (EmailAgent_RETINA)
 */

import { getTenantId } from '@/lib/tenants'

// PPE: board_id → nom commercial (= nom du board Monday)
export const PPE_BOARD_NAMES: Record<string, string> = {
  '2144986053': 'ATHOME',
  '5002798369': 'ALEX',
  '2146667697': 'DIZIEN',
  '2140187165': 'EKL',
  '2137662048': 'JM',
  '5013455904': 'SALIH',
  '5001072451': 'STELLARS',
}

// Ecovolt: single board
export const ECOVOLT_BOARD_ID = '9990833105'

// Mapping complet (PPE + Ecovolt) pour la carte admin
export const ALL_BOARD_NAMES: Record<string, string> = {
  ...PPE_BOARD_NAMES,
  [ECOVOLT_BOARD_ID]: 'ECOVOLT',
}

/**
 * Nom commercial d'un client selon le tenant.
 * - PPE : dérivé du monday_board_id
 * - Ecovolt : champ email (= email du commercial)
 */
export function getCommercialName(client: {
  monday_board_id?: string | null
  email?: string | null
  commercial_assigne?: string | null
}): string {
  const tenant = getTenantId()
  if (tenant === 'ppe') {
    if (client.commercial_assigne) return client.commercial_assigne
    if (client.monday_board_id && PPE_BOARD_NAMES[client.monday_board_id]) {
      return PPE_BOARD_NAMES[client.monday_board_id]
    }
    return 'Inconnu'
  }
  // Ecovolt : commercial_assigne depuis Monday (nom/email du commercial)
  if (client.commercial_assigne) return client.commercial_assigne
  return 'Non assigné'
}

// Ecovolt : labels lisibles pour les départements DOM-TOM
export const ECOVOLT_DEPARTEMENT_LABELS: Record<string, string> = {
  '974': 'La Réunion',
  '972': 'Martinique',
  '971': 'Guadeloupe',
  '973': 'Guyane',
  '976': 'Mayotte',
  'hors_dom': 'Hors DOM',
}

/**
 * Label d'affichage pour un code département.
 * - Ecovolt : nom de région (974 → "La Réunion")
 * - PPE : code brut tel quel (75, 93, etc.)
 * Si département vide, dérive du code postal (2 premiers chiffres).
 */
export function getDepartementLabel(
  code: string | null | undefined,
  codePostal?: string | null
): string {
  const dept = code || (codePostal ? codePostal.substring(0, 2) : null)
  if (!dept) return '-'
  const tenant = getTenantId()
  if (tenant === 'ecovolt') {
    return ECOVOLT_DEPARTEMENT_LABELS[dept] || dept
  }
  return dept
}

/**
 * Options statiques du filtre département (Ecovolt uniquement).
 * Pour PPE, retourne null → charger dynamiquement depuis /api/clients/departements.
 */
export function getStaticDepartementOptions(): { value: string; label: string }[] | null {
  const tenant = getTenantId()
  if (tenant === 'ecovolt') {
    return [
      { value: '974', label: 'La Réunion (974)' },
      { value: '972', label: 'Martinique (972)' },
      { value: '971', label: 'Guadeloupe (971)' },
      { value: '973', label: 'Guyane (973)' },
      { value: '976', label: 'Mayotte (976)' },
      { value: 'hors_dom', label: 'Hors DOM' },
    ]
  }
  return null // PPE = dynamique
}

/**
 * Options statiques du filtre commercial (PPE uniquement).
 * Pour Ecovolt, retourne null → charger dynamiquement depuis /api/clients/commercials.
 */
export function getStaticCommercialOptions(): { value: string; label: string }[] | null {
  const tenant = getTenantId()
  if (tenant === 'ppe') {
    return Object.entries(PPE_BOARD_NAMES).map(([boardId, name]) => ({
      value: boardId,
      label: name,
    }))
  }
  return null // Ecovolt = dynamique
}
