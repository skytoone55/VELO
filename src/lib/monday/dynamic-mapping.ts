/**
 * Gestion dynamique des mappings Monday ↔ Supabase
 * Les mappings sont stockés dans la table `monday_field_mapping`
 * et chargés dynamiquement au lieu d'être hardcodés
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { MONDAY_CONFIG } from './config'

export interface FieldMapping {
  interface_field: string
  interface_label: string
  interface_type: string
  interface_section: string
  monday_column_id: string | null
  monday_column_title: string | null
  monday_column_type: string | null
  value_mapping: Record<string, string>
  is_synced: boolean
  is_required: boolean
}

// Cache des mappings pour éviter des requêtes répétées
// En multi-board, on cache par boardId (clé = boardId ou 'default')
const mappingsCache: Map<string, { data: FieldMapping[]; timestamp: number }> = new Map()
const CACHE_TTL = 60 * 1000 // 1 minute

/**
 * Charger les mappings depuis la base de données
 * Utilise un cache de 1 minute pour éviter les requêtes répétées
 *
 * @param boardId - En multi-board, charge les mappings spécifiques au board
 */
export async function loadMappings(forceRefresh = false, boardId?: string): Promise<FieldMapping[]> {
  const now = Date.now()
  const cacheKey = boardId || 'default'

  // Retourner le cache s'il est encore valide
  const cached = mappingsCache.get(cacheKey)
  if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.data
  }

  const adminClient = createAdminClient()

  let query = adminClient
    .from('monday_field_mapping')
    .select('*')
    .eq('is_synced', true) // Seulement les champs mappés
    .order('interface_section')

  // En multi-board, filtrer par board_id
  if (boardId) {
    query = query.eq('board_id', boardId)
  } else {
    // Si pas de boardId, charger les mappings sans board_id (mode single-board)
    query = query.is('board_id', null)
  }

  const { data: mappings, error } = await query

  if (error) {
    console.error('Erreur chargement mappings:', error)
    // En cas d'erreur, retourner le cache s'il existe, sinon tableau vide
    return cached?.data || []
  }

  const result = mappings || []
  mappingsCache.set(cacheKey, { data: result, timestamp: now })

  return result
}

/**
 * Invalider le cache des mappings
 * À appeler quand un mapping est modifié via l'interface Settings
 */
export function invalidateMappingsCache(): void {
  mappingsCache.clear()
}

/**
 * Obtenir le mapping Supabase → Monday
 * Retourne un objet { supabaseField: mondayColumnId }
 *
 * @param boardId - En multi-board, retourne le mapping spécifique au board
 */
export async function getSupabaseToMondayMapping(boardId?: string): Promise<Record<string, string>> {
  const mappings = await loadMappings(false, boardId)
  const result: Record<string, string> = {}

  for (const mapping of mappings) {
    if (mapping.monday_column_id) {
      result[mapping.interface_field] = mapping.monday_column_id
    }
  }

  return result
}

/**
 * Obtenir le mapping Monday → Supabase
 * Retourne un objet { mondayColumnId: supabaseField }
 *
 * @param boardId - En multi-board, retourne le mapping spécifique au board
 */
export async function getMondayToSupabaseMapping(boardId?: string): Promise<Record<string, string>> {
  const mappings = await loadMappings(false, boardId)
  const result: Record<string, string> = {}

  for (const mapping of mappings) {
    if (mapping.monday_column_id) {
      result[mapping.monday_column_id] = mapping.interface_field
    }
  }

  return result
}

/**
 * Obtenir le mapping de valeurs pour un champ donné
 * (ex: statut_commercial: 'controle_valide' → 'CONTROLE VALIDÉ')
 */
export async function getValueMapping(interfaceField: string, boardId?: string): Promise<Record<string, string>> {
  const mappings = await loadMappings(false, boardId)
  const mapping = mappings.find(m => m.interface_field === interfaceField)
  return mapping?.value_mapping || {}
}

/**
 * Obtenir le mapping de valeurs inversé pour un champ donné
 * (ex: statut_commercial: 'CONTROLE VALIDÉ' → 'controle_valide')
 */
export async function getValueMappingReverse(interfaceField: string, boardId?: string): Promise<Record<string, string>> {
  const valueMapping = await getValueMapping(interfaceField, boardId)
  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(valueMapping)) {
    result[value] = key
  }

  return result
}

/**
 * Convertir une valeur Supabase vers Monday pour un champ donné
 */
export async function convertValueToMonday(interfaceField: string, supabaseValue: any, boardId?: string): Promise<any> {
  if (supabaseValue === null || supabaseValue === undefined) return null

  // Champs avec mapping de valeurs spécial
  const fieldsWithValueMapping = [
    'statut_commercial',
    'departement',
    'statut_retina',
    'statut_mail',
    'statut_anomalie',
    'statut_doublon',
    'type_livraison',
    'type_de_zone',
    'validation_naf',
  ]

  if (fieldsWithValueMapping.includes(interfaceField)) {
    const valueMapping = await getValueMapping(interfaceField, boardId)
    return valueMapping[supabaseValue] || supabaseValue
  }

  return supabaseValue
}

/**
 * Convertir une valeur Monday vers Supabase pour un champ donné
 */
export async function convertValueToSupabase(interfaceField: string, mondayValue: any, boardId?: string): Promise<any> {
  if (mondayValue === null || mondayValue === undefined) return null

  // Champs avec mapping de valeurs spécial
  const fieldsWithValueMapping = [
    'statut_commercial',
    'departement',
    'statut_retina',
    'statut_mail',
    'statut_anomalie',
    'statut_doublon',
    'type_livraison',
    'type_de_zone',
    'validation_naf',
  ]

  if (fieldsWithValueMapping.includes(interfaceField)) {
    const valueMapping = await getValueMappingReverse(interfaceField, boardId)
    return valueMapping[mondayValue] || mondayValue
  }

  return mondayValue
}

/**
 * Initialiser les mappings dans la base depuis la config hardcodée
 * À utiliser une fois pour migrer vers le système dynamique
 *
 * @param boardId - En multi-board, stocker les mappings avec ce board_id
 *                  Si non fourni, les mappings sont globaux (single-board mode)
 */
export async function initializeMappingsFromConfig(boardId?: string): Promise<{ success: boolean; count: number; error?: string }> {
  const adminClient = createAdminClient()

  try {
    const mappingsToInsert = []

    // Mappings de champs
    const supabaseToMonday = MONDAY_CONFIG.supabaseToMondayMapping as Record<string, string>

    // Définition des champs avec leurs métadonnées
    const fieldDefinitions: Record<string, { label: string; type: string; section: string; required?: boolean }> = {
      raison_sociale: { label: 'Raison sociale', type: 'text', section: 'identification', required: true },
      siret: { label: 'SIRET', type: 'text', section: 'identification', required: true },
      reference_dossier: { label: 'Code Retina / Réf dossier', type: 'text', section: 'identification' },
      numero_devis: { label: 'Numéro de devis', type: 'text', section: 'identification' },
      email: { label: 'Email agent', type: 'email', section: 'contact' },
      email_beneficiaire: { label: 'Email bénéficiaire', type: 'email', section: 'contact', required: true },
      telephone: { label: 'Téléphone', type: 'phone', section: 'contact' },
      contact_nom: { label: 'Nom du contact', type: 'text', section: 'contact' },
      contact_prenom: { label: 'Prénom du contact', type: 'text', section: 'contact' },
      adresse_societe_ligne1: { label: 'Adresse siège (ligne 1)', type: 'text', section: 'adresse_siege' },
      adresse_societe_cp: { label: 'Code postal siège', type: 'text', section: 'adresse_siege' },
      adresse_societe_ville: { label: 'Ville siège', type: 'text', section: 'adresse_siege' },
      // Adresse livraison
      adresse_livraison_ligne1: { label: 'Adresse livraison (ligne 1)', type: 'text', section: 'adresse_livraison' },
      adresse_livraison_ligne2: { label: 'Adresse livraison (ligne 2)', type: 'text', section: 'adresse_livraison' },
      adresse_livraison_cp: { label: 'Code postal livraison', type: 'text', section: 'adresse_livraison' },
      adresse_livraison_ville: { label: 'Ville livraison', type: 'text', section: 'adresse_livraison' },
      // Type de livraison
      type_livraison: { label: 'Type de livraison', type: 'status', section: 'livraison' },
      format_juridique: { label: 'Format juridique', type: 'text', section: 'entreprise' },
      code_ape: { label: 'Code APE/NAF', type: 'text', section: 'entreprise' },
      nb_salaries: { label: 'Nombre de salariés', type: 'number', section: 'entreprise' },
      departement: { label: 'Département', type: 'status', section: 'entreprise' },
      velo_devis: { label: 'Nombre vélos devis', type: 'number', section: 'velos' },
      velo_valide: { label: 'Nombre vélos validés', type: 'number', section: 'velos' },
      devis_pdf_url: { label: 'URL devis PDF', type: 'link', section: 'velos' },
      date_signature_devis: { label: 'Date signature devis', type: 'date', section: 'velos' },
      date_statut: { label: 'Date statut', type: 'date', section: 'statuts' },
      statut_commercial: { label: 'Statut commercial', type: 'status', section: 'statuts' },
      statut_retina: { label: 'Statut Retina', type: 'status', section: 'statuts' },
      statut_mail: { label: 'Statut mail', type: 'status', section: 'statuts' },
      statut_anomalie: { label: 'Statut anomalie', type: 'status', section: 'statuts' },
      statut_doublon: { label: 'Statut doublon', type: 'status', section: 'statuts' },
      commercial_assigne: { label: 'Commercial assigné', type: 'people', section: 'assignation' },
      equipe_ids: { label: 'Équipe', type: 'people', section: 'assignation' },
      code_enemat_saisi: { label: 'Code ENEMAT saisi', type: 'text', section: 'validation' },
      preferences_livraison: { label: 'Préférences livraison', type: 'text', section: 'livraison' },
      type_de_zone: { label: 'Type de zone', type: 'status', section: 'livraison' },
      validation_naf: { label: 'Validation NAF', type: 'status', section: 'validation' },
    }

    // Mappings de valeurs pour les champs status (Supabase → Monday)
    const valueMappings: Record<string, Record<string, string>> = {
      statut_commercial: MONDAY_CONFIG.supabaseToMondayStatutCommercial as Record<string, string>,
      departement: MONDAY_CONFIG.supabaseToMondayDepartement as Record<string, string>,
      // Type de livraison
      type_livraison: {
        livraison_gratuite: 'Livraison gratuite',
        retrait_depot: 'Retrait depot',
        livraison_payante: 'Livraison payante',
      },
      // Inverser les mappings Monday → Supabase pour les autres statuts
      statut_retina: Object.fromEntries(
        Object.entries(MONDAY_CONFIG.mondayToSupabaseStatutRetina as Record<string, string>)
          .map(([k, v]) => [v, k])
      ),
      statut_mail: Object.fromEntries(
        Object.entries(MONDAY_CONFIG.mondayToSupabaseStatutMail as Record<string, string>)
          .map(([k, v]) => [v, k])
      ),
      statut_anomalie: Object.fromEntries(
        Object.entries(MONDAY_CONFIG.mondayToSupabaseStatutAnomalie as Record<string, string>)
          .map(([k, v]) => [v, k])
      ),
      statut_doublon: Object.fromEntries(
        Object.entries(MONDAY_CONFIG.mondayToSupabaseStatutDoublon as Record<string, string>)
          .map(([k, v]) => [v, k])
      ),
      type_de_zone: MONDAY_CONFIG.supabaseToMondayTypeDeZone as Record<string, string>,
      validation_naf: MONDAY_CONFIG.supabaseToMondayValidationNafEcovolt as Record<string, string>,
    }

    let count = 0

    for (const [supabaseField, mondayColumnId] of Object.entries(supabaseToMonday)) {
      const fieldDef = fieldDefinitions[supabaseField]
      if (!fieldDef) continue

      const mappingData = {
        interface_field: supabaseField,
        interface_label: fieldDef.label,
        interface_type: fieldDef.type,
        interface_section: fieldDef.section,
        monday_column_id: mondayColumnId,
        monday_column_title: null, // Sera rempli via l'API Monday
        monday_column_type: null,
        value_mapping: valueMappings[supabaseField] || {},
        is_synced: true,
        is_required: fieldDef.required || false,
        board_id: boardId || null,
        updated_at: new Date().toISOString(),
      }

      // SELECT + INSERT/UPDATE au lieu de upsert
      // (car la contrainte unique utilise COALESCE, incompatible avec onConflict de PostgREST)
      let existingQuery = adminClient
        .from('monday_field_mapping')
        .select('id')
        .eq('interface_field', supabaseField)

      if (boardId) {
        existingQuery = existingQuery.eq('board_id', boardId)
      } else {
        existingQuery = existingQuery.is('board_id', null)
      }

      const { data: existing } = await existingQuery.maybeSingle()

      if (existing) {
        await adminClient
          .from('monday_field_mapping')
          .update(mappingData)
          .eq('id', existing.id)
      } else {
        await adminClient
          .from('monday_field_mapping')
          .insert(mappingData)
      }

      count++
    }

    // Invalider le cache
    invalidateMappingsCache()

    return { success: true, count }
  } catch (error: any) {
    console.error('Erreur initialisation mappings:', error)
    return { success: false, count: 0, error: error.message }
  }
}
