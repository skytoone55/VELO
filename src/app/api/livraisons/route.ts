import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePagination } from '@/lib/constants'
import { requireRole, isAuthError, type AuthenticatedUser } from '@/lib/auth/require-role'

/**
 * GET /api/livraisons
 * Liste paginee des livraisons avec jointures client + depot.
 * Filtres : search, statut, depot, commercial, departement, zone, sortBy, sortOrder
 */
export async function GET(request: NextRequest) {
  try {
    // Livraisons accessible by all admin roles
    const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
    if (isAuthError(authResult)) return authResult
    const currentUser = authResult as AuthenticatedUser

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.toLowerCase()

    const { page, pageSize } = validatePagination(
      searchParams.get('page') || '1',
      searchParams.get('pageSize') || '20'
    )

    const statutFilter = searchParams.get('statut')
    const depotFilter = searchParams.get('depot')
    const commercialFilter = searchParams.get('commercial')
    const departementFilter = searchParams.get('departement')
    const zoneFilter = searchParams.get('zone')

    const sortByParam = searchParams.get('sortBy') || 'created_at'
    const sortOrderParam = searchParams.get('sortOrder') || 'desc'
    const SORTABLE_COLUMNS = [
      'created_at', 'updated_at', 'statut', 'mode_livraison', 'date_programmation', 'creneau_date',
    ]
    const safeSortBy = SORTABLE_COLUMNS.includes(sortByParam) ? sortByParam : 'created_at'
    const ascending = sortOrderParam === 'asc'

    const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'ecovolt'
    const adminClient = createAdminClient()

    // Etape 1 : si filtres sur champs client, recuperer les IDs matching
    let clientIds: string[] | null = null

    if (search || commercialFilter && commercialFilter !== 'all' || departementFilter && departementFilter !== 'all' || zoneFilter && zoneFilter !== 'all') {
      let clientQuery = adminClient
        .from('clients')
        .select('id')
        .not('monday_sync_status', 'eq', 'deleted')

      if (search) {
        clientQuery = clientQuery.or(
          `raison_sociale.ilike.%${search}%,siret.ilike.%${search}%,email_beneficiaire.ilike.%${search}%,telephone.ilike.%${search}%`
        )
      }

      if (departementFilter && departementFilter !== 'all') {
        // PPE: departement vaut souvent 'FR' (pays Monday), filtrer par CP
        clientQuery = clientQuery.ilike('adresse_societe_cp', `${departementFilter}%`)
      }

      if (commercialFilter && commercialFilter !== 'all') {
        if (tenantId === 'ppe') {
          clientQuery = clientQuery.eq('monday_board_id', commercialFilter)
        } else {
          clientQuery = clientQuery.eq('email', commercialFilter)
        }
      }

      if (zoneFilter && zoneFilter !== 'all') {
        clientQuery = clientQuery.eq('type_de_zone', zoneFilter)
      }

      const { data: matchingClients } = await clientQuery
      clientIds = matchingClients?.map(c => c.id) || []

      // Aucun client ne correspond = aucune livraison
      if (clientIds.length === 0) {
        return NextResponse.json({
          livraisons: [],
          pagination: { page, pageSize, totalPages: 0, totalFiltered: 0, startIndex: 0, endIndex: 0 },
        })
      }
    }

    // Etape 2 : requete livraisons
    let query = adminClient
      .from('livraisons')
      .select(`
        *,
        client:clients!inner(
          id, raison_sociale, siret, email, email_beneficiaire, telephone,
          departement, adresse_societe_cp, commercial_assigne, monday_board_id,
          statut_commercial, validation_naf, type_de_zone, velo_devis, agence,
          reference_retina
        ),
        depot:depots(id, nom)
      `, { count: 'exact' })

    if (clientIds) {
      query = query.in('client_id', clientIds)
    }

    if (statutFilter && statutFilter !== 'all') {
      const statuts = statutFilter.split(',').filter(Boolean)
      if (statuts.length === 1) {
        query = query.eq('statut', statuts[0])
      } else if (statuts.length > 1) {
        query = query.in('statut', statuts)
      }
    }

    if (depotFilter && depotFilter !== 'all') {
      const depots = depotFilter.split(',').filter(Boolean)
      if (depots.length === 1) {
        query = query.eq('depot_id', depots[0])
      } else if (depots.length > 1) {
        query = query.in('depot_id', depots)
      }
    }

    // Role-based data filtering
    if (currentUser.role === 'agent_secteur' && currentUser.depot_ids?.length) {
      query = query.in('depot_id', currentUser.depot_ids)
    } else if (currentUser.role === 'livreur') {
      query = query.eq('livreur_id', currentUser.id)
    }

    // Pagination + tri
    const startIndex = (page - 1) * pageSize
    query = query
      .order(safeSortBy, { ascending })
      .range(startIndex, startIndex + pageSize - 1)

    const { data, error, count } = await query

    if (error) throw error

    const totalFiltered = count || 0
    const totalPages = Math.ceil(totalFiltered / pageSize)

    return NextResponse.json({
      livraisons: data || [],
      pagination: {
        page,
        pageSize,
        totalPages,
        totalFiltered,
        startIndex: startIndex + 1,
        endIndex: Math.min(startIndex + pageSize, totalFiltered),
      },
    })
  } catch (error) {
    console.error('Erreur API livraisons:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
