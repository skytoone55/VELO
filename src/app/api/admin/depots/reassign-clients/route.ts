import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Calcul de distance avec formule Haversine
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * API pour réassigner les clients aux dépôts logistiques les plus proches
 * Appelée après la création/modification d'un dépôt logistique
 *
 * POST /api/admin/depots/reassign-clients
 * Body: { agence?: string, depotId?: string }
 *
 * - Si agence est fournie, réassigne tous les clients de cette agence
 * - Si depotId est fourni, vérifie si des clients existants seraient plus proches de ce dépôt
 * - Ne touche PAS aux clients qui ont un depot_retrait_id (mode retrait)
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

    if (!profile || !['admin_general', 'admin_regional'].includes(profile.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const { agence, depotId } = body

    const adminClient = createAdminClient()

    // Récupérer tous les dépôts logistiques actifs
    let depotsQuery = adminClient
      .from('depots')
      .select('id, nom, latitude, longitude, agence')
      .eq('type', 'logistique')
      .eq('actif', true)

    if (agence) {
      depotsQuery = depotsQuery.eq('agence', agence)
    }

    const { data: depots, error: depotsError } = await depotsQuery

    if (depotsError || !depots || depots.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun dépôt logistique trouvé',
        reassigned: 0,
      })
    }

    // Récupérer tous les clients avec coordonnées qui n'ont PAS de dépôt retrait
    // (ceux avec dépôt retrait ne doivent pas être réassignés)
    let clientsQuery = adminClient
      .from('clients')
      .select('id, latitude, longitude, agence, depot_logistique_id')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .is('depot_retrait_id', null) // Uniquement les clients en mode domicile

    if (agence) {
      clientsQuery = clientsQuery.eq('agence', agence)
    }

    const { data: clients, error: clientsError } = await clientsQuery

    if (clientsError || !clients || clients.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun client à réassigner',
        reassigned: 0,
      })
    }

    // Pour chaque client, trouver le dépôt logistique le plus proche dans son agence
    let reassignedCount = 0
    const updates: { clientId: string; newDepotId: string; distance: number }[] = []

    for (const client of clients) {
      if (!client.latitude || !client.longitude) continue

      // Filtrer les dépôts de la même agence
      const agenceDepots = depots.filter(d => d.agence === client.agence)
      if (agenceDepots.length === 0) continue

      // Trouver le dépôt le plus proche
      let closestDepot = null
      let minDistance = Infinity

      for (const depot of agenceDepots) {
        const distance = calculateDistance(
          client.latitude,
          client.longitude,
          depot.latitude,
          depot.longitude
        )

        if (distance < minDistance) {
          minDistance = distance
          closestDepot = depot
        }
      }

      // Si le dépôt le plus proche est différent du dépôt actuel, planifier la mise à jour
      if (closestDepot && closestDepot.id !== client.depot_logistique_id) {
        updates.push({
          clientId: client.id,
          newDepotId: closestDepot.id,
          distance: Math.round(minDistance * 10) / 10,
        })
      }
    }

    // Appliquer les mises à jour
    for (const update of updates) {
      const { error: updateError } = await adminClient
        .from('clients')
        .update({
          depot_logistique_id: update.newDepotId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', update.clientId)

      if (!updateError) {
        reassignedCount++

        // Mettre à jour le cache de distance
        await adminClient.from('distances_cache').upsert({
          client_id: update.clientId,
          depot_id: update.newDepotId,
          distance_km: update.distance,
          calculated_at: new Date().toISOString(),
        }, { onConflict: 'client_id,depot_id' })
      }
    }

    return NextResponse.json({
      success: true,
      message: `${reassignedCount} client(s) réassigné(s) au dépôt le plus proche`,
      reassigned: reassignedCount,
      total_checked: clients.length,
    })

  } catch (error: any) {
    console.error('Erreur API reassign-clients:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
