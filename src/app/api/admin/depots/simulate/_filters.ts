/**
 * Logique partagée de filtrage des clients pour la simulation de dépôt.
 *
 * Utilisée par :
 *  - /api/admin/depots/simulate         (calcul des éligibles tournée + breakdown)
 *  - /api/admin/depots/simulate/export  (export XLSX des éligibles)
 *
 * Objectif : les "éligibles tournée intelligente" = clients AVANT livraison
 * (ensemble livrable) qui matchent en plus les filtres actifs choisis par
 * l'utilisateur sur la carte (statut commercial, NAF, commercial/board).
 */

import { ALL_BOARD_NAMES } from '@/lib/tenants/commercial'

/**
 * Ensemble des statuts LIVRABLES = clients AVANT livraison.
 * `livre` et `client_hs` n'en font JAMAIS partie.
 */
export const STATUTS_LIVRABLES = new Set<string>([
  'a_livrer',
  'formulaire_envoye',
  'controle_valide',
  'en_livraison',
  'a_relivrer',
])

/** Nom commercial (board) d'un client, identique à la carte admin (front). */
export function boardNameOf(client: { monday_board_id?: string | null }): string {
  return client.monday_board_id
    ? (ALL_BOARD_NAMES[client.monday_board_id] || 'Autre')
    : 'Non assigné'
}

/** Label NAF d'un client, identique au front (validation_naf || 'A vérifier'). */
export function nafLabelOf(client: { validation_naf?: string | null }): string {
  return client.validation_naf || 'A vérifier'
}

/** Filtres actifs transmis depuis la carte (tous optionnels ; vide = pas de restriction). */
export interface SimulationFilters {
  selectedStatuts?: string[]
  selectedNaf?: string[]
  selectedCommerciaux?: string[]
}

/** Normalise les filtres reçus du body (tolère absence / valeurs non-array). */
export function parseFilters(body: any): SimulationFilters {
  const arr = (v: any): string[] | undefined =>
    Array.isArray(v) && v.length > 0 ? v.filter((x) => typeof x === 'string') : undefined
  return {
    selectedStatuts: arr(body?.selectedStatuts),
    selectedNaf: arr(body?.selectedNaf),
    selectedCommerciaux: arr(body?.selectedCommerciaux),
  }
}

/**
 * Un client est-il ÉLIGIBLE tournée intelligente ?
 *   = statut dans l'ensemble livrable
 *     ∩ filtre statut (si actif) ∩ filtre NAF (si actif) ∩ filtre commercial (si actif)
 * Les filtres vides ne restreignent pas. `livre`/`client_hs` jamais éligibles
 * (exclus par STATUTS_LIVRABLES).
 */
export function isClientEligible(
  client: {
    statut_commercial?: string | null
    validation_naf?: string | null
    monday_board_id?: string | null
  },
  filters: SimulationFilters
): boolean {
  const statut = client.statut_commercial || ''

  // 1) Ensemble livrable (exclut livre / client_hs)
  if (!STATUTS_LIVRABLES.has(statut)) return false

  // 2) Filtre statut : statut ∈ (selectedStatuts ∩ livrable)
  if (filters.selectedStatuts && !filters.selectedStatuts.includes(statut)) return false

  // 3) Filtre NAF (sémantique OUI / NON / A vérifier identique au front)
  if (filters.selectedNaf && !filters.selectedNaf.includes(nafLabelOf(client))) return false

  // 4) Filtre commercial (par nom de board, comme la carte)
  if (filters.selectedCommerciaux && !filters.selectedCommerciaux.includes(boardNameOf(client))) {
    return false
  }

  return true
}
