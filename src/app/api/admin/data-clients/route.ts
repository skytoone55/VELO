import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { validatePagination } from '@/lib/constants'

/**
 * GET /api/admin/data-clients — Liste les data_clients avec filtres et pagination
 * Acces: super_admin, admin uniquement
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['super_admin', 'admin'])
    if (isAuthError(authResult)) return authResult

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.toLowerCase()
    const { page, pageSize } = validatePagination(
      searchParams.get('page') || '1',
      searchParams.get('pageSize') || '20'
    )

    const statutFilter = searchParams.get('statut')
    const departementFilter = searchParams.get('departement')
    const commercialFilter = searchParams.get('commercial')
    const nafFilter = searchParams.get('naf')

    const sortByParam = searchParams.get('sortBy') || 'updated_at'
    const sortOrderParam = searchParams.get('sortOrder') || 'desc'
    const SORTABLE_COLUMNS = [
      'raison_sociale', 'departement', 'velo_devis', 'velo_valide',
      'statut_data', 'validation_naf', 'updated_at', 'created_at',
      'monday_board_id', 'reference_retina',
    ]
    const safeSortBy = SORTABLE_COLUMNS.includes(sortByParam) ? sortByParam : 'updated_at'
    const ascending = sortOrderParam === 'asc'

    const adminClient = createAdminClient()

    let query = adminClient
      .from('data_clients')
      .select('*', { count: 'exact' })

    // Recherche texte
    if (search) {
      query = query.or(
        `raison_sociale.ilike.%${search}%,siret.ilike.%${search}%,email_beneficiaire.ilike.%${search}%,telephone.ilike.%${search}%,reference_retina.ilike.%${search}%`
      )
    }

    // Filtres
    if (statutFilter && statutFilter !== 'all') {
      query = query.eq('statut_data', statutFilter)
    }

    if (departementFilter && departementFilter !== 'all') {
      const depts = departementFilter.split(',').filter(Boolean)
      if (depts.length === 1) {
        query = query.eq('departement', depts[0])
      } else if (depts.length > 1) {
        query = query.in('departement', depts)
      }
    }

    if (commercialFilter && commercialFilter !== 'all') {
      query = query.eq('monday_board_id', commercialFilter)
    }

    if (nafFilter && nafFilter !== 'all') {
      if (nafFilter === 'valide') query = query.eq('validation_naf', 'OUI')
      else if (nafFilter === 'bloque') query = query.eq('validation_naf', 'NON')
      else if (nafFilter === 'en_attente') query = query.or('validation_naf.is.null,validation_naf.neq.OUI,validation_naf.neq.NON')
    }

    // Tri + pagination
    query = query.order(safeSortBy, { ascending })

    // Count total pour vélos
    const countQuery = adminClient
      .from('data_clients')
      .select('velo_valide')

    const startIndex = (page - 1) * pageSize
    query = query.range(startIndex, startIndex + pageSize - 1)

    const [{ data, count, error }, { data: velosData }] = await Promise.all([
      query,
      countQuery,
    ])

    if (error) {
      console.error('Erreur GET /api/admin/data-clients:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const totalFiltered = count || 0
    const totalPages = Math.ceil(totalFiltered / pageSize)
    const velosValidesFiltered = velosData?.reduce((sum, c) => sum + (c.velo_valide || 0), 0) || 0

    return NextResponse.json({
      clients: data || [],
      pagination: {
        page,
        pageSize,
        totalPages,
        totalFiltered,
        totalClients: totalFiltered,
        startIndex: startIndex + 1,
        endIndex: Math.min(startIndex + pageSize, totalFiltered),
        velosValidesFiltered,
      },
    })
  } catch (error: any) {
    console.error('Erreur GET /api/admin/data-clients:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/admin/data-clients — Transferer un ou plusieurs data_clients vers clients
 * Body: { ids: string[] }
 * Le client est cree dans clients avec statut controle_valide + geoloc + depot
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(['super_admin', 'admin'])
    if (isAuthError(authResult)) return authResult

    const { ids } = await request.json()
    if (!ids?.length) {
      return NextResponse.json({ error: 'Aucun client selectionne' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Recuperer les data_clients
    const { data: dataClients, error: fetchError } = await adminClient
      .from('data_clients')
      .select('*')
      .in('id', ids)

    if (fetchError || !dataClients?.length) {
      return NextResponse.json({ error: 'Clients introuvables' }, { status: 404 })
    }

    const results = { imported: 0, errors: [] as string[] }

    for (const dc of dataClients) {
      try {
        // Geocoder l'adresse
        let latitude = dc.latitude
        let longitude = dc.longitude
        let geocodingScore = null

        if (!latitude && dc.adresse_societe_ligne1 && dc.adresse_societe_cp) {
          try {
            const addr = encodeURIComponent(
              `${dc.adresse_societe_ligne1} ${dc.adresse_societe_cp} ${dc.adresse_societe_ville || ''}`
            )
            const geoRes = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${addr}&limit=1`)
            const geoData = await geoRes.json()
            if (geoData.features?.length) {
              const [lon, lat] = geoData.features[0].geometry.coordinates
              latitude = lat
              longitude = lon
              geocodingScore = geoData.features[0].properties.score
            }
          } catch {
            // Geocoding optionnel — on continue sans
          }
        }

        // Trouver le depot le plus proche
        let depotLogistiqueId = null
        let typeDeZone = null

        if (latitude && longitude) {
          const { data: depots } = await adminClient
            .from('depots')
            .select('id, latitude, longitude, rayon_couverture_km')
            .not('latitude', 'is', null)

          if (depots?.length) {
            let minDist = Infinity
            let closestDepot: any = null
            for (const d of depots) {
              const dlat = Number(d.latitude) - Number(latitude)
              const dlon = Number(d.longitude) - Number(longitude)
              const dist = Math.sqrt(dlat * dlat + dlon * dlon) * 111 // km approx
              if (dist < minDist) {
                minDist = dist
                closestDepot = d
              }
            }
            if (closestDepot) {
              depotLogistiqueId = closestDepot.id
              const rayon = closestDepot.rayon_couverture_km || 30
              typeDeZone = minDist <= rayon ? 'dans_la_zone' : 'hors_zone'
            }
          }
        }

        // Inserer dans clients
        const { error: insertError } = await adminClient
          .from('clients')
          .insert({
            raison_sociale: dc.raison_sociale,
            siret: dc.siret,
            reference_retina: dc.reference_retina,
            contact_nom: dc.contact_nom,
            contact_prenom: dc.contact_prenom,
            email_beneficiaire: dc.email_beneficiaire,
            telephone: dc.telephone,
            adresse_societe_ligne1: dc.adresse_societe_ligne1,
            adresse_societe_ligne2: dc.adresse_societe_ligne2,
            adresse_societe_cp: dc.adresse_societe_cp,
            adresse_societe_ville: dc.adresse_societe_ville,
            departement: dc.departement,
            latitude,
            longitude,
            geocoding_score: geocodingScore,
            velo_devis: dc.velo_devis,
            velo_valide: dc.velo_valide,
            monday_board_id: dc.monday_board_id,
            monday_item_id: dc.monday_item_id,
            commercial_assigne: dc.commercial_assigne,
            code_ape: dc.code_ape,
            validation_naf: dc.validation_naf,
            statut_commercial: 'controle_valide',
            depot_logistique_id: depotLogistiqueId,
            type_de_zone: typeDeZone,
          })

        if (insertError) {
          results.errors.push(`${dc.raison_sociale}: ${insertError.message}`)
          continue
        }

        // Supprimer de data_clients
        await adminClient.from('data_clients').delete().eq('id', dc.id)
        results.imported++
      } catch (err: any) {
        results.errors.push(`${dc.raison_sociale}: ${err.message}`)
      }
    }

    if (results.imported === 0 && results.errors.length > 0) {
      return NextResponse.json({ error: results.errors.join('; '), imported: 0, errors: results.errors }, { status: 400 })
    }

    return NextResponse.json(results)
  } catch (error: any) {
    console.error('Erreur POST /api/admin/data-clients:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
