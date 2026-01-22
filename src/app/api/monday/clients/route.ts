import { NextRequest, NextResponse } from 'next/server'
import { getMondayItems, parseValueFromMonday, MondayItem } from '@/lib/monday/api'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * API pour lire les clients DIRECTEMENT depuis Monday
 * Monday = Source de vérité unique
 *
 * CACHE: Les données sont mises en cache pendant 5 minutes pour éviter
 * de recharger 1200+ clients depuis Monday à chaque requête
 *
 * GET /api/monday/clients - Liste tous les clients (depuis cache si disponible)
 * GET /api/monday/clients?search=xxx - Recherche
 * GET /api/monday/clients?refresh=true - Force le rafraîchissement du cache
 */

interface MappingRecord {
  interface_field: string
  monday_column_id: string | null
  monday_column_type: string | null
}

// Cache en mémoire serveur
interface CacheData {
  clients: Record<string, any>[]
  timestamp: number
  total: number
}

let clientsCache: CacheData | null = null
const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

function isCacheValid(): boolean {
  if (!clientsCache) return false
  return Date.now() - clientsCache.timestamp < CACHE_DURATION_MS
}

async function loadClientsFromMonday(): Promise<Record<string, any>[]> {
  // 1. Récupérer le mapping dynamique depuis Supabase
  const adminClient = createAdminClient()
  const { data: mappings, error: mappingError } = await adminClient
    .from('monday_field_mapping')
    .select('interface_field, monday_column_id, monday_column_type')
    .not('monday_column_id', 'is', null)

  if (mappingError) {
    console.error('Erreur récupération mapping:', mappingError)
  }

  // Créer un index de mapping: monday_column_id -> interface_field
  const columnToFieldMap: Record<string, { field: string; type: string }> = {}
  if (mappings) {
    for (const m of mappings as MappingRecord[]) {
      if (m.monday_column_id) {
        columnToFieldMap[m.monday_column_id] = {
          field: m.interface_field,
          type: m.monday_column_type || 'text',
        }
      }
    }
  }

  // 2. Récupérer tous les items depuis Monday (pagination automatique)
  const mondayItems = await getMondayItems()

  // 3. Transformer les items Monday en format interface
  const clients = mondayItems.map((item: MondayItem) => {
    const client: Record<string, any> = {
      id: item.id, // L'ID Monday devient l'ID principal
      monday_item_id: item.id,
      raison_sociale: item.name, // Le nom Monday est toujours la raison sociale
      created_at: item.created_at,
      updated_at: item.updated_at,
    }

    // Mapper chaque colonne vers le champ interface correspondant
    for (const col of item.column_values) {
      const mapping = columnToFieldMap[col.id]
      if (mapping) {
        client[mapping.field] = parseValueFromMonday(
          col.type || mapping.type,
          col.text,
          col.value
        )
      }
    }

    return client
  })

  return clients
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.toLowerCase()
    const forceRefresh = searchParams.get('refresh') === 'true'

    let clients: Record<string, any>[]
    let fromCache = false

    // Utiliser le cache si valide et pas de refresh forcé
    if (isCacheValid() && !forceRefresh) {
      clients = clientsCache!.clients
      fromCache = true
      console.log(`📦 Cache utilisé: ${clients.length} clients`)
    } else {
      // Charger depuis Monday et mettre en cache
      console.log('🔄 Chargement depuis Monday...')
      clients = await loadClientsFromMonday()
      clientsCache = {
        clients,
        timestamp: Date.now(),
        total: clients.length,
      }
      console.log(`✅ Cache mis à jour: ${clients.length} clients`)
    }

    // Filtrer si recherche
    let filteredClients = clients
    if (search) {
      filteredClients = clients.filter((c: Record<string, any>) => {
        const searchableFields = [
          c.raison_sociale,
          c.siret,
          c.email,
          c.reference_dossier,
          c.telephone,
        ]
        return searchableFields.some(
          (field) => field && String(field).toLowerCase().includes(search)
        )
      })
    }

    // Calculer l'âge du cache en secondes
    const cacheAge = clientsCache ? Math.round((Date.now() - clientsCache.timestamp) / 1000) : 0

    return NextResponse.json({
      clients: filteredClients,
      total: filteredClients.length,
      source: 'monday',
      cached: fromCache,
      cacheAge, // Âge du cache en secondes
      cacheExpiresIn: Math.max(0, Math.round((CACHE_DURATION_MS - (Date.now() - (clientsCache?.timestamp || 0))) / 1000)), // Temps avant expiration
    })

  } catch (error: any) {
    console.error('Erreur récupération clients Monday:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de connexion à Monday' },
      { status: 500 }
    )
  }
}
