import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MONDAY_CONFIG, getMondayApiKey, isMondayConfigured } from '@/lib/monday/config'
import { SyncResult } from '@/lib/monday/types'

/**
 * API de synchronisation Monday.com → Supabase
 *
 * IMPORTANT: Monday.com est la SOURCE DE VÉRITÉ (SSOT)
 * - Les clients sont créés/modifiés dans Monday
 * - Supabase sert de cache/miroir pour l'application
 * - Direction principale: Monday → Supabase (PULL)
 *
 * POST /api/sync/monday - Lance une synchronisation complète
 * GET /api/sync/monday - Retourne le statut de synchronisation
 */

export async function POST(request: NextRequest) {
  try {
    if (!isMondayConfigured()) {
      return NextResponse.json(
        { error: 'Monday.com non configuré. Vérifiez MONDAY_API_KEY et MONDAY_BOARD_ID.', configured: false },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { fullSync = false } = body

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

    // Synchroniser depuis Monday vers Supabase
    await syncMondayToSupabase(result, fullSync)

    // Log l'opération
    const adminClient = createAdminClient()
    await adminClient.from('sync_monday_log').insert({
      action: 'sync_batch',
      direction: 'monday_to_supabase',
      statut: result.success ? 'success' : 'error',
      donnees_apres: result,
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
 * Synchronise tous les items Monday vers Supabase
 * Monday est la source de vérité - on crée/met à jour dans Supabase
 */
async function syncMondayToSupabase(result: SyncResult, fullSync: boolean = false) {
  const apiKey = getMondayApiKey()
  if (!apiKey) {
    result.success = false
    result.errors.push({ error: 'API Key Monday non configurée' })
    return
  }

  const adminClient = createAdminClient()
  let cursor: string | null = null
  let hasMore = true

  while (hasMore) {
    // Query avec pagination
    const graphqlQuery: string = `
      query {
        boards(ids: [${MONDAY_CONFIG.boardIds.clients}]) {
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
        result.errors.push({ error: 'Erreur API Monday', details: data.errors })
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

          // Vérifier si ce client existe déjà dans Supabase
          const { data: existingClient } = await adminClient
            .from('clients')
            .select('id, monday_synced_at')
            .eq('monday_item_id', mondayItemId)
            .single()

          // Mapper les colonnes Monday vers les champs Supabase
          const clientData = mapMondayItemToClient(item)

          if (existingClient) {
            // Vérifier si une mise à jour est nécessaire
            const mondayUpdatedAt = item.updated_at ? new Date(item.updated_at) : new Date()
            const supabaseSyncedAt = existingClient.monday_synced_at
              ? new Date(existingClient.monday_synced_at)
              : new Date(0)

            // Mettre à jour si Monday a été modifié après la dernière sync ou si fullSync
            if (fullSync || mondayUpdatedAt > supabaseSyncedAt) {
              await adminClient
                .from('clients')
                .update({
                  ...clientData,
                  monday_synced_at: new Date().toISOString(),
                  monday_sync_status: 'synced',
                  updated_at: new Date().toISOString(),
                })
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
          console.error(`Error syncing item ${item.id}:`, err)
          result.errors.push({
            mondayItemId: item.id,
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
      result.errors.push({ error: 'Erreur connexion Monday', details: err.message })
      hasMore = false
    }
  }

  result.success = result.errors.length === 0
}

/**
 * Mappe un item Monday vers un objet client Supabase
 * Utilise le mapping complet défini dans MONDAY_CONFIG
 */
function mapMondayItemToClient(item: any): Record<string, any> {
  const client: Record<string, any> = {
    raison_sociale: item.name,
  }

  for (const col of item.column_values || []) {
    const supabaseField = (MONDAY_CONFIG.mondayToSupabaseMapping as Record<string, string>)[col.id]
    if (!supabaseField) continue

    let value = extractColumnValue(col)
    if (value === null || value === undefined || value === '') continue

    // Mapper les valeurs des colonnes status selon leur type
    switch (col.id) {
      case 'color_mkvfws5n': // Statut commercial (PRINCIPAL)
        value = (MONDAY_CONFIG.mondayToSupabaseStatutCommercial as Record<string, string>)[value] || value
        break
      case 'color_mkvdkzxh': // Département
        value = (MONDAY_CONFIG.mondayToSupabaseDepartement as Record<string, string>)[value] || value
        break
      case 'color_mkvgsswc': // StatutRETINA
        value = (MONDAY_CONFIG.mondayToSupabaseStatutRetina as Record<string, string>)[value] || value
        break
      case 'color_mkyqn153': // statut mail
        value = (MONDAY_CONFIG.mondayToSupabaseStatutMail as Record<string, string>)[value] || value
        break
      case 'color_mkvp4dmz': // StatutAnomalie
        value = (MONDAY_CONFIG.mondayToSupabaseStatutAnomalie as Record<string, string>)[value] || value
        break
      case 'color_mkvn1kg0': // doublon_RETINA
        value = (MONDAY_CONFIG.mondayToSupabaseStatutDoublon as Record<string, string>)[value] || value
        break
      case 'multiple_person_mkvd4axb': // Commercial attribué (people)
      case 'multiple_person_mkve97pm': // Équipe (people)
        // Extraire les IDs des personnes et les stocker en JSON
        value = extractPeopleIds(col)
        break
    }

    client[supabaseField] = value
  }

  return client
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
  // Valeur texte directe
  if (col.text !== null && col.text !== undefined && col.text !== '') {
    return col.text
  }

  // Parser la valeur JSON si présente
  if (col.value) {
    try {
      const parsed = JSON.parse(col.value)

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
 * GET - Retourne le statut de synchronisation
 */
export async function GET() {
  const configured = isMondayConfigured()
  const adminClient = createAdminClient()

  // Dernière sync
  const { data: lastSync } = await adminClient
    .from('sync_monday_log')
    .select('*')
    .eq('action', 'sync_batch')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Derniers webhooks reçus
  const { data: recentWebhooks } = await adminClient
    .from('sync_monday_log')
    .select('*')
    .like('action', 'webhook_%')
    .order('created_at', { ascending: false })
    .limit(10)

  // Compteurs
  const { count: totalClients } = await adminClient
    .from('clients')
    .select('id', { count: 'exact', head: true })

  const { count: syncedFromMonday } = await adminClient
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .not('monday_item_id', 'is', null)
    .eq('monday_sync_status', 'synced')

  const { count: pendingSync } = await adminClient
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .or('monday_item_id.is.null,monday_sync_status.neq.synced')

  return NextResponse.json({
    configured,
    sourceOfTruth: 'monday', // Indique que Monday est la source de vérité
    webhookEndpoint: '/api/webhooks/monday',
    lastSync: lastSync?.created_at || null,
    lastSyncResult: lastSync?.donnees_apres || null,
    recentWebhooks: recentWebhooks || [],
    stats: {
      totalClients: totalClients || 0,
      syncedFromMonday: syncedFromMonday || 0,
      pendingSync: pendingSync || 0,
    },
  })
}
