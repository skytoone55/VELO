import { NextRequest, NextResponse } from 'next/server'
import { getMondayItems, parseValueFromMonday, MondayItem } from '@/lib/monday/api'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * API pour obtenir les statistiques globales des clients
 * Utilise le même cache que /api/monday/clients
 *
 * GET /api/monday/clients/stats - Retourne les stats agrégées
 */

interface MappingRecord {
  interface_field: string
  monday_column_id: string | null
  monday_column_type: string | null
}

// Utiliser le même cache que la route principale (importé via variable globale)
// Pour éviter de dupliquer le code de cache, on va simplement appeler l'API principale
// avec tous les clients et calculer les stats

interface CacheData {
  clients: Record<string, any>[]
  timestamp: number
  total: number
}

// Cache local (synchronisé avec le cache principal via le temps de vie)
let statsCache: {
  stats: any
  timestamp: number
} | null = null

const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

function isStatsCacheValid(): boolean {
  if (!statsCache) return false
  return Date.now() - statsCache.timestamp < CACHE_DURATION_MS
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
      id: item.id,
      monday_item_id: item.id,
      raison_sociale: item.name,
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

function calculateStats(clients: Record<string, any>[]) {
  // Stats par statut commercial
  const statsByStatut: Record<string, { clients: number; velos: number }> = {}

  let velosValides = 0
  let velosLivres = 0

  for (const client of clients) {
    const statut = client.statut_commercial || 'Inconnu'
    const velos = client.velo_valide || client.velo_confirme || 0

    // Initialiser si premier client avec ce statut
    if (!statsByStatut[statut]) {
      statsByStatut[statut] = { clients: 0, velos: 0 }
    }

    // Incrémenter
    statsByStatut[statut].clients++
    statsByStatut[statut].velos += velos

    // Stats globales
    velosValides += velos
    if (statut === 'LIVRÉ') {
      velosLivres += velos
    }
  }

  return {
    total: clients.length,
    velosValides,
    velosLivres,
    statsByStatut,
  }
}

export async function GET(request: NextRequest) {
  try {
    // Utiliser le cache si valide
    if (isStatsCacheValid()) {
      console.log('📦 Stats cache utilisé')
      return NextResponse.json(statsCache!.stats)
    }

    // Charger depuis Monday et calculer les stats
    console.log('🔄 Chargement stats depuis Monday...')
    const clients = await loadClientsFromMonday()
    const stats = calculateStats(clients)

    // Mettre en cache
    statsCache = {
      stats,
      timestamp: Date.now(),
    }

    console.log(`✅ Stats calculées: ${stats.total} clients`)

    return NextResponse.json(stats)

  } catch (error: any) {
    console.error('Erreur récupération stats Monday:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de connexion à Monday' },
      { status: 500 }
    )
  }
}
