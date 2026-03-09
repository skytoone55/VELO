import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { calculateHaversineDistance } from '@/lib/geo/utils'

/**
 * API de simulation de placement de dépôt
 *
 * POST /api/admin/depots/simulate
 * Body: { latitude, longitude, rayonKm, rayonPayantKm? }
 *
 * Retourne :
 * - clientsAbsorbed : nombre de clients dans le rayon
 * - velosAbsorbed : nombre de vélos dans la zone
 * - clientsByDistance : distribution par tranche de distance
 * - clientsCurrentlyUnassigned : clients actuellement sans dépôt qui seraient couverts
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(['super_admin', 'admin'])
    if (isAuthError(authResult)) return authResult

    const body = await request.json()
    const { latitude, longitude, rayonKm = 30, rayonPayantKm } = body

    if (!latitude || !longitude) {
      return NextResponse.json(
        { error: 'latitude et longitude requis' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // Récupérer tous les clients avec coordonnées
    let allClients: any[] = []
    let page = 0
    const pageSize = 1000

    while (true) {
      const { data: clients, error } = await adminClient
        .from('clients')
        .select('id, latitude, longitude, depot_retrait_id, depot_logistique_id, velo_valide, velo_devis, raison_sociale')
        .not('monday_sync_status', 'eq', 'deleted')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (error) throw error
      if (!clients || clients.length === 0) break

      allClients = allClients.concat(clients)
      if (clients.length < pageSize) break
      page++
    }

    // Calculer les distances et filtrer par rayon
    const maxRayon = rayonPayantKm || rayonKm
    const distanceRanges = [
      { range: '0-5 km', min: 0, max: 5, count: 0, velos: 0 },
      { range: '5-10 km', min: 5, max: 10, count: 0, velos: 0 },
      { range: '10-20 km', min: 10, max: 20, count: 0, velos: 0 },
      { range: '20-30 km', min: 20, max: 30, count: 0, velos: 0 },
      { range: '30-50 km', min: 30, max: 50, count: 0, velos: 0 },
      { range: '50-100 km', min: 50, max: 100, count: 0, velos: 0 },
      { range: '100+ km', min: 100, max: Infinity, count: 0, velos: 0 },
    ]

    let clientsInGratuite = 0
    let clientsInPayante = 0
    let velosInGratuite = 0
    let velosInPayante = 0
    let clientsCurrentlyUnassigned = 0
    let totalAbsorbed = 0
    let totalVelos = 0

    for (const client of allClients) {
      const distance = calculateHaversineDistance(
        latitude, longitude,
        client.latitude, client.longitude
      )

      // Compter dans les tranches de distance
      for (const range of distanceRanges) {
        if (distance >= range.min && distance < range.max) {
          range.count++
          range.velos += client.velo_valide || 0
          break
        }
      }

      // Dans le rayon total (gratuit + payant)
      if (distance <= maxRayon) {
        totalAbsorbed++
        totalVelos += client.velo_valide || 0

        if (distance <= rayonKm) {
          clientsInGratuite++
          velosInGratuite += client.velo_valide || 0
        } else {
          clientsInPayante++
          velosInPayante += client.velo_valide || 0
        }

        // Client actuellement non assigné
        if (!client.depot_retrait_id && !client.depot_logistique_id) {
          clientsCurrentlyUnassigned++
        }
      }
    }

    // Ne garder que les tranches pertinentes (non vides ou dans le rayon)
    const clientsByDistance = distanceRanges.filter(r =>
      r.count > 0 || r.max <= maxRayon
    ).map(({ range, count, velos }) => ({ range, count, velos }))

    return NextResponse.json({
      clientsAbsorbed: totalAbsorbed,
      velosAbsorbed: totalVelos,
      clientsInGratuite,
      clientsInPayante,
      velosInGratuite,
      velosInPayante,
      clientsCurrentlyUnassigned,
      clientsByDistance,
      totalClientsWithCoords: allClients.length,
      rayonKm,
      rayonPayantKm: rayonPayantKm || null,
    })
  } catch (error: any) {
    console.error('Erreur simulation dépôt:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
