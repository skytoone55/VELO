import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePagination } from '@/lib/constants'
import { requireRole, isAuthError, type AuthenticatedUser } from '@/lib/auth/require-role'
import { expandCommercialCodes } from '@/lib/tenants/commercial'

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
    const controleFilter = searchParams.get('controle')
    const enematFilter = searchParams.get('enemat')
    const livreurFilter = searchParams.get('livreur')

    const sortByParam = searchParams.get('sortBy') || 'created_at'
    const sortOrderParam = searchParams.get('sortOrder') || 'desc'
    const SORTABLE_COLUMNS = [
      'created_at', 'updated_at', 'statut', 'mode_livraison', 'date_programmation',
      'creneau_date', 'date_livraison_effective',
    ]
    const safeSortBy = SORTABLE_COLUMNS.includes(sortByParam) ? sortByParam : 'created_at'
    const ascending = sortOrderParam === 'asc'
    // Quand on trie par "Date prévue", on veut une chronologie pertinente :
    // date_livraison_effective (si livrée) > creneau_date (si planifié) > created_at.
    // Les colonnes secondaires servent de fallback quand la primaire est NULL.
    const isDateSort = safeSortBy === 'creneau_date'

    const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'ecovolt'
    const adminClient = createAdminClient()

    // Etape 1 : si filtres sur champs client, recuperer les IDs matching
    let clientIds: string[] | null = null

    const hasCommercial = commercialFilter && commercialFilter !== 'all'
    const hasDepartement = departementFilter && departementFilter !== 'all'
    const hasZone = zoneFilter && zoneFilter !== 'all'
    const hasControle = controleFilter && controleFilter !== 'all'
    const hasEnemat = enematFilter && enematFilter !== 'all'

    // Note: hasControle, hasEnemat, hasZone ne sont PAS inclus ici — filtres appliques en etape 2 via jointure inner
    // (hasZone exclu pour eviter la troncature Supabase REST a 1000 IDs quand >1000 clients matchent)
    if (search || hasCommercial || hasDepartement) {
      let clientQuery = adminClient
        .from('clients')
        .select('id')
        .not('monday_sync_status', 'eq', 'deleted')

      if (search) {
        clientQuery = clientQuery.or(
          `raison_sociale.ilike.%${search}%,siret.ilike.%${search}%,email_beneficiaire.ilike.%${search}%,telephone.ilike.%${search}%,reference_retina.ilike.%${search}%`
        )
      }

      if (hasDepartement) {
        const depts = departementFilter!.split(',').filter(Boolean)
        // Gérer le cas spécial 'hors_dom' pour Ecovolt
        const normalDepts = depts.filter(d => d !== 'hors_dom')
        const hasHorsDom = depts.includes('hors_dom')

        if (hasHorsDom && normalDepts.length === 0) {
          // Seulement hors_dom
          clientQuery = clientQuery.not('adresse_societe_cp', 'like', '97%')
        } else if (hasHorsDom && normalDepts.length > 0) {
          // hors_dom + départements normaux
          clientQuery = clientQuery.or(
            [...normalDepts.map(d => `adresse_societe_cp.ilike.${d}%`), 'adresse_societe_cp.not.like.97%'].join(',')
          )
        } else if (normalDepts.length === 1) {
          clientQuery = clientQuery.or(
            `departement.eq.${normalDepts[0]},adresse_societe_cp.ilike.${normalDepts[0]}%`
          )
        } else if (normalDepts.length > 1) {
          clientQuery = clientQuery.or(
            normalDepts.flatMap(d => [`departement.eq.${d}`, `adresse_societe_cp.ilike.${d}%`]).join(',')
          )
        }
      }

      if (hasCommercial) {
        const commercials = commercialFilter!.split(',').filter(Boolean)
        const expandedCodes = await expandCommercialCodes(adminClient as any, tenantId, commercials)
        if (expandedCodes !== null) {
          if (expandedCodes.length === 1) {
            clientQuery = clientQuery.eq('commercial_code', expandedCodes[0])
          } else {
            clientQuery = clientQuery.in('commercial_code', expandedCodes)
          }
        }
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
        client:clients!livraisons_client_id_fkey!inner(
          id, raison_sociale, siret, email, email_beneficiaire, telephone,
          contact_nom, contact_prenom,
          departement, adresse_societe_cp, commercial_assigne, commercial_code, monday_board_id,
          statut_commercial, validation_naf, type_de_zone, velo_devis, velo_valide, agence,
          reference_retina, depot_retrait_id, depot_logistique_id, monday_item_id,
          in_enemat, statut_enemat, numero_lot_enemat, numero_facture_enemat,
          commercial:commercial_code(code, nom, parent_code)
        ),
        depot:depots(id, nom)
      `, { count: 'exact' })

    // Masquer les annulées sauf si l'utilisateur les demande explicitement.
    // Raison : une livraison annulée = ancienne version remplacée par une nouvelle,
    // pas une vraie annulation business. Elles polluent la vue par défaut.
    const explicitAnnulee = statutFilter
      ? statutFilter.split(',').filter(Boolean).includes('annulee')
      : false

    if (statutFilter && statutFilter !== 'all') {
      const statuts = statutFilter.split(',').filter(Boolean)
      if (statuts.length === 1) {
        query = query.eq('statut', statuts[0])
      } else if (statuts.length > 1) {
        query = query.in('statut', statuts)
      }
    } else if (!explicitAnnulee) {
      query = query.neq('statut', 'annulee')
    }

    // Apply search filter (client IDs from step 1)
    if (clientIds) {
      query = query.in('client_id', clientIds)
    }

    // Filtre ENEMAT via jointure inner (evite liste d'IDs trop longue)
    if (hasEnemat) {
      query = query.eq('client.in_enemat', enematFilter === 'oui')
    }

    // Filtre Zone via jointure inner (evite la troncature Supabase REST a 1000 IDs)
    if (hasZone) {
      const zones = zoneFilter!.split(',').filter(Boolean)
      if (zones.length === 1) query = query.eq('client.type_de_zone', zones[0])
      else if (zones.length > 1) query = query.in('client.type_de_zone', zones)
    }

    // Depot filter via livraisons.depot_id
    if (depotFilter && depotFilter !== 'all') {
      const depots = depotFilter.split(',').filter(Boolean)
      if (depots.length === 1) {
        query = query.eq('depot_id', depots[0])
      } else if (depots.length > 1) {
        query = query.in('depot_id', depots)
      }
    }

    // Livreur filter via livraisons.livreur_id
    if (livreurFilter && livreurFilter !== 'all') {
      const livreurs = livreurFilter.split(',').filter(Boolean)
      if (livreurs.length === 1) {
        query = query.eq('livreur_id', livreurs[0])
      } else if (livreurs.length > 1) {
        query = query.in('livreur_id', livreurs)
      }
    }

    // Controle qualite filter
    // ok = cq_valide true | en_cours = cq_en_cours true (partiellement checké) | attente = livree + pas commencé
    if (hasControle) {
      const vals = controleFilter!.split(',').filter(Boolean)
      const conditions: string[] = []
      if (vals.includes('ok')) {
        conditions.push('cq_valide.eq.true')
      }
      if (vals.includes('en_cours')) {
        conditions.push('cq_en_cours.eq.true')
      }
      if (vals.includes('attente')) {
        // En attente = livrée mais pas encore commencé le contrôle
        conditions.push('and(statut.eq.livree,cq_valide.eq.false,cq_en_cours.eq.false)')
      }
      if (conditions.length > 0) {
        query = query.or(conditions.join(','))
      }
    }

    // Role-based filtering
    if (currentUser.role === 'agent_secteur' && currentUser.depot_ids?.length) {
      query = query.in('depot_id', currentUser.depot_ids)
    } else if (currentUser.role === 'livreur') {
      query = query.eq('livreur_id', currentUser.id)
    }

    // Pagination + tri
    const startIndex = (page - 1) * pageSize
    if (isDateSort) {
      query = query
        .order('date_livraison_effective', { ascending, nullsFirst: ascending })
        .order('creneau_date', { ascending, nullsFirst: ascending })
        .order('created_at', { ascending })
    } else {
      query = query.order(safeSortBy, { ascending })
    }
    query = query.range(startIndex, startIndex + pageSize - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('Erreur query livraisons:', error.message, error.details, error.hint)
      throw error
    }

    const totalFiltered = count || 0
    const totalPages = Math.ceil(totalFiltered / pageSize)

    // Calculer le total des vélos validés sur TOUS les résultats filtrés (pas juste la page)
    // Récupérer tous les client_ids distincts des livraisons filtrées
    let velosQuery = adminClient
      .from('livraisons')
      .select('cq_valide, cq_en_cours, statut, client:clients!livraisons_client_id_fkey!inner(velo_valide, in_enemat, type_de_zone)')

    // Ré-appliquer les mêmes filtres (sans pagination)
    if (statutFilter && statutFilter !== 'all') {
      const statuts = statutFilter.split(',').filter(Boolean)
      if (statuts.length === 1) velosQuery = velosQuery.eq('statut', statuts[0])
      else if (statuts.length > 1) velosQuery = velosQuery.in('statut', statuts)
    } else if (!explicitAnnulee) {
      velosQuery = velosQuery.neq('statut', 'annulee')
    }
    if (clientIds) velosQuery = velosQuery.in('client_id', clientIds)
    if (hasEnemat) {
      velosQuery = velosQuery.eq('client.in_enemat', enematFilter === 'oui')
    }
    if (hasZone) {
      const zones = zoneFilter!.split(',').filter(Boolean)
      if (zones.length === 1) velosQuery = velosQuery.eq('client.type_de_zone', zones[0])
      else if (zones.length > 1) velosQuery = velosQuery.in('client.type_de_zone', zones)
    }
    if (depotFilter && depotFilter !== 'all') {
      const depots = depotFilter.split(',').filter(Boolean)
      if (depots.length === 1) velosQuery = velosQuery.eq('depot_id', depots[0])
      else if (depots.length > 1) velosQuery = velosQuery.in('depot_id', depots)
    }
    if (livreurFilter && livreurFilter !== 'all') {
      const livreurs = livreurFilter.split(',').filter(Boolean)
      if (livreurs.length === 1) velosQuery = velosQuery.eq('livreur_id', livreurs[0])
      else if (livreurs.length > 1) velosQuery = velosQuery.in('livreur_id', livreurs)
    }
    if (hasControle) {
      const vals = controleFilter!.split(',').filter(Boolean)
      const conditions: string[] = []
      if (vals.includes('ok')) conditions.push('cq_valide.eq.true')
      if (vals.includes('en_cours')) conditions.push('cq_en_cours.eq.true')
      if (vals.includes('attente')) {
        conditions.push('and(statut.eq.livree,cq_valide.eq.false,cq_en_cours.eq.false)')
      }
      if (conditions.length > 0) velosQuery = velosQuery.or(conditions.join(','))
    }
    if (currentUser.role === 'agent_secteur' && currentUser.depot_ids?.length) {
      velosQuery = velosQuery.in('depot_id', currentUser.depot_ids)
    } else if (currentUser.role === 'livreur') {
      velosQuery = velosQuery.eq('livreur_id', currentUser.id)
    }

    const { data: velosData } = await velosQuery
    const velosValidesFiltered = (velosData || []).reduce((sum: number, liv: any) => {
      return sum + (Number(liv.client?.velo_valide) || 0)
    }, 0)

    return NextResponse.json({
      livraisons: data || [],
      pagination: {
        page,
        pageSize,
        totalPages,
        totalFiltered,
        startIndex: startIndex + 1,
        endIndex: Math.min(startIndex + pageSize, totalFiltered),
        velosValidesFiltered,
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
