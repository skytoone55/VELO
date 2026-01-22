/**
 * Synchronisation bidirectionnelle Supabase ↔ Monday
 * Fonctions pour pousser les modifications de Supabase vers Monday
 *
 * Board: Vélos Cargos - Général (ID: 9990833105)
 */

import { MONDAY_CONFIG } from './config'
import { updateMondayItem, updateMondayItemName } from './api'

interface Client {
  id: string
  monday_item_id?: number | null
  raison_sociale?: string
  siret?: string
  email?: string
  email_beneficiaire?: string
  telephone?: string
  departement?: string
  statut_formulaire?: string
  statut_commercial?: string
  statut_retina?: string
  statut_mail?: string
  statut_anomalie?: string
  statut_make?: string
  statut_doublon?: string
  velo_devis?: number
  velo_valide?: number
  date_signature_devis?: string
  date_statut?: string
  adresse_societe_ligne1?: string
  adresse_societe_cp?: string
  adresse_societe_ville?: string
  contact_nom?: string
  contact_prenom?: string
  adresse_livraison_ligne1?: string
  adresse_livraison_cp?: string
  adresse_livraison_ville?: string
  reference_dossier?: string
  numero_devis?: string
  devis_pdf_url?: string
  format_juridique?: string
  code_ape?: string
  nb_salaries?: number
  commercial_assigne?: string
  equipe_ids?: string
  [key: string]: any
}

export interface SyncToMondayResult {
  success: boolean
  mondayItemId?: number
  error?: string
  fieldsUpdated?: string[]
}

/**
 * Convertit les données client Supabase vers le format colonnes Monday
 */
export function mapClientToMondayColumns(
  client: Partial<Client>,
  fieldsToSync?: string[]
): Record<string, any> {
  const { supabaseToMondayMapping, supabaseToMondayStatutCommercial, supabaseToMondayDepartement } = MONDAY_CONFIG
  const mondayColumns: Record<string, any> = {}

  // Liste des champs à synchroniser (tous si non spécifié)
  const fields = fieldsToSync || Object.keys(supabaseToMondayMapping)

  for (const supabaseField of fields) {
    const mondayColumnId = (supabaseToMondayMapping as Record<string, string>)[supabaseField]
    if (!mondayColumnId) continue

    const value = client[supabaseField]
    if (value === undefined) continue

    // Conversion spéciale pour le statut commercial (principal)
    if (supabaseField === 'statut_commercial' && value) {
      const mondayLabel = (supabaseToMondayStatutCommercial as Record<string, string>)[value]
      if (mondayLabel) {
        mondayColumns[mondayColumnId] = { label: mondayLabel }
      }
    }
    // Conversion spéciale pour le département
    else if (supabaseField === 'departement' && value) {
      const mondayLabel = (supabaseToMondayDepartement as Record<string, string>)[value]
      if (mondayLabel) {
        mondayColumns[mondayColumnId] = { label: mondayLabel }
      }
    }
    // Champs date
    else if (supabaseField.startsWith('date_') && value) {
      mondayColumns[mondayColumnId] = { date: value.split('T')[0] }
    }
    // Champs email
    else if (supabaseField.includes('email') && value) {
      mondayColumns[mondayColumnId] = { email: value, text: value }
    }
    // Champs numériques
    else if (typeof value === 'number') {
      mondayColumns[mondayColumnId] = value.toString()
    }
    // Autres champs texte
    else {
      mondayColumns[mondayColumnId] = value
    }
  }

  return mondayColumns
}

/**
 * Synchronise un client de Supabase vers Monday
 * Met à jour l'item Monday correspondant avec les données du client
 */
export async function syncClientToMonday(
  client: Client,
  fieldsToSync?: string[]
): Promise<SyncToMondayResult> {
  // Vérifier que le client a un ID Monday
  if (!client.monday_item_id) {
    return {
      success: false,
      error: 'Client sans monday_item_id - pas de synchronisation possible',
    }
  }

  try {
    const mondayColumns = mapClientToMondayColumns(client, fieldsToSync)
    const fieldsUpdated: string[] = []

    // Mise à jour du nom (raison_sociale) si présent
    if (client.raison_sociale && (!fieldsToSync || fieldsToSync.includes('raison_sociale'))) {
      const nameResult = await updateMondayItemName(client.monday_item_id, client.raison_sociale)
      if (!nameResult.success) {
        console.error('Erreur mise à jour nom Monday:', nameResult.error)
      } else {
        fieldsUpdated.push('raison_sociale')
      }
      // Retirer 'name' des colonnes car géré séparément
      delete mondayColumns['name']
    }

    // Mise à jour des autres colonnes
    if (Object.keys(mondayColumns).length > 0) {
      const result = await updateMondayItem(client.monday_item_id, mondayColumns)
      if (!result.success) {
        return {
          success: false,
          mondayItemId: client.monday_item_id,
          error: result.error,
          fieldsUpdated,
        }
      }
      fieldsUpdated.push(...Object.keys(mondayColumns))
    }

    return {
      success: true,
      mondayItemId: client.monday_item_id,
      fieldsUpdated,
    }
  } catch (error: any) {
    console.error('Erreur syncClientToMonday:', error)
    return {
      success: false,
      mondayItemId: client.monday_item_id,
      error: error.message || 'Erreur de synchronisation',
    }
  }
}

/**
 * Détermine quels champs ont été modifiés entre deux versions du client
 */
export function getChangedFields(
  oldClient: Partial<Client>,
  newClient: Partial<Client>
): string[] {
  const changedFields: string[] = []
  const { supabaseToMondayMapping } = MONDAY_CONFIG

  for (const field of Object.keys(supabaseToMondayMapping)) {
    const oldValue = oldClient[field]
    const newValue = newClient[field]

    // Comparer les valeurs (gérer null/undefined)
    if (oldValue !== newValue) {
      if (oldValue == null && newValue == null) continue
      changedFields.push(field)
    }
  }

  return changedFields
}

/**
 * Synchronise uniquement les champs modifiés vers Monday
 */
export async function syncChangedFieldsToMonday(
  client: Client,
  changedFields: string[]
): Promise<SyncToMondayResult> {
  if (changedFields.length === 0) {
    return { success: true, fieldsUpdated: [] }
  }

  return syncClientToMonday(client, changedFields)
}
