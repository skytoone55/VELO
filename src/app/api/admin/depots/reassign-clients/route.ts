import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyClientZone, geocodeAddress, DepotWithCoords } from '@/lib/geo/utils'

/**
 * API pour réassigner les clients aux dépôts les plus proches
 * Appelée après la création/modification/suppression d'un dépôt
 *
 * POST /api/admin/depots/reassign-clients
 * Body: {
 *   agence?: string,     - Filtre par agence
 *   depotId?: string,    - (optionnel) dépôt spécifique
 *   force?: boolean,     - Si true, reassigne TOUS les clients (même ceux déjà assignés)
 * }
 *
 * Logique :
 * - Utilise classifyClientZone() pour une classification complète (retrait/logistique/hors_zone)
 * - Met à jour clients_hors_zone pour le suivi des clients sans couverture
 * - Pagine les clients pour gérer les gros volumes (PPE: 2000+ clients)
 */
export async function POST(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Vérifier les permissions (admin uniquement)
    const { data: profile } = await supabase
      .from('users_profile')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const { agence, depotId, force = false } = body

    const adminClient = createAdminClient()

    // Récupérer TOUS les dépôts actifs (retrait ET logistique)
    // classifyClientZone() gère la logique retrait vs logistique
    let depotsQuery = adminClient
      .from('depots')
      .select('id, nom, latitude, longitude, rayon_couverture_km, rayon_livraison_payant_km, prix_livraison_payante, type, agence')
      .eq('actif', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    if (agence) {
      depotsQuery = depotsQuery.eq('agence', agence)
    }

    const { data: depots, error: depotsError } = await depotsQuery

    if (depotsError || !depots || depots.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun dépôt actif trouvé',
        reassigned: 0,
      })
    }

    const activeDepots: DepotWithCoords[] = depots.map(d => ({
      ...d,
      type: d.type as 'retrait' | 'logistique',
    }))

    // Récupérer les clients — pagination pour gros volumes
    let allClients: any[] = []
    let sansGpsCount = 0
    let geocodedCount = 0
    let page = 0
    const pageSize = 1000

    while (true) {
      let clientsQuery = adminClient
        .from('clients')
        .select('id, latitude, longitude, agence, depot_logistique_id, depot_retrait_id, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville, adresse_societe_ligne1, adresse_societe_cp, adresse_societe_ville')
        .not('monday_sync_status', 'eq', 'deleted')

      if (agence) {
        clientsQuery = clientsQuery.eq('agence', agence)
      }

      // Si pas en mode force, ne traiter que les clients avec au moins un dépôt manquant (OR, pas AND)
      if (!force) {
        clientsQuery = clientsQuery.or('depot_retrait_id.is.null,depot_logistique_id.is.null')
      }

      const { data: clients, error } = await clientsQuery
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (error) throw error
      if (!clients || clients.length === 0) break

      // Séparer les clients avec et sans GPS
      for (const c of clients) {
        if (c.latitude && c.longitude) {
          allClients.push(c)
        } else {
          // Fallback : géocoder par code postal
          const adresse = c.adresse_livraison_ligne1 || c.adresse_societe_ligne1 || ''
          const cp = c.adresse_livraison_cp || c.adresse_societe_cp || ''
          const ville = c.adresse_livraison_ville || c.adresse_societe_ville || ''

          if (cp) {
            try {
              const geo = await geocodeAddress(adresse, cp, ville, 0.2)
              if (geo) {
                // Sauvegarder les coordonnées en base pour ne pas regeocoder
                await adminClient.from('clients').update({
                  latitude: geo.lat,
                  longitude: geo.lng,
                  updated_at: new Date().toISOString(),
                }).eq('id', c.id)
                c.latitude = geo.lat
                c.longitude = geo.lng
                allClients.push(c)
                geocodedCount++
                continue
              }
            } catch { /* ignore geocoding errors */ }
          }
          sansGpsCount++
        }
      }
      if (clients.length < pageSize) break
      page++
    }

    if (allClients.length === 0) {
      return NextResponse.json({
        success: true,
        message: sansGpsCount > 0
          ? `Aucun client géolocalisé à réassigner, mais ${sansGpsCount} client(s) sans coordonnées GPS`
          : 'Aucun client à réassigner',
        reassigned: 0,
        horsZone: 0,
        sansGps: sansGpsCount,
      })
    }

    // Classifier chaque client et appliquer les mises à jour
    let reassignedCount = 0
    let horsZoneCount = 0
    const horsZoneEntries: { clientId: string; depotId: string | null; distance: number | null }[] = []

    for (const client of allClients) {
      if (!client.latitude || !client.longitude) continue

      const classification = classifyClientZone(client.latitude, client.longitude, activeDepots)

      const newDepotRetraitId = classification.depotRetraitId || null
      const newDepotLogistiqueId = classification.depotLogistiqueId || null
      const newTypeDeZone = classification.horsZone ? 'hors_zone' : 'dans_la_zone'

      // Vérifier si l'assignation a changé
      const changed =
        newDepotRetraitId !== client.depot_retrait_id ||
        newDepotLogistiqueId !== client.depot_logistique_id ||
        newTypeDeZone !== client.type_de_zone

      if (changed) {
        const { error: updateError } = await adminClient
          .from('clients')
          .update({
            depot_retrait_id: newDepotRetraitId,
            depot_logistique_id: newDepotLogistiqueId,
            type_de_zone: newTypeDeZone,
            updated_at: new Date().toISOString(),
          })
          .eq('id', client.id)

        if (!updateError) {
          reassignedCount++

          // Mettre à jour le cache de distance pour le dépôt assigné
          const assignedDepotId = newDepotRetraitId || newDepotLogistiqueId
          if (assignedDepotId && classification.distanceKm) {
            await adminClient.from('distances_cache').upsert({
              client_id: client.id,
              depot_id: assignedDepotId,
              distance_km: classification.distanceKm,
              calculated_at: new Date().toISOString(),
            }, { onConflict: 'client_id,depot_id' })
          }
        }
      }

      // Tracker les clients hors zone
      if (classification.horsZone) {
        horsZoneCount++
        horsZoneEntries.push({
          clientId: client.id,
          depotId: classification.depotInfo?.id || null,
          distance: classification.distanceKm,
        })
      }
    }

    // Mettre à jour clients_hors_zone
    if (horsZoneEntries.length > 0) {
      // D'abord, supprimer les anciennes entrées pour ces clients
      const clientIds = horsZoneEntries.map(e => e.clientId)
      await adminClient
        .from('clients_hors_zone')
        .delete()
        .in('client_id', clientIds)

      // Insérer les nouvelles entrées hors zone
      const horsZoneInserts = horsZoneEntries
        .filter(e => e.depotId) // Seulement si on a un dépôt de référence
        .map(e => ({
          client_id: e.clientId,
          depot_plus_proche_id: e.depotId,
          distance_depot_plus_proche_km: e.distance,
          statut: 'nouveau',
          created_at: new Date().toISOString(),
        }))

      if (horsZoneInserts.length > 0) {
        // Insérer par batch de 500
        for (let i = 0; i < horsZoneInserts.length; i += 500) {
          const batch = horsZoneInserts.slice(i, i + 500)
          await adminClient.from('clients_hors_zone').insert(batch)
        }
      }
    }

    // Nettoyer les entrées clients_hors_zone pour les clients qui ne sont plus hors zone
    // (clients qui étaient hors zone mais sont maintenant assignés)
    if (force) {
      const assignedClientIds = allClients
        .filter(c => {
          const classification = classifyClientZone(c.latitude, c.longitude, activeDepots)
          return !classification.horsZone
        })
        .map(c => c.id)

      if (assignedClientIds.length > 0) {
        // Supprimer par batch
        for (let i = 0; i < assignedClientIds.length; i += 500) {
          const batch = assignedClientIds.slice(i, i + 500)
          await adminClient
            .from('clients_hors_zone')
            .delete()
            .in('client_id', batch)
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `${reassignedCount} client(s) réassigné(s), ${horsZoneCount} hors zone` +
        (geocodedCount > 0 ? `, ${geocodedCount} géocodé(s) par CP` : '') +
        (sansGpsCount > 0 ? `, ${sansGpsCount} sans GPS ni CP` : ''),
      reassigned: reassignedCount,
      horsZone: horsZoneCount,
      geocoded: geocodedCount,
      sansGps: sansGpsCount,
      totalChecked: allClients.length,
      force,
    })

  } catch (error: any) {
    console.error('Erreur API reassign-clients:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
