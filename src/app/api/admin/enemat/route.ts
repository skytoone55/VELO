import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError, type AuthenticatedUser } from '@/lib/auth/require-role'

/**
 * GET /api/admin/enemat
 * Liste les clients in_enemat = true avec filtres, pagination, jointures livraisons + depots.
 * Acces : super_admin uniquement.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin'])
    if (isAuthError(auth)) return auth

    const { searchParams } = new URL(request.url)
    const statutEnemat = searchParams.get('statut_enemat')
    const search = searchParams.get('search')
    const depotId = searchParams.get('depot_id')
    const commercial = searchParams.get('commercial')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 5000)
    const offset = (page - 1) * limit

    const supabase = createAdminClient()

    const fnuciFilter = searchParams.get('fnuci')
    const lotFilter = searchParams.get('lot')
    const factureFilter = searchParams.get('facture')
    const zoneFilter = searchParams.get('zone')

    let query = supabase
      .from('clients')
      .select(
        `id, raison_sociale, reference_retina, telephone, email, commercial_assigne,
         depot_logistique_id, depot_retrait_id, velo_valide,
         statut_commercial,
         statut_enemat, date_depot_enemat, date_apf_enemat, date_paye_enemat, date_entree_enemat, in_enemat,
         numero_lot_enemat, numero_facture_enemat,
         fnuci_ids, fnuci_declared, fnuci_declared_at,
         livraisons(mode_livraison, creneau_date, date_livraison_effective, cq_valide_at)`,
        { count: 'exact' }
      )
      .eq('in_enemat', true)
      .order('date_entree_enemat', { ascending: false })
      .range(offset, offset + limit - 1)

    if (statutEnemat) {
      query = query.eq('statut_enemat', statutEnemat)
    }

    if (search) {
      query = query.or(
        `raison_sociale.ilike.%${search}%,siret.ilike.%${search}%,reference_retina.ilike.%${search}%,telephone.ilike.%${search}%,email.ilike.%${search}%`
      )
    }

    if (depotId) {
      // Cascade : depot_retrait_id (PPE+Ecovolt) ou depot_logistique_id (legacy)
      query = query.or(`depot_retrait_id.eq.${depotId},depot_logistique_id.eq.${depotId}`)
    }

    if (commercial) {
      query = query.eq('commercial_assigne', commercial)
    }

    if (fnuciFilter === 'oui') {
      query = query.eq('fnuci_declared', true)
    } else if (fnuciFilter === 'non') {
      query = query.or('fnuci_declared.eq.false,fnuci_declared.is.null')
    }

    if (lotFilter === '__none__') {
      query = query.is('numero_lot_enemat', null)
    } else if (lotFilter === '__any__') {
      query = query.not('numero_lot_enemat', 'is', null)
    } else if (lotFilter) {
      query = query.ilike('numero_lot_enemat', `%${lotFilter}%`)
    }

    if (factureFilter === '__none__') {
      query = query.is('numero_facture_enemat', null)
    } else if (factureFilter === '__any__') {
      query = query.not('numero_facture_enemat', 'is', null)
    } else if (factureFilter) {
      query = query.ilike('numero_facture_enemat', `%${factureFilter}%`)
    }

    if (zoneFilter && zoneFilter !== 'all') {
      const zones = zoneFilter.split(',').filter(Boolean)
      if (zones.length === 1) query = query.eq('type_de_zone', zones[0])
      else if (zones.length > 1) query = query.in('type_de_zone', zones)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Erreur GET /api/admin/enemat:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Récupérer les noms de dépôts (cascade retrait → logistique)
    const depotIds = [
      ...new Set(
        (data || [])
          .flatMap((r: any) => [r.depot_retrait_id, r.depot_logistique_id])
          .filter(Boolean)
      ),
    ]
    let depotsMap: Record<string, string> = {}
    if (depotIds.length > 0) {
      const { data: depots } = await supabase
        .from('depots')
        .select('id, nom')
        .in('id', depotIds)
      if (depots) {
        depotsMap = Object.fromEntries(depots.map((d: any) => [d.id, d.nom]))
      }
    }

    // Transformer pour aplatir la derniere livraison
    const clients = (data || []).map((row: Record<string, unknown>) => {
      const { livraisons, ...client } = row
      const livraisonsArr = Array.isArray(livraisons) ? livraisons : []
      const derniereLivraison = livraisonsArr[0] || null
      const c = client as any
      const depotId = c.depot_retrait_id ?? c.depot_logistique_id ?? null
      return {
        ...client,
        mode_livraison: derniereLivraison?.mode_livraison ?? null,
        date_livraison: derniereLivraison?.creneau_date ?? null,
        date_livraison_effective: derniereLivraison?.date_livraison_effective ?? null,
        date_controle: derniereLivraison?.cq_valide_at ?? null,
        depot_nom: depotId ? depotsMap[depotId] ?? null : null,
      }
    })

    // Deuxieme requete : somme des velos valides sur TOUS les clients filtres (pas seulement la page)
    let sumQuery = supabase
      .from('clients')
      .select('velo_valide')
      .eq('in_enemat', true)

    if (statutEnemat) {
      sumQuery = sumQuery.eq('statut_enemat', statutEnemat)
    }
    if (search) {
      sumQuery = sumQuery.or(
        `raison_sociale.ilike.%${search}%,siret.ilike.%${search}%,reference_retina.ilike.%${search}%,telephone.ilike.%${search}%,email.ilike.%${search}%`
      )
    }
    if (depotId) {
      sumQuery = sumQuery.or(`depot_retrait_id.eq.${depotId},depot_logistique_id.eq.${depotId}`)
    }
    if (commercial) {
      sumQuery = sumQuery.eq('commercial_assigne', commercial)
    }
    if (fnuciFilter === 'oui') {
      sumQuery = sumQuery.eq('fnuci_declared', true)
    } else if (fnuciFilter === 'non') {
      sumQuery = sumQuery.or('fnuci_declared.eq.false,fnuci_declared.is.null')
    }
    if (lotFilter === '__none__') {
      sumQuery = sumQuery.is('numero_lot_enemat', null)
    } else if (lotFilter === '__any__') {
      sumQuery = sumQuery.not('numero_lot_enemat', 'is', null)
    } else if (lotFilter) {
      sumQuery = sumQuery.ilike('numero_lot_enemat', `%${lotFilter}%`)
    }
    if (factureFilter === '__none__') {
      sumQuery = sumQuery.is('numero_facture_enemat', null)
    } else if (factureFilter === '__any__') {
      sumQuery = sumQuery.not('numero_facture_enemat', 'is', null)
    } else if (factureFilter) {
      sumQuery = sumQuery.ilike('numero_facture_enemat', `%${factureFilter}%`)
    }
    if (zoneFilter && zoneFilter !== 'all') {
      const zones = zoneFilter.split(',').filter(Boolean)
      if (zones.length === 1) sumQuery = sumQuery.eq('type_de_zone', zones[0])
      else if (zones.length > 1) sumQuery = sumQuery.in('type_de_zone', zones)
    }

    const { data: sumData, error: sumError } = await sumQuery
    if (sumError) {
      console.error('Erreur GET /api/admin/enemat (sum):', sumError)
    }
    const velosValidesFiltered = (sumData || []).reduce(
      (sum: number, c: { velo_valide: number | null }) => sum + (Number(c.velo_valide) || 0),
      0
    )

    return NextResponse.json({ clients, total: count ?? 0, page, limit, velosValidesFiltered })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur GET /api/admin/enemat:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/admin/enemat
 * Bascule des clients vers ENEMAT (action de masse depuis Livraisons).
 * Body : { client_ids: string[] }
 * Acces : super_admin uniquement.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin'])
    if (isAuthError(auth)) return auth
    const currentUser = auth as AuthenticatedUser

    const body = await request.json()
    const { client_ids } = body as { client_ids: string[] }

    if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
      return NextResponse.json({ error: 'client_ids requis (tableau non vide)' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()

    // Vérifier que chaque client a une livraison avec CQ validé
    const { data: livraisons } = await supabase
      .from('livraisons')
      .select('client_id, cq_valide')
      .in('client_id', client_ids)
      .eq('statut', 'livree')
      .eq('cq_valide', true)

    const clientsAvecCQ = new Set((livraisons || []).map((l: { client_id: string }) => l.client_id))
    const eligible = client_ids.filter(id => clientsAvecCQ.has(id))
    const rejected = client_ids.filter(id => !clientsAvecCQ.has(id))

    if (eligible.length === 0) {
      return NextResponse.json({
        error: 'Aucun client éligible. Seuls les clients avec un contrôle qualité validé peuvent être transférés vers ENEMAT.',
        rejected_count: rejected.length,
      }, { status: 400 })
    }

    // Mettre à jour uniquement les clients éligibles
    const { data: updated, error: updateError } = await supabase
      .from('clients')
      .update({
        in_enemat: true,
        statut_enemat: 'a_deposer_enemat',
        date_entree_enemat: now,
        updated_at: now,
      })
      .in('id', eligible)
      .select('id')

    if (updateError) {
      console.error('Erreur POST /api/admin/enemat (update):', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const updatedIds = (updated || []).map((r: { id: string }) => r.id)

    // Creer les entrees enemat_history
    if (updatedIds.length > 0) {
      const historyRows = updatedIds.map((clientId: string) => ({
        client_id: clientId,
        statut_avant: null,
        statut_apres: 'a_deposer_enemat',
        changed_by: currentUser.id,
        changed_at: now,
      }))

      const { error: histError } = await supabase
        .from('enemat_history')
        .insert(historyRows)

      if (histError) {
        console.error('Erreur POST /api/admin/enemat (history):', histError)
        // Non bloquant — les clients sont deja bascules
      }
    }

    return NextResponse.json({
      success: true,
      count: updatedIds.length,
      client_ids: updatedIds,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur POST /api/admin/enemat:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
