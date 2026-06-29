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
    // Mode export : pageSize tres eleve (>=1000) => on saute count exact + agregats velos
    // pour eviter le timeout Postgres (>60s sur grosse jointure inner + count exact + 2e query).
    const isExport = pageSize >= 1000

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

    // Etape 1 : pre-fetch des client IDs pour search + departement
    // (pour commercial, on filtre directement via la jointure inner client.commercial_code en etape 2,
    // pour eviter une URL Supabase REST trop longue quand un master matche 1000+ clients ex: ATHOME)
    let clientIds: string[] | null = null

    const hasCommercial = commercialFilter && commercialFilter !== 'all'
    const hasDepartement = departementFilter && departementFilter !== 'all'
    const hasZone = zoneFilter && zoneFilter !== 'all'
    const hasControle = controleFilter && controleFilter !== 'all'
    const hasEnemat = enematFilter && enematFilter !== 'all'

    // Pre-expand les codes commerciaux une fois (utilise en etape 2 sur query + velosQuery)
    let expandedCommercialCodes: string[] | null = null
    if (hasCommercial) {
      const commercials = commercialFilter!.split(',').filter(Boolean)
      expandedCommercialCodes = await expandCommercialCodes(adminClient as any, tenantId, commercials)
    }

    if (search || hasDepartement) {
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
    // Mode export : SELECT allege (uniquement colonnes utiles a l'Excel) + pas de count
    // pour eviter le statement timeout Postgres (8s) sur grosse jointure + serialisation JSON.
    const exportSelect = `
        id, statut, creneau_date, creneau_heure_debut, creneau_heure_fin,
        date_livraison, date_livraison_effective,
        adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville,
        depot_id, livreur_id, cq_valide, client_id, created_at,
        livreur:livreur_id(id, prenom, nom),
        client:clients!livraisons_client_id_fkey!inner(
          id, raison_sociale, reference_retina, telephone, email, email_beneficiaire,
          contact_nom, contact_prenom, departement, adresse_societe_cp,
          commercial_assigne, commercial_code, in_enemat, statut_enemat,
          velo_valide, type_de_zone, validation_naf, agence
        ),
        depot:depots(id, nom)
      `
    const fullSelect = `
        *,
        livreur:livreur_id(id, prenom, nom),
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
      `
    let query = isExport
      ? adminClient.from('livraisons').select(exportSelect)
      : adminClient.from('livraisons').select(fullSelect, { count: 'exact' })

    // Le filtre Statut porte sur le statut PROCESS du client (statut_commercial),
    // aligne sur la page Client. Les livraisons annulees (anciennes versions
    // remplacees lors du re-import) ne doivent JAMAIS remonter : on les masque
    // TOUJOURS, que le filtre statut soit actif ou non. Avant, le masquage etait
    // dans le else, mais depuis que le filtre porte sur le client (et non sur le
    // statut de la livraison), un filtre actif faisait remonter les annulees
    // (dossier "livre" affiche sans livreur/date + bouton livraison reapparait).
    query = query.neq('statut', 'annulee')
    if (statutFilter && statutFilter !== 'all') {
      const statuts = statutFilter.split(',').filter(Boolean)
      if (statuts.length === 1) {
        query = query.eq('client.statut_commercial', statuts[0])
      } else if (statuts.length > 1) {
        query = query.in('client.statut_commercial', statuts)
      }
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

    // Filtre Commercial via jointure inner (evite URL trop longue quand un master matche 1000+ clients)
    if (hasCommercial && expandedCommercialCodes) {
      if (expandedCommercialCodes.length === 1) query = query.eq('client.commercial_code', expandedCommercialCodes[0])
      else query = query.in('client.commercial_code', expandedCommercialCodes)
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
    // Skip en mode export pour eviter le timeout (le total n'apparait pas dans le fichier Excel)
    let velosValidesFiltered = 0
    if (!isExport) {
      // Construit la requête vélos (mêmes filtres que la requête principale, sans pagination).
      // Fabriquée à la demande car un PostgrestFilterBuilder est consommé après await :
      // on en recrée un à chaque lot de pagination.
      const buildVelosQuery = () => {
        let q = adminClient
          .from('livraisons')
          .select('client_id, client:clients!livraisons_client_id_fkey!inner(velo_valide, in_enemat, type_de_zone, statut_commercial, commercial_code)')
          // Masquer TOUJOURS les annulees (cf. requete principale ci-dessus).
          .neq('statut', 'annulee')
        if (statutFilter && statutFilter !== 'all') {
          const statuts = statutFilter.split(',').filter(Boolean)
          if (statuts.length === 1) q = q.eq('client.statut_commercial', statuts[0])
          else if (statuts.length > 1) q = q.in('client.statut_commercial', statuts)
        }
        if (clientIds) q = q.in('client_id', clientIds)
        if (hasEnemat) q = q.eq('client.in_enemat', enematFilter === 'oui')
        if (hasZone) {
          const zones = zoneFilter!.split(',').filter(Boolean)
          if (zones.length === 1) q = q.eq('client.type_de_zone', zones[0])
          else if (zones.length > 1) q = q.in('client.type_de_zone', zones)
        }
        if (hasCommercial && expandedCommercialCodes) {
          if (expandedCommercialCodes.length === 1) q = q.eq('client.commercial_code', expandedCommercialCodes[0])
          else q = q.in('client.commercial_code', expandedCommercialCodes)
        }
        if (depotFilter && depotFilter !== 'all') {
          const depots = depotFilter.split(',').filter(Boolean)
          if (depots.length === 1) q = q.eq('depot_id', depots[0])
          else if (depots.length > 1) q = q.in('depot_id', depots)
        }
        if (livreurFilter && livreurFilter !== 'all') {
          const livreurs = livreurFilter.split(',').filter(Boolean)
          if (livreurs.length === 1) q = q.eq('livreur_id', livreurs[0])
          else if (livreurs.length > 1) q = q.in('livreur_id', livreurs)
        }
        if (hasControle) {
          const vals = controleFilter!.split(',').filter(Boolean)
          const conditions: string[] = []
          if (vals.includes('ok')) conditions.push('cq_valide.eq.true')
          if (vals.includes('en_cours')) conditions.push('cq_en_cours.eq.true')
          if (vals.includes('attente')) {
            conditions.push('and(statut.eq.livree,cq_valide.eq.false,cq_en_cours.eq.false)')
          }
          if (conditions.length > 0) q = q.or(conditions.join(','))
        }
        if (currentUser.role === 'agent_secteur' && currentUser.depot_ids?.length) {
          q = q.in('depot_id', currentUser.depot_ids)
        } else if (currentUser.role === 'livreur') {
          q = q.eq('livreur_id', currentUser.id)
        }
        return q
      }

      // Dédup par client_id : un client avec plusieurs livraisons ne doit
      // compter ses vélos qu'une seule fois (sinon sur-comptage via le JOIN).
      // PAGINATION OBLIGATOIRE : PostgREST tronque à ~1000 lignes/requête, ce qui
      // plafonnait le total des vélos (~1501) au lieu du vrai total. On boucle par lots.
      const velosByClient = new Map<string, number>()
      const BATCH = 1000
      let fromIdx = 0
      for (let i = 0; i < 100; i++) { // garde-fou : 100 lots max (100k livraisons)
        const { data: batch, error: batchErr } = await buildVelosQuery().range(fromIdx, fromIdx + BATCH - 1)
        if (batchErr) {
          console.error('Erreur calcul total vélos:', batchErr.message)
          break
        }
        for (const liv of (batch || []) as any[]) {
          if (liv.client_id != null) {
            velosByClient.set(liv.client_id, Number(liv.client?.velo_valide) || 0)
          }
        }
        if (!batch || batch.length < BATCH) break
        fromIdx += BATCH
      }
      for (const v of velosByClient.values()) velosValidesFiltered += v
    }

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
