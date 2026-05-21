import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePagination } from '@/lib/constants'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { expandCommercialCodes } from '@/lib/tenants/commercial'

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
    const livreurFilter = searchParams.get('livreur')

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
    // La jointure commercial:commercial_code(code,nom,parent_code) alimente CommercialCell
    let query = adminClient
      .from('clients')
      .select('*, commercial:commercial_code(code, nom, parent_code)', { count: 'exact' })
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

    // Filtre par statut commercial (multi-select, valeurs séparées par virgule)
    if (statutFilter && statutFilter !== 'all') {
      const statuts = statutFilter.split(',').filter(Boolean)
      if (statuts.length === 1) {
        if (statuts[0] === '__null__') query = query.is('statut_commercial', null)
        else query = query.eq('statut_commercial', statuts[0])
      } else if (statuts.length > 1) {
        query = query.in('statut_commercial', statuts)
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

    // Filtre par commercial (via commercial_code + expansion master→enfants)
    if (commercialFilter && commercialFilter !== 'all') {
      const commercials = commercialFilter.split(',').filter(Boolean)
      const tenant = process.env.NEXT_PUBLIC_TENANT_ID || 'ecovolt'
      const expandedCodes = await expandCommercialCodes(adminClient as any, tenant, commercials)
      if (expandedCodes !== null) {
        if (expandedCodes.length === 1) query = query.eq('commercial_code', expandedCodes[0])
        else query = query.in('commercial_code', expandedCodes)
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

    // Filtre par livreur (via livraisons.livreur_id → client_id)
    if (livreurFilter && livreurFilter !== 'all') {
      const livreurs = livreurFilter.split(',').filter(Boolean)
      if (livreurs.length > 0) {
        const { data: livLivreur } = await adminClient
          .from('livraisons')
          .select('client_id')
          .in('livreur_id', livreurs)
        const livreurClientIds = [...new Set((livLivreur || []).map(l => l.client_id).filter(Boolean) as string[])]
        if (livreurClientIds.length === 0) {
          return NextResponse.json({
            clients: [],
            pagination: { page, pageSize, totalPages: 0, totalFiltered: 0, totalClients: 0, startIndex: 0, endIndex: 0, velosValidesFiltered: 0 },
            source: 'supabase',
          })
        }
        query = query.in('id', livreurClientIds)
      }
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
      const statuts = statutFilter.split(',').filter(Boolean)
      if (statuts.length === 1) {
        if (statuts[0] === '__null__') velosQuery = velosQuery.is('statut_commercial', null)
        else velosQuery = velosQuery.eq('statut_commercial', statuts[0])
      } else if (statuts.length > 1) {
        velosQuery = velosQuery.in('statut_commercial', statuts)
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
      const commercials = commercialFilter.split(',').filter(Boolean)
      const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'ecovolt'
      if (tenantId === 'ppe') {
        if (commercials.length === 1) velosQuery = velosQuery.eq('monday_board_id', commercials[0])
        else if (commercials.length > 1) velosQuery = velosQuery.in('monday_board_id', commercials)
      } else {
        if (commercials.length === 1) velosQuery = velosQuery.eq('email', commercials[0])
        else if (commercials.length > 1) velosQuery = velosQuery.in('email', commercials)
      }
    }
    if (depotFilter && depotFilter !== 'all') {
      velosQuery = velosQuery.or(`depot_retrait_id.eq.${depotFilter},depot_logistique_id.eq.${depotFilter}`)
    }
    if (enematFilter && enematFilter !== 'all') {
      velosQuery = velosQuery.eq('in_enemat', enematFilter === 'oui')
    }
    // Restreindre aux dépôts de l'agent (même filtre que la query principale)
    if (authResult.role === 'agent_secteur' && authResult.depot_ids?.length) {
      velosQuery = velosQuery.or(`depot_retrait_id.in.(${authResult.depot_ids.join(',')}),depot_logistique_id.in.(${authResult.depot_ids.join(',')})`)
    }
    if (livreurFilter && livreurFilter !== 'all') {
      const livreurs = livreurFilter.split(',').filter(Boolean)
      if (livreurs.length > 0) {
        const { data: livLivreur2 } = await adminClient
          .from('livraisons')
          .select('client_id')
          .in('livreur_id', livreurs)
        const livreurClientIds2 = [...new Set((livLivreur2 || []).map(l => l.client_id).filter(Boolean) as string[])]
        if (livreurClientIds2.length > 0) {
          velosQuery = velosQuery.in('id', livreurClientIds2)
        }
      }
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

    // Paginer pour dépasser la limite Supabase de 1000 rows
    let allVelosData: any[] = []
    let veloOffset = 0
    const VELO_PAGE = 1000
    let hasMoreVelos = true
    while (hasMoreVelos) {
      const { data: batch } = await velosQuery.range(veloOffset, veloOffset + VELO_PAGE - 1)
      if (batch && batch.length > 0) {
        allVelosData = allVelosData.concat(batch)
        veloOffset += VELO_PAGE
        if (batch.length < VELO_PAGE) hasMoreVelos = false
      } else {
        hasMoreVelos = false
      }
    }
    const velosValidesFiltered = allVelosData.reduce((sum, c) => sum + (Number(c.velo_valide) || 0), 0)

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
