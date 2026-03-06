import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePagination } from '@/lib/constants'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * API pour lire les clients depuis SUPABASE (cache local)
 *
 * Architecture:
 * - Monday = Source de vérité (SSOT)
 * - Supabase = Cache local synchronisé via webhook
 * - Cette API = Lecture rapide depuis le cache
 *
 * La synchronisation Monday → Supabase se fait via:
 * 1. Webhook /api/webhooks/monday (temps réel)
 * 2. Sync manuelle /api/sync/monday (batch)
 *
 * GET /api/clients - Liste les clients (paginé)
 * GET /api/clients?page=1&pageSize=20 - Pagination
 * GET /api/clients?search=xxx - Recherche
 * GET /api/clients?statut=xxx - Filtre par statut commercial
 * GET /api/clients?departement=xxx - Filtre par département
 */

export async function GET(request: NextRequest) {
  try {
    // Clients accessible by admin_general, admin_regional, agent_regional
    const authResult = await requireRole(['admin_general', 'admin_regional', 'agent_regional'])
    if (isAuthError(authResult)) return authResult

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.toLowerCase()

    // Paramètres de pagination avec validation
    const { page, pageSize } = validatePagination(
      searchParams.get('page') || '1',
      searchParams.get('pageSize') || '20'
    )

    // Filtres
    const statutFilter = searchParams.get('statut')
    const departementFilter = searchParams.get('departement')
    const nafFilter = searchParams.get('naf')
    const zoneFilter = searchParams.get('zone')
    const commercialFilter = searchParams.get('commercial')

    // Tri serveur
    const sortByParam = searchParams.get('sortBy') || 'updated_at'
    const sortOrderParam = searchParams.get('sortOrder') || 'desc'
    const SORTABLE_COLUMNS = [
      'raison_sociale', 'email', 'email_beneficiaire', 'departement',
      'velo_devis', 'statut_commercial', 'validation_naf', 'telephone',
      'updated_at', 'created_at', 'monday_board_id', 'type_de_zone',
    ]
    const safeSortBy = SORTABLE_COLUMNS.includes(sortByParam) ? sortByParam : 'updated_at'
    const ascending = sortOrderParam === 'asc'

    const adminClient = createAdminClient()

    // Construire la requête de base
    let query = adminClient
      .from('clients')
      .select('*', { count: 'exact' })
      .not('monday_sync_status', 'eq', 'deleted') // Exclure les supprimés

    // Appliquer les filtres

    // Filtre recherche texte (ilike pour case-insensitive)
    if (search) {
      query = query.or(
        `raison_sociale.ilike.%${search}%,` +
        `siret.ilike.%${search}%,` +
        `email.ilike.%${search}%,` +
        `reference_dossier.ilike.%${search}%,` +
        `telephone.ilike.%${search}%`
      )
    }

    // Filtre par statut commercial
    if (statutFilter && statutFilter !== 'all') {
      if (statutFilter === '__null__') {
        query = query.is('statut_commercial', null)
      } else {
        query = query.eq('statut_commercial', statutFilter)
      }
    }

    // Filtre par departement (ou derive du code postal pour PPE)
    if (departementFilter && departementFilter !== 'all') {
      query = query.or(
        `departement.eq.${departementFilter},adresse_societe_cp.like.${departementFilter}%`
      )
    }

    // Filtre par validation NAF
    if (nafFilter && nafFilter !== 'all') {
      if (nafFilter === 'valide') {
        query = query.eq('validation_naf', 'OUI')
      } else if (nafFilter === 'bloque') {
        query = query.eq('validation_naf', 'NON')
      } else if (nafFilter === 'en_attente') {
        query = query.eq('validation_naf', 'A VERIFIER')
      }
    }

    // Filtre par type de zone
    if (zoneFilter && zoneFilter !== 'all') {
      query = query.eq('type_de_zone', zoneFilter)
    }

    // Filtre par commercial (tenant-aware)
    if (commercialFilter && commercialFilter !== 'all') {
      const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'ecovolt'
      if (tenantId === 'ppe') {
        // PPE : commercial = board Monday → filtrer par monday_board_id
        query = query.eq('monday_board_id', commercialFilter)
      } else {
        // Ecovolt : commercial = email agent → filtrer par email
        query = query.eq('email', commercialFilter)
      }
    }

    // Compter le total avant pagination
    const { count: totalFiltered } = await query

    // Requête séparée pour sommer les vélos validés sur TOUS les résultats filtrés (pas juste la page)
    let velosQuery = adminClient
      .from('clients')
      .select('velo_valide')
      .not('monday_sync_status', 'eq', 'deleted')

    // Ré-appliquer les mêmes filtres
    if (search) {
      velosQuery = velosQuery.or(
        `raison_sociale.ilike.%${search}%,` +
        `siret.ilike.%${search}%,` +
        `email.ilike.%${search}%,` +
        `reference_dossier.ilike.%${search}%,` +
        `telephone.ilike.%${search}%`
      )
    }
    if (statutFilter && statutFilter !== 'all') {
      if (statutFilter === '__null__') {
        velosQuery = velosQuery.is('statut_commercial', null)
      } else {
        velosQuery = velosQuery.eq('statut_commercial', statutFilter)
      }
    }
    if (departementFilter && departementFilter !== 'all') {
      velosQuery = velosQuery.or(
        `departement.eq.${departementFilter},adresse_societe_cp.like.${departementFilter}%`
      )
    }
    if (nafFilter && nafFilter !== 'all') {
      if (nafFilter === 'valide') velosQuery = velosQuery.eq('validation_naf', 'OUI')
      else if (nafFilter === 'bloque') velosQuery = velosQuery.eq('validation_naf', 'NON')
      else if (nafFilter === 'en_attente') velosQuery = velosQuery.eq('validation_naf', 'A VERIFIER')
    }
    if (zoneFilter && zoneFilter !== 'all') {
      velosQuery = velosQuery.eq('type_de_zone', zoneFilter)
    }
    if (commercialFilter && commercialFilter !== 'all') {
      const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'ecovolt'
      if (tenantId === 'ppe') {
        velosQuery = velosQuery.eq('monday_board_id', commercialFilter)
      } else {
        velosQuery = velosQuery.eq('email', commercialFilter)
      }
    }

    const { data: velosData } = await velosQuery
    const velosValidesFiltered = (velosData || []).reduce((sum, c) => sum + (Number(c.velo_valide) || 0), 0)

    // Appliquer la pagination
    const startIndex = (page - 1) * pageSize
    query = query
      .order(safeSortBy, { ascending })
      .range(startIndex, startIndex + pageSize - 1)

    const { data: clients, error } = await query

    if (error) {
      throw error
    }

    // Compter le total de clients (sans filtres)
    const { count: totalClients } = await adminClient
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .not('monday_sync_status', 'eq', 'deleted')

    const totalPages = Math.ceil((totalFiltered || 0) / pageSize)

    return NextResponse.json({
      clients: clients || [],
      pagination: {
        page,
        pageSize,
        totalPages,
        totalFiltered: totalFiltered || 0,
        totalClients: totalClients || 0,
        startIndex: startIndex + 1,
        endIndex: Math.min(startIndex + pageSize, totalFiltered || 0),
        velosValidesFiltered,
      },
      source: 'supabase',
    })

  } catch (error) {
    console.error('Erreur récupération clients Supabase:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur de connexion à Supabase' },
      { status: 500 }
    )
  }
}
