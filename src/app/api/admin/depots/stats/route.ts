import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { calculateHaversineDistance } from '@/lib/geo/utils'

/**
 * API de stats de couverture des dépôts
 *
 * GET /api/admin/depots/stats
 *
 * Retourne :
 * - totalClients, clientsWithCoords, clientsAssigned, clientsHorsZone, coveragePercent
 * - Par dépôt : clientsInZone, velosInZone, avgDistanceKm
 */
export async function GET() {
  try {
    const authResult = await requireRole(['super_admin', 'admin'])
    if (isAuthError(authResult)) return authResult

    const adminClient = createAdminClient()

    // Récupérer tous les dépôts actifs
    const { data: depots, error: depotsError } = await adminClient
      .from('depots')
      .select('id, nom, type, agence, latitude, longitude, rayon_couverture_km, rayon_livraison_payant_km, actif')
      .eq('actif', true)

    if (depotsError) throw depotsError

    // Récupérer tous les clients (non supprimés)
    let allClients: any[] = []
    let page = 0
    const pageSize = 1000

    while (true) {
      const { data: clients, error } = await adminClient
        .from('clients')
        .select('id, latitude, longitude, depot_retrait_id, depot_logistique_id, velo_valide, velo_devis, agence')
        .not('monday_sync_status', 'eq', 'deleted')
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (error) throw error
      if (!clients || clients.length === 0) break

      allClients = allClients.concat(clients)
      if (clients.length < pageSize) break
      page++
    }

    const totalClients = allClients.length
    const clientsWithCoords = allClients.filter(c => c.latitude && c.longitude).length
    const clientsAssigned = allClients.filter(c => c.depot_retrait_id || c.depot_logistique_id).length
    const clientsHorsZone = allClients.filter(c =>
      c.latitude && c.longitude && !c.depot_retrait_id && !c.depot_logistique_id
    ).length
    const clientsSansCoords = totalClients - clientsWithCoords
    const coveragePercent = clientsWithCoords > 0
      ? Math.round((clientsAssigned / clientsWithCoords) * 1000) / 10
      : 0

    // Stats par dépôt
    const depotStats = (depots || []).map(depot => {
      // Clients assignés à ce dépôt
      const assignedClients = allClients.filter(c =>
        c.depot_retrait_id === depot.id || c.depot_logistique_id === depot.id
      )

      const clientsInZone = assignedClients.length
      const velosInZone = assignedClients.reduce((sum: number, c: any) => sum + (c.velo_valide || 0), 0)
      const velosDevis = assignedClients.reduce((sum: number, c: any) => sum + (c.velo_devis || 0), 0)

      // Distance moyenne
      let totalDistance = 0
      let distanceCount = 0
      for (const client of assignedClients) {
        if (client.latitude && client.longitude && depot.latitude && depot.longitude) {
          totalDistance += calculateHaversineDistance(
            client.latitude, client.longitude,
            depot.latitude, depot.longitude
          )
          distanceCount++
        }
      }
      const avgDistanceKm = distanceCount > 0
        ? Math.round((totalDistance / distanceCount) * 10) / 10
        : 0

      return {
        id: depot.id,
        nom: depot.nom,
        type: depot.type,
        agence: depot.agence,
        clientsInZone,
        velosInZone,
        velosDevis,
        avgDistanceKm,
      }
    })

    return NextResponse.json({
      totalClients,
      clientsWithCoords,
      clientsSansCoords,
      clientsAssigned,
      clientsHorsZone,
      coveragePercent,
      depots: depotStats,
    })
  } catch (error: any) {
    console.error('Erreur stats dépôts:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
