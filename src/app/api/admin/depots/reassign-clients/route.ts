import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyClientZone, DepotWithCoords } from '@/lib/geo/utils'

/**
 * API pour réassigner les clients aux dépôts les plus proches
 *
 * POST /api/admin/depots/reassign-clients
 * Body: {
 *   depotId?: string,         - Dépôt modifié/créé → scope géographique (bounding box)
 *   deletedDepotId?: string,  - Dépôt supprimé → scope sur ses anciens clients
 *   force?: boolean,          - Bouton manuel → tous les clients géolocalisés
 * }
 *
 * Modes :
 * 1. depotId → recalcule uniquement les clients dans le rayon du dépôt modifié
 * 2. deletedDepotId → recalcule uniquement les clients qui étaient sur ce dépôt
 * 3. force=true → recalcule TOUS les clients (bouton manuel)
 * 4. Aucun param → clients sans dépôt assigné
 */
export async function POST(request: NextRequest) {
  try {
    // Auth admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users_profile')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const { depotId, deletedDepotId, force = false } = body

    const adminClient = createAdminClient()

    // Récupérer tous les dépôts actifs
    const { data: depots, error: depotsError } = await adminClient
      .from('depots')
      .select('id, nom, latitude, longitude, rayon_couverture_km, rayon_livraison_payant_km, prix_livraison_payante, type, agence')
      .eq('actif', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    if (depotsError) throw depotsError

    if (!depots || depots.length === 0) {
      return NextResponse.json({ success: true, reassigned: 0, message: 'Aucun dépôt actif' })
    }

    const activeDepots: DepotWithCoords[] = depots.map(d => ({
      ...d,
      type: d.type as 'retrait' | 'logistique',
    }))

    // --- Construire la requête clients selon le scope ---
    let clientsQuery = adminClient
      .from('clients')
      .select('id, latitude, longitude, depot_logistique_id, depot_retrait_id, type_de_zone')
      .not('monday_sync_status', 'eq', 'deleted')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    let scope = 'default'

    if (depotId) {
      // Scope géographique : bounding box autour du dépôt modifié/créé
      const targetDepot = activeDepots.find(d => d.id === depotId)
      if (targetDepot) {
        // Rayon max parmi tous les dépôts + marge pour couvrir les voisins
        const maxRadius = Math.max(
          ...activeDepots.map(d => Math.max(d.rayon_couverture_km || 30, d.rayon_livraison_payant_km || 30)),
          50
        )
        const latDelta = maxRadius / 111
        const lngDelta = maxRadius / (111 * Math.cos((targetDepot.latitude * Math.PI) / 180))

        clientsQuery = clientsQuery
          .gte('latitude', targetDepot.latitude - latDelta)
          .lte('latitude', targetDepot.latitude + latDelta)
          .gte('longitude', targetDepot.longitude - lngDelta)
          .lte('longitude', targetDepot.longitude + lngDelta)

        scope = `depot:${depotId}`
      }
    } else if (deletedDepotId) {
      // Scope : uniquement les clients assignés au dépôt supprimé
      clientsQuery = clientsQuery.or(
        `depot_retrait_id.eq.${deletedDepotId},depot_logistique_id.eq.${deletedDepotId}`
      )
      scope = `deleted:${deletedDepotId}`
    } else if (!force) {
      // Default : clients sans assignation complète
      clientsQuery = clientsQuery.or('depot_retrait_id.is.null,depot_logistique_id.is.null')
      scope = 'missing'
    } else {
      scope = 'force-all'
    }

    // --- Pagination ---
    const allClients: any[] = []
    let page = 0
    const pageSize = 1000

    while (true) {
      const { data: clients, error } = await clientsQuery
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (error) throw error
      if (!clients || clients.length === 0) break
      allClients.push(...clients)
      if (clients.length < pageSize) break
      page++
    }

    if (allClients.length === 0) {
      return NextResponse.json({
        success: true,
        reassigned: 0,
        totalChecked: 0,
        scope,
        message: 'Aucun client à traiter dans ce périmètre',
      })
    }

    // --- Classifier et collecter les changements ---
    let reassignedCount = 0
    let horsZoneCount = 0
    const updates: { id: string; depot_retrait_id: string | null; depot_logistique_id: string | null; type_de_zone: string }[] = []
    const horsZoneInserts: any[] = []
    const horsZoneClientIds: string[] = []
    const dansZoneClientIds: string[] = []

    for (const client of allClients) {
      const classification = classifyClientZone(client.latitude, client.longitude, activeDepots)

      const newRetraitId = classification.depotRetraitId || null
      const newLogistiqueId = classification.depotLogistiqueId || null
      const newZone = classification.horsZone ? 'hors_zone' : 'dans_la_zone'

      const changed =
        newRetraitId !== client.depot_retrait_id ||
        newLogistiqueId !== client.depot_logistique_id ||
        newZone !== client.type_de_zone

      if (changed) {
        updates.push({
          id: client.id,
          depot_retrait_id: newRetraitId,
          depot_logistique_id: newLogistiqueId,
          type_de_zone: newZone,
        })
        reassignedCount++
      }

      if (classification.horsZone) {
        horsZoneCount++
        horsZoneClientIds.push(client.id)
        if (classification.depotInfo?.id) {
          horsZoneInserts.push({
            client_id: client.id,
            depot_plus_proche_id: classification.depotInfo.id,
            distance_depot_plus_proche_km: classification.distanceKm,
            statut: 'nouveau',
            created_at: new Date().toISOString(),
          })
        }
      } else {
        dansZoneClientIds.push(client.id)
      }
    }

    // --- Batch update clients (50 en parallèle par lot) ---
    const now = new Date().toISOString()
    for (let i = 0; i < updates.length; i += 50) {
      const batch = updates.slice(i, i + 50)
      await Promise.all(
        batch.map(u =>
          adminClient
            .from('clients')
            .update({
              depot_retrait_id: u.depot_retrait_id,
              depot_logistique_id: u.depot_logistique_id,
              type_de_zone: u.type_de_zone,
              updated_at: now,
            })
            .eq('id', u.id)
        )
      )
    }

    // --- Mettre à jour clients_hors_zone ---
    // Retirer les clients maintenant dans la zone
    if (dansZoneClientIds.length > 0) {
      for (let i = 0; i < dansZoneClientIds.length; i += 500) {
        await adminClient
          .from('clients_hors_zone')
          .delete()
          .in('client_id', dansZoneClientIds.slice(i, i + 500))
      }
    }

    // Upsert les nouveaux hors_zone
    if (horsZoneInserts.length > 0) {
      for (let i = 0; i < horsZoneClientIds.length; i += 500) {
        await adminClient
          .from('clients_hors_zone')
          .delete()
          .in('client_id', horsZoneClientIds.slice(i, i + 500))
      }
      for (let i = 0; i < horsZoneInserts.length; i += 500) {
        await adminClient.from('clients_hors_zone').insert(horsZoneInserts.slice(i, i + 500))
      }
    }

    return NextResponse.json({
      success: true,
      reassigned: reassignedCount,
      horsZone: horsZoneCount,
      totalChecked: allClients.length,
      scope,
      message: `${reassignedCount} réassigné(s), ${horsZoneCount} hors zone sur ${allClients.length} vérifiés`,
    })
  } catch (error: any) {
    console.error('Erreur API reassign-clients:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
