import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePagination } from '@/lib/constants'

/**
 * GET /api/livraisons
 * Liste paginee des livraisons avec jointures client + depot.
 * Filtres : search, statut, depot, commercial, departement, zone, sortBy, sortOrder
 */
export async function GET(request: NextRequest) {
  try {
    // Auth — même pattern que /api/admin/clients (qui marche)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users_profile')
      .select('role, territoire, departement, depot_ids')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role === 'client') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const currentUser = { id: user.id, role: profile.role, depot_ids: profile.depot_ids }

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
      'created_at', 'updated_at', 'statut', 'mode_livraison', 'date_programmation',
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
          depot_retrait_id, depot_logistique_id
        ),
        depot:depots(id, nom)
      `, { count: 'exact' })

    if (clientIds) {
      query = query.in('client_id', clientIds)
    }

    if (statutFilter && statutFilter !== 'all') {
      query = query.eq('statut', statutFilter)
    }

    if (depotFilter && depotFilter !== 'all') {
      // Chercher sur depot_id de la livraison OU depot_retrait_id/depot_logistique_id du client
      const { data: depotClientIds } = await adminClient
        .from('clients')
        .select('id')
        .or(`depot_retrait_id.eq.${depotFilter},depot_logistique_id.eq.${depotFilter}`)

      const depotClients = (depotClientIds || []).map(c => c.id)

      if (depotClients.length > 0) {
        query = query.or(`depot_id.eq.${depotFilter},client_id.in.(${depotClients.join(',')})`)
      } else {
        query = query.eq('depot_id', depotFilter)
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

    if (error) {
      console.error('Erreur requete livraisons:', JSON.stringify(error))
      throw error
    }
    console.log(`[API livraisons] ${data?.length || 0} resultats, count=${count}, role=${currentUser.role}`)

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
  } catch (error: any) {
    console.error('Erreur API livraisons:', error)
    return NextResponse.json(
      { error: error?.message || error?.details || JSON.stringify(error) || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
