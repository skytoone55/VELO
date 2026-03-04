import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MONDAY_CONFIG, getMondayApiKey, isMondayConfigured } from '@/lib/monday/config'
import { getMondayToSupabaseMapping, loadMappings, convertValueToSupabase } from '@/lib/monday/dynamic-mapping'
import { SyncResult } from '@/lib/monday/types'
import { buildClientAddress, geocodeAddress, findNearestDepot, classifyClientZone, DepotWithCoords } from '@/lib/geo/utils'

/**
 * API de synchronisation Monday.com → Supabase
 *
 * IMPORTANT: Monday.com est la SOURCE DE VÉRITÉ (SSOT)
 * - Les clients sont créés/modifiés dans Monday
 * - Supabase sert de cache/miroir pour l'application
 * - Direction principale: Monday → Supabase (PULL)
 *
 * MULTI-BOARD: En mode multi-board (PPE), itère tous les boards
 * et utilise le mapping dynamique par board
 *
 * POST /api/sync/monday - Lance une synchronisation complète
 * GET /api/sync/monday - Retourne le statut de synchronisation
 */

export async function POST(request: NextRequest) {
  try {
    if (!isMondayConfigured()) {
      return NextResponse.json(
        { error: 'Monday.com non configuré. Vérifiez MONDAY_API_KEY et MONDAY_BOARD_ID(S).', configured: false },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { fullSync = false, boardId: specificBoardId, purge = false } = body

    const result: SyncResult = {
      success: true,
      direction: 'monday_to_supabase',
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      errors: [],
      timestamp: new Date().toISOString(),
    }

    // Déterminer les boards à synchroniser
    const boardIds = specificBoardId
      ? [specificBoardId]
      : MONDAY_CONFIG.allBoardIds

    // Collecter tous les monday_item_id synchronisés (pour la purge)
    const allSyncedMondayIds: number[] = []

    // Synchroniser chaque board
    for (const boardId of boardIds) {
      await syncBoardToSupabase(boardId, result, fullSync, allSyncedMondayIds)
    }

    // Géocodage incrémental post-sync
    // Géocode les clients sans coordonnées (limité à 100 par sync)
    const geocodingResult = await geocodeNewClients(100)
    if (geocodingResult) {
      ;(result as any).geocoding = geocodingResult
    }

    // --- Purge des clients orphelins (opt-in via purge=true) ---
    // Supprime les clients présents dans Supabase mais absents de Monday
    // Les tables liées (distances_cache, formulaires_log, email_alerts, etc.)
    // n'ont pas de FK CASCADE → nettoyées manuellement avant suppression
    if (purge && allSyncedMondayIds.length > 0) {
      const purgeResult = await purgeOrphanedClients(allSyncedMondayIds)
      if (purgeResult) {
        ;(result as any).purge = purgeResult
      }
    }

    // Log l'opération
    const adminClient = createAdminClient()
    await adminClient.from('sync_monday_log').insert({
      action: 'sync_batch',
      direction: 'monday_to_supabase',
      statut: result.success ? 'success' : 'error',
      donnees_apres: {
        ...result,
        boardsCount: boardIds.length,
        isMultiBoard: MONDAY_CONFIG.isMultiBoard,
      },
    })

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de synchronisation' },
      { status: 500 }
    )
  }
}

/**
 * Synchronise un board Monday vers Supabase
 * Utilise le mapping dynamique si disponible, sinon le mapping hardcodé (ECO-VOLT)
 */
async function syncBoardToSupabase(boardId: string, result: SyncResult, fullSync: boolean = false, syncedMondayIds?: number[]) {
  const apiKey = getMondayApiKey()
  if (!apiKey) {
    result.success = false
    result.errors.push({ error: 'API Key Monday non configurée' })
    return
  }

  const adminClient = createAdminClient()
  const isMultiBoard = MONDAY_CONFIG.isMultiBoard

  // Charger le mapping dynamique pour ce board
  let dynamicMapping: Record<string, string> = {}
  let dynamicMappings: any[] = []
  try {
    dynamicMapping = await getMondayToSupabaseMapping(isMultiBoard ? boardId : undefined)
    dynamicMappings = await loadMappings(false, isMultiBoard ? boardId : undefined)
  } catch (e) {
    console.warn(`Pas de mapping dynamique pour board ${boardId}, utilisation du mapping hardcodé`)
  }

  // Fallback sur le mapping hardcodé si pas de mapping dynamique
  const useHardcodedMapping = Object.keys(dynamicMapping).length === 0
  const columnMapping = useHardcodedMapping
    ? (MONDAY_CONFIG.mondayToSupabaseMapping as Record<string, string>)
    : dynamicMapping

  let cursor: string | null = null
  let hasMore = true

  while (hasMore) {
    // Query avec pagination
    const graphqlQuery: string = `
      query {
        boards(ids: [${boardId}]) {
          items_page(limit: ${MONDAY_CONFIG.batchSize}${cursor ? `, cursor: "${cursor}"` : ''}) {
            cursor
            items {
              id
              name
              created_at
              updated_at
              column_values {
                id
                text
                value
              }
            }
          }
        }
      }
    `

    try {
      const response = await fetch(MONDAY_CONFIG.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
        body: JSON.stringify({ query: graphqlQuery }),
      })

      const data = await response.json()

      if (data.errors) {
        result.success = false
        result.errors.push({ error: `Erreur API Monday (board ${boardId})`, details: data.errors })
        return
      }

      const itemsPage = data.data?.boards?.[0]?.items_page
      const items = itemsPage?.items || []
      cursor = itemsPage?.cursor || null
      hasMore = !!cursor && items.length > 0

      for (const item of items) {
        result.itemsProcessed++

        try {
          const mondayItemId = parseInt(item.id)

          // Collecter l'ID pour la purge post-sync
          if (syncedMondayIds) {
            syncedMondayIds.push(mondayItemId)
          }

          // Vérifier si ce client existe déjà dans Supabase
          const { data: existingClient } = await adminClient
            .from('clients')
            .select('id, monday_synced_at, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville, adresse_societe_ligne1, adresse_societe_cp, adresse_societe_ville, latitude, longitude')
            .eq('monday_item_id', mondayItemId)
            .single()

          // Mapper les colonnes Monday vers les champs Supabase
          const clientData = await mapMondayItemToClient(item, columnMapping, dynamicMappings, useHardcodedMapping)

          // En multi-board, ajouter le board_id au client
          if (isMultiBoard) {
            clientData.monday_board_id = boardId
          }

          if (existingClient) {
            // Vérifier si une mise à jour est nécessaire
            const mondayUpdatedAt = item.updated_at ? new Date(item.updated_at) : new Date()
            const supabaseSyncedAt = existingClient.monday_synced_at
              ? new Date(existingClient.monday_synced_at)
              : new Date(0)

            // Mettre à jour si Monday a été modifié après la dernière sync ou si fullSync
            if (fullSync || mondayUpdatedAt > supabaseSyncedAt) {
              // Détecter un changement d'adresse → reset coordonnées pour forcer re-géocodage
              const addressFields = [
                'adresse_livraison_ligne1', 'adresse_livraison_cp', 'adresse_livraison_ville',
                'adresse_societe_ligne1', 'adresse_societe_cp', 'adresse_societe_ville',
              ] as const
              const addressChanged = addressFields.some(field => {
                const newVal = clientData[field]
                const oldVal = (existingClient as any)[field]
                return newVal !== undefined && newVal !== oldVal
              })

              const updateData: Record<string, any> = {
                ...clientData,
                monday_synced_at: new Date().toISOString(),
                monday_sync_status: 'synced',
                updated_at: new Date().toISOString(),
              }

              // Si l'adresse a changé et le client avait des coordonnées, les réinitialiser
              if (addressChanged && existingClient.latitude) {
                updateData.latitude = null
                updateData.longitude = null
                updateData.geocoding_score = null
                updateData.geocoding_source = null
                updateData.address_used_for_geocoding = null
                // Aussi réinitialiser les assignations dépôt
                updateData.depot_retrait_id = null
                updateData.depot_logistique_id = null
              }

              await adminClient
                .from('clients')
                .update(updateData)
                .eq('id', existingClient.id)
              result.itemsUpdated++
            } else {
              result.itemsSkipped++
            }
          } else {
            // Créer un nouveau client depuis Monday
            const { error: insertError } = await adminClient
              .from('clients')
              .insert({
                ...clientData,
                monday_item_id: mondayItemId,
                monday_synced_at: new Date().toISOString(),
                monday_sync_status: 'synced',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })

            if (insertError) {
              throw insertError
            }
            result.itemsCreated++
          }
        } catch (err: any) {
          console.error(`Error syncing item ${item.id} (board ${boardId}):`, err)
          result.errors.push({
            mondayItemId: item.id,
            boardId,
            error: err.message || 'Erreur de synchronisation',
          })
        }
      }

      // Petit délai pour éviter le rate limiting
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

    } catch (err: any) {
      result.success = false
      result.errors.push({ error: `Erreur connexion Monday (board ${boardId})`, details: err.message })
      hasMore = false
    }
  }

  result.success = result.errors.length === 0
}

/**
 * Mappe un item Monday vers un objet client Supabase
 * En mode dynamique: utilise le mapping de la DB
 * En mode hardcodé (fallback ECO-VOLT): utilise MONDAY_CONFIG
 */
async function mapMondayItemToClient(
  item: any,
  columnMapping: Record<string, string>,
  dynamicMappings: any[],
  useHardcodedMapping: boolean
): Promise<Record<string, any>> {
  const client: Record<string, any> = {
    raison_sociale: item.name,
  }

  for (const col of item.column_values || []) {
    const supabaseField = columnMapping[col.id]
    if (!supabaseField) continue

    let value = extractColumnValue(col)
    if (value === null || value === undefined || value === '') continue

    // Conversion des valeurs status
    if (useHardcodedMapping) {
      // Mode hardcodé (ECO-VOLT): utiliser les mappings de MONDAY_CONFIG
      value = convertValueHardcoded(col.id, value)
    } else {
      // Mode dynamique: utiliser le mapping de valeurs de la DB
      const fieldMapping = dynamicMappings.find(m => m.monday_column_id === col.id)
      if (fieldMapping?.value_mapping && Object.keys(fieldMapping.value_mapping).length > 0) {
        // Le value_mapping est Supabase→Monday, on doit l'inverser pour Monday→Supabase
        const reverseMapping: Record<string, string> = {}
        for (const [supVal, monVal] of Object.entries(fieldMapping.value_mapping)) {
          reverseMapping[monVal as string] = supVal
        }
        value = reverseMapping[value] || value
      }
    }

    // Extraire les IDs des personnes pour les colonnes people
    if (col.id?.startsWith('multiple_person_') || col.id?.startsWith('people_')) {
      value = extractPeopleIds(col)
    }

    // Convertir les champs entiers
    if (['velo_valide', 'velo_devis', 'nb_salaries', 'nb_velos'].includes(supabaseField)) {
      const numValue = parseFloat(value)
      if (!isNaN(numValue)) {
        value = Math.floor(numValue)
      }
    }

    // Gérer les colonnes numeric de Monday avec des décimales
    if (col.id?.startsWith('numeric_') && typeof value === 'string' && value.includes('.')) {
      const numValue = parseFloat(value)
      if (!isNaN(numValue)) {
        value = Math.floor(numValue)
      }
    }

    client[supabaseField] = value
  }

  return client
}

/**
 * Conversion des valeurs en mode hardcodé (ECO-VOLT / fallback)
 * Utilise les mappings de MONDAY_CONFIG
 */
function convertValueHardcoded(columnId: string, value: any): any {
  switch (columnId) {
    case 'color_mkvfws5n': // Statut commercial (PRINCIPAL)
      return (MONDAY_CONFIG.mondayToSupabaseStatutCommercial as Record<string, string>)[value] || value
    case 'color_mkvdkzxh': // Département
      return (MONDAY_CONFIG.mondayToSupabaseDepartement as Record<string, string>)[value] || value
    case 'color_mkvgsswc': // StatutRETINA
      return (MONDAY_CONFIG.mondayToSupabaseStatutRetina as Record<string, string>)[value] || value
    case 'color_mkyqn153': // statut mail
      return (MONDAY_CONFIG.mondayToSupabaseStatutMail as Record<string, string>)[value] || value
    case 'color_mkvp4dmz': // StatutAnomalie
      return (MONDAY_CONFIG.mondayToSupabaseStatutAnomalie as Record<string, string>)[value] || value
    case 'color_mkvn1kg0': // doublon_RETINA
      return (MONDAY_CONFIG.mondayToSupabaseStatutDoublon as Record<string, string>)[value] || value
    default:
      return value
  }
}

/**
 * Extrait les IDs des personnes d'une colonne people Monday
 */
function extractPeopleIds(col: any): string | null {
  if (!col.value) return null

  try {
    const parsed = JSON.parse(col.value)
    if (parsed.personsAndTeams && Array.isArray(parsed.personsAndTeams)) {
      const ids = parsed.personsAndTeams
        .filter((p: any) => p.kind === 'person')
        .map((p: any) => p.id.toString())
      return ids.length > 0 ? ids.join(',') : null
    }
  } catch {
    // Ignorer les erreurs de parsing
  }

  return col.text || null
}

/**
 * Extrait la valeur d'une colonne Monday selon son type
 */
function extractColumnValue(col: any): any {
  // Checkbox/Boolean: Monday retourne {"checked": true/false} comme texte
  // Il faut parser AVANT de retourner col.text brut
  if (col.id?.startsWith('boolean_') || col.id?.startsWith('checkbox_')) {
    if (col.value) {
      try {
        const parsed = JSON.parse(col.value)
        if (typeof parsed.checked === 'boolean') return parsed.checked
      } catch { /* fallback ci-dessous */ }
    }
    // Fallback: interpréter le texte
    if (col.text === 'v' || col.text === 'true') return true
    if (col.text === '' || col.text === null || col.text === undefined || col.text === 'false') return false
    return false
  }

  // Valeur texte directe
  if (col.text !== null && col.text !== undefined && col.text !== '') {
    return col.text
  }

  // Parser la valeur JSON si présente
  if (col.value) {
    try {
      const parsed = JSON.parse(col.value)

      // Checkbox (au cas où l'id ne commence pas par boolean_)
      if (typeof parsed.checked === 'boolean') return parsed.checked

      // Email
      if (parsed.email) return parsed.email

      // Phone
      if (parsed.phone) return parsed.phone

      // Date
      if (parsed.date) return parsed.date

      // Status/Dropdown
      if (parsed.label?.text) return parsed.label.text

      // Number
      if (typeof parsed === 'number') return parsed

      // Text value
      if (parsed.text) return parsed.text

      return parsed
    } catch {
      return col.value
    }
  }

  return null
}

/**
 * Purge des clients orphelins
 *
 * Supprime les clients Supabase dont le monday_item_id n'existe plus
 * dans aucun board Monday synchronisé.
 *
 * Les tables liées (distances_cache, formulaires_log, email_alerts,
 * livraisons, user_societes, contrats) n'ont pas de FK CASCADE,
 * elles sont donc nettoyées manuellement avant la suppression du client.
 */
async function purgeOrphanedClients(syncedMondayIds: number[]) {
  const adminClient = createAdminClient()

  try {
    // Récupérer tous les clients Supabase ayant un monday_item_id
    const { data: allClients, error: fetchError } = await adminClient
      .from('clients')
      .select('id, monday_item_id, raison_sociale')
      .not('monday_item_id', 'is', null)

    if (fetchError) {
      console.error('Erreur fetch clients pour purge:', fetchError)
      return null
    }

    if (!allClients || allClients.length === 0) {
      return { orphansFound: 0, purged: 0, errors: 0 }
    }

    // Identifier les orphelins : présents dans Supabase mais absents de Monday
    const syncedSet = new Set(syncedMondayIds)
    const orphans = allClients.filter(c => !syncedSet.has(c.monday_item_id))

    if (orphans.length === 0) {
      console.log('Purge post-sync: aucun client orphelin détecté')
      return { orphansFound: 0, purged: 0, errors: 0 }
    }

    console.log(`Purge post-sync: ${orphans.length} client(s) orphelin(s) détecté(s)`)

    let purged = 0
    let errors = 0
    const orphanIds = orphans.map(o => o.id)

    // Nettoyer les tables liées AVANT de supprimer les clients
    // (pas de FK CASCADE en place)
    const linkedTables = [
      'distances_cache',
      'formulaires_log',
      'email_alerts',
      'livraisons',
      'user_societes',
      'contrats',
    ]

    for (const table of linkedTables) {
      const { error: cleanError } = await adminClient
        .from(table)
        .delete()
        .in('client_id', orphanIds)

      if (cleanError) {
        // Log mais ne bloque pas — certaines tables peuvent ne pas exister
        console.warn(`Purge: erreur nettoyage ${table}:`, cleanError.message)
      }
    }

    // Supprimer les clients orphelins
    const { error: deleteError } = await adminClient
      .from('clients')
      .delete()
      .in('id', orphanIds)

    if (deleteError) {
      console.error('Erreur suppression clients orphelins:', deleteError)
      errors = orphans.length
    } else {
      purged = orphans.length
    }

    console.log(`Purge post-sync: ${purged} client(s) supprimé(s), ${errors} erreur(s)`)

    return { orphansFound: orphans.length, purged, errors }
  } catch (error) {
    console.error('Erreur purge clients orphelins:', error)
    return null
  }
}

/**
 * Géocodage incrémental post-sync
 *
 * Géocode les clients sans coordonnées (limité à `limit` par exécution)
 * et les assigne au dépôt le plus proche.
 *
 * Utilise l'API unitaire api-adresse.data.gouv.fr/search/ (pas le batch CSV)
 * car on traite un petit nombre de clients à la fois.
 */
async function geocodeNewClients(limit: number = 100) {
  const adminClient = createAdminClient()

  try {
    // 1. Récupérer les clients sans coordonnées qui ont une adresse exploitable
    const { data: clientsToGeocode, error: fetchError } = await adminClient
      .from('clients')
      .select('id, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville, adresse_societe_ligne1, adresse_societe_cp, adresse_societe_ville')
      .is('latitude', null)
      .not('monday_sync_status', 'eq', 'deleted')
      .limit(limit)

    if (fetchError) {
      console.error('Erreur fetch clients pour géocodage:', fetchError)
      return null
    }

    if (!clientsToGeocode || clientsToGeocode.length === 0) {
      return { total: 0, geocoded: 0, assigned: 0, noAddress: 0, failed: 0 }
    }

    // 2. Récupérer les dépôts actifs pour l'assignation
    const { data: depots } = await adminClient
      .from('depots')
      .select('id, nom, latitude, longitude, rayon_couverture_km, rayon_livraison_payant_km, prix_livraison_payante, type, agence')
      .eq('actif', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    const activeDepots: DepotWithCoords[] = (depots || []).map(d => ({
      ...d,
      type: d.type as 'retrait' | 'logistique',
    }))

    let geocoded = 0
    let assigned = 0
    let noAddress = 0
    let failed = 0

    // 3. Géocoder chaque client
    for (const client of clientsToGeocode) {
      const address = buildClientAddress(client)

      if (!address) {
        noAddress++
        continue
      }

      try {
        const coords = await geocodeAddress(address.adresse, address.codePostal, address.ville)

        if (coords && coords.score >= 0.4) {
          const updateData: Record<string, any> = {
            latitude: coords.lat,
            longitude: coords.lng,
            geocoding_score: coords.score,
            geocoding_source: 'post_sync',
            address_used_for_geocoding: address.source,
          }

          // Assigner au dépôt le plus proche
          if (activeDepots.length > 0) {
            const classification = classifyClientZone(coords.lat, coords.lng, activeDepots)
            if (classification.depotRetraitId) {
              updateData.depot_retrait_id = classification.depotRetraitId
            }
            if (classification.depotLogistiqueId) {
              updateData.depot_logistique_id = classification.depotLogistiqueId
            }
            if (!classification.horsZone) {
              assigned++
            }
          }

          await adminClient
            .from('clients')
            .update(updateData)
            .eq('id', client.id)

          geocoded++
        } else {
          failed++
        }

        // Petit délai pour respecter le rate limit de l'API (50 req/s)
        await new Promise(resolve => setTimeout(resolve, 50))
      } catch (err) {
        console.error(`Erreur géocodage client ${client.id}:`, err)
        failed++
      }
    }

    console.log(`Géocodage post-sync: ${geocoded}/${clientsToGeocode.length} géocodés, ${assigned} assignés, ${noAddress} sans adresse, ${failed} échecs`)

    return {
      total: clientsToGeocode.length,
      geocoded,
      assigned,
      noAddress,
      failed,
    }
  } catch (error) {
    console.error('Erreur géocodage incrémental:', error)
    return null
  }
}

/**
 * GET - Retourne le statut de synchronisation
 */
export async function GET() {
  try {
    const configured = isMondayConfigured()
    const adminClient = createAdminClient()

    // Requêtes en parallèle avec timeout implicite
    const [lastSyncResult, totalResult, syncedResult] = await Promise.all([
      adminClient
        .from('sync_monday_log')
        .select('created_at, donnees_apres')
        .eq('action', 'sync_batch')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      adminClient
        .from('clients')
        .select('id', { count: 'exact', head: true }),
      adminClient
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .not('monday_item_id', 'is', null)
        .eq('monday_sync_status', 'synced'),
    ])

    const lastSync = lastSyncResult.data
    const totalClients = totalResult.count || 0
    const syncedFromMonday = syncedResult.count || 0

    return NextResponse.json({
      configured,
      sourceOfTruth: 'monday',
      isMultiBoard: MONDAY_CONFIG.isMultiBoard,
      boardCount: MONDAY_CONFIG.allBoardIds.length,
      webhookEndpoint: '/api/webhooks/monday',
      lastSync: lastSync?.created_at || null,
      lastSyncResult: lastSync?.donnees_apres || null,
      stats: {
        totalClients,
        syncedFromMonday,
        pendingSync: totalClients - syncedFromMonday,
      },
    })
  } catch (error: any) {
    console.error('Error in GET /api/sync/monday:', error)
    return NextResponse.json({
      configured: isMondayConfigured(),
      sourceOfTruth: 'monday',
      isMultiBoard: MONDAY_CONFIG.isMultiBoard,
      error: 'Erreur lors du chargement du statut',
      stats: { totalClients: 0, syncedFromMonday: 0, pendingSync: 0 },
    })
  }
}
