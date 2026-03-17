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
    // Clients accessible by super_admin, admin, agent_secteur
    const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur'])
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
    const depotFilter = searchParams.get('depot')
    const controleFilter = searchParams.get('controle')
    const enematFilter = searchParams.get('enemat')

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

    // Filtrage agent_secteur par dépôts assignés
    if (authResult.role === 'agent_secteur') {
      if (!authResult.depot_ids?.length) {
        return NextResponse.json({
          clients: [],
          pagination: { page: 1, pageSize: 20, totalPages: 0, totalFiltered: 0, totalClients: 0, startIndex: 0, endIndex: 0, velosValidesFiltered: 0 },
          source: 'supabase',
        })
      }
    }

    // Construire la requête de base
    let query = adminClient
      .from('clients')
      .select('*', { count: 'exact' })
      .not('monday_sync_status', 'eq', 'deleted') // Exclure les supprimés

    // Restreindre aux dépôts de l'agent
    if (authResult.role === 'agent_secteur' && authResult.depot_ids?.length) {
      query = query.or(`depot_retrait_id.in.(${authResult.depot_ids.join(',')}),depot_logistique_id.in.(${authResult.depot_ids.join(',')})`)
    }

    // Appliquer les filtres

    // Filtre recherche texte (ilike pour case-insensitive)
    if (search) {
      query = query.or(
        `raison_sociale.ilike.%${search}%,` +
        `siret.ilike.%${search}%,` +
        `email.ilike.%${search}%,` +
        `reference_dossier.ilike.%${search}%,` +
        `reference_retina.ilike.%${search}%,` +
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

    // Filtre par departement (ou derive du code postal pour PPE/Ecovolt)
    if (departementFilter && departementFilter !== 'all') {
      const depts = departementFilter.split(',').filter(Boolean)
      const normalDepts = depts.filter(d => d !== 'hors_dom')
      const hasHorsDom = depts.includes('hors_dom')

      if (hasHorsDom && normalDepts.length === 0) {
        query = query.not('adresse_societe_cp', 'like', '97%')
      } else if (hasHorsDom && normalDepts.length > 0) {
        query = query.or(
          [...normalDepts.flatMap(d => [`departement.eq.${d}`, `adresse_societe_cp.like.${d}%`]), 'adresse_societe_cp.not.like.97%'].join(',')
        )
      } else if (normalDepts.length === 1) {
        query = query.or(
          `departement.eq.${normalDepts[0]},adresse_societe_cp.like.${normalDepts[0]}%`
        )
      } else if (normalDepts.length > 1) {
        query = query.or(
          normalDepts.flatMap(d => [`departement.eq.${d}`, `adresse_societe_cp.like.${d}%`]).join(',')
        )
      }
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

    // Filtre par dépôt (retrait OU logistique)
    if (depotFilter && depotFilter !== 'all') {
      query = query.or(`depot_retrait_id.eq.${depotFilter},depot_logistique_id.eq.${depotFilter}`)
    }

    // Filtre ENEMAT
    if (enematFilter && enematFilter !== 'all') {
      query = query.eq('in_enemat', enematFilter === 'oui')
    }

    // Filtre par contrôle qualité (via livraisons)
    // ok = client a une livraison cq_valide | en_cours = cq_en_cours | attente = livree mais pas commencé
    if (controleFilter && controleFilter !== 'all') {
      // Requête unique pour récupérer les 3 catégories
      const { data: allCqLivraisons } = await adminClient
        .from('livraisons')
        .select('client_id, cq_valide, cq_en_cours, statut')

      const livraisons = allCqLivraisons || []
      const okIds = [...new Set(livraisons.filter(l => l.cq_valide === true).map(l => l.client_id).filter(Boolean))]
      const enCoursIds = [...new Set(livraisons.filter(l => l.cq_en_cours === true && !l.cq_valide).map(l => l.client_id).filter(Boolean))]
      const attenteIds = [...new Set(livraisons.filter(l => l.statut === 'livree' && !l.cq_valide && !l.cq_en_cours).map(l => l.client_id).filter(Boolean))]

      let targetIds: string[] = []
      if (controleFilter === 'ok') targetIds = okIds
      else if (controleFilter === 'en_cours') targetIds = enCoursIds
      else if (controleFilter === 'attente') targetIds = attenteIds

      if (targetIds.length > 0) {
        query = query.in('id', targetIds)
      } else {
        return NextResponse.json({
          clients: [],
          pagination: { page, pageSize, totalPages: 0, totalFiltered: 0, totalClients: 0, startIndex: 0, endIndex: 0, velosValidesFiltered: 0 },
          source: 'supabase',
        })
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
        `reference_retina.ilike.%${search}%,` +
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
      const depts = departementFilter.split(',').filter(Boolean)
      const normalDepts = depts.filter(d => d !== 'hors_dom')
      const hasHorsDom = depts.includes('hors_dom')

      if (hasHorsDom && normalDepts.length === 0) {
        velosQuery = velosQuery.not('adresse_societe_cp', 'like', '97%')
      } else if (hasHorsDom && normalDepts.length > 0) {
        velosQuery = velosQuery.or(
          [...normalDepts.flatMap(d => [`departement.eq.${d}`, `adresse_societe_cp.like.${d}%`]), 'adresse_societe_cp.not.like.97%'].join(',')
        )
      } else if (normalDepts.length === 1) {
        velosQuery = velosQuery.or(
          `departement.eq.${normalDepts[0]},adresse_societe_cp.like.${normalDepts[0]}%`
        )
      } else if (normalDepts.length > 1) {
        velosQuery = velosQuery.or(
          normalDepts.flatMap(d => [`departement.eq.${d}`, `adresse_societe_cp.like.${d}%`]).join(',')
        )
      }
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
    if (depotFilter && depotFilter !== 'all') {
      velosQuery = velosQuery.or(`depot_retrait_id.eq.${depotFilter},depot_logistique_id.eq.${depotFilter}`)
    }
    if (controleFilter && controleFilter !== 'all') {
      // Réutilise la même logique que le filtre principal (ok/en_cours/attente)
      const { data: cqLiv2 } = await adminClient
        .from('livraisons')
        .select('client_id, cq_valide, cq_en_cours, statut')
      const liv2 = cqLiv2 || []
      let veloTargetIds: string[] = []
      if (controleFilter === 'ok') veloTargetIds = [...new Set(liv2.filter(l => l.cq_valide === true).map(l => l.client_id).filter(Boolean))]
      else if (controleFilter === 'en_cours') veloTargetIds = [...new Set(liv2.filter(l => l.cq_en_cours === true && !l.cq_valide).map(l => l.client_id).filter(Boolean))]
      else if (controleFilter === 'attente') veloTargetIds = [...new Set(liv2.filter(l => l.statut === 'livree' && !l.cq_valide && !l.cq_en_cours).map(l => l.client_id).filter(Boolean))]
      if (veloTargetIds.length > 0) {
        velosQuery = velosQuery.in('id', veloTargetIds)
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
