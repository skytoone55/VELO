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
 * GET /api/monday/clients - Liste les clients (paginé côté serveur)
 * GET /api/monday/clients?page=1&pageSize=20 - Pagination
 * GET /api/monday/clients?search=xxx - Recherche
 * GET /api/monday/clients?statut=xxx - Filtre par statut commercial
 * GET /api/monday/clients?departement=xxx - Filtre par département
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

    // Paramètres de pagination
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    // Filtres
    const statutFilter = searchParams.get('statut')
    const departementFilter = searchParams.get('departement')

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

    // Appliquer les filtres
    let filteredClients = clients

    // Filtre recherche texte
    if (search) {
      filteredClients = filteredClients.filter((c: Record<string, any>) => {
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

    // Filtre par statut commercial
    if (statutFilter && statutFilter !== 'all') {
      filteredClients = filteredClients.filter((c: Record<string, any>) =>
        c.statut_commercial === statutFilter
      )
    }

    // Filtre par département
    if (departementFilter && departementFilter !== 'all') {
      filteredClients = filteredClients.filter((c: Record<string, any>) => {
        const clientDept = c.departement || ''
        return clientDept === departementFilter || clientDept.includes(departementFilter)
      })
    }

    // Total après filtres (avant pagination)
    const totalFiltered = filteredClients.length

    // Appliquer la pagination côté serveur
    const startIndex = (page - 1) * pageSize
    const paginatedClients = filteredClients.slice(startIndex, startIndex + pageSize)
    const totalPages = Math.ceil(totalFiltered / pageSize)

    // Calculer l'âge du cache en secondes
    const cacheAge = clientsCache ? Math.round((Date.now() - clientsCache.timestamp) / 1000) : 0

    return NextResponse.json({
      clients: paginatedClients,
      pagination: {
        page,
        pageSize,
        totalPages,
        totalFiltered,
        totalClients: clientsCache?.total || clients.length,
        startIndex: startIndex + 1,
        endIndex: Math.min(startIndex + pageSize, totalFiltered),
      },
      source: 'monday',
      cached: fromCache,
      cacheAge,
      cacheExpiresIn: Math.max(0, Math.round((CACHE_DURATION_MS - (Date.now() - (clientsCache?.timestamp || 0))) / 1000)),
    })

  } catch (error: any) {
    console.error('Erreur récupération clients Monday:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de connexion à Monday' },
      { status: 500 }
    )
  }
}
