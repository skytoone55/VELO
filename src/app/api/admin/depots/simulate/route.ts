import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateHaversineDistance } from '@/lib/geo/utils'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { parseFilters, isClientEligible } from './_filters'

type LatLng = { lat: number; lng: number }

/**
 * Test ray-casting : le point (lat,lng) est-il à l'intérieur du polygone ?
 * Algorithme even-odd standard, aucune dépendance externe.
 * On travaille dans le repère (x = lng, y = lat).
 */
function pointInPolygon(lat: number, lng: number, polygon: LatLng[]): boolean {
  if (!Array.isArray(polygon) || polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat
    const xj = polygon[j].lng, yj = polygon[j].lat
    const intersect =
      (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Centroïde simple (moyenne des sommets) — référence pour la distance en mode zone. */
function polygonCentroid(polygon: LatLng[]): LatLng {
  const n = polygon.length
  let lat = 0, lng = 0
  for (const p of polygon) { lat += p.lat; lng += p.lng }
  return { lat: lat / n, lng: lng / n }
}

/**
 * API de simulation de placement de dépôt
 *
 * POST /api/admin/depots/simulate
 * Body (mode rayon)   : { latitude, longitude, rayonKm, rayonPayantKm? }
 * Body (mode zone)    : { polygon: [{lat,lng}, ...] }  (≥ 3 points)
 *
 * Le format de réponse est IDENTIQUE dans les deux modes (parité de résultat).
 *
 * Retourne :
 * - clientsAbsorbed : nombre de clients dans la zone (rayon ou polygone)
 * - velosAbsorbed : nombre de vélos dans la zone
 * - clientsByDistance : distribution par tranche de distance (vs centre ou centroïde)
 * - clientsCurrentlyUnassigned : clients actuellement sans dépôt qui seraient couverts
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['super_admin', 'admin', 'agent_secteur'])
  if (isAuthError(auth)) return auth

  try {
    const body = await request.json()
    const { latitude, longitude, rayonKm = 30, rayonPayantKm, polygon } = body
    // Filtres actifs de la carte (statut / NAF / commercial). Vide = pas de restriction.
    const filters = parseFilters(body)

    const isPolygonMode = Array.isArray(polygon) && polygon.length >= 3

    if (!isPolygonMode && (!latitude || !longitude)) {
      return NextResponse.json(
        { error: 'latitude et longitude requis (ou un polygone d\'au moins 3 points)' },
        { status: 400 }
      )
    }

    // En mode zone, on utilise le centroïde du polygone comme référence de distance
    // (pour alimenter le breakdown "Par distance" sans casser le panneau existant).
    const refPoint: LatLng = isPolygonMode
      ? polygonCentroid(polygon as LatLng[])
      : { lat: latitude, lng: longitude }

    const adminClient = createAdminClient()

    // Récupérer tous les clients avec coordonnées
    let allClients: any[] = []
    let page = 0
    const pageSize = 1000

    while (true) {
      const { data: clients, error } = await adminClient
        .from('clients')
        .select('id, latitude, longitude, depot_retrait_id, depot_logistique_id, velo_valide, velo_devis, raison_sociale, statut_commercial, validation_naf, monday_board_id')
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
    let totalVelosDevis = 0
    const clientsAbsorbedIds: string[] = []
    const statutsBreakdown: Record<string, { clients: number; velos: number }> = {}
    const nafBreakdown: Record<string, number> = { OUI: 0, NON: 0, AUTRE: 0 }

    // Éligible tournée intelligente = client AVANT livraison (ensemble livrable)
    // ∩ filtres actifs de la carte (statut / NAF / commercial). Voir _filters.ts.
    let clientsEligibles = 0
    let velosEligibles = 0
    let clientsNonEligibles = 0
    let velosNonEligibles = 0
    const clientsEligiblesIds: string[] = []
    // Répartition par statut commercial, calculée UNIQUEMENT sur les clients éligibles.
    // La somme de ses entrées = clientsEligibles / velosEligibles.
    const statutsBreakdownEligibles: Record<string, { count: number; velos: number }> = {}

    for (const client of allClients) {
      const distance = calculateHaversineDistance(
        refPoint.lat, refPoint.lng,
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

      // Sélection : polygone (point-in-polygon) OU rayon (Haversine)
      const inSelection = isPolygonMode
        ? pointInPolygon(client.latitude, client.longitude, polygon as LatLng[])
        : distance <= maxRayon

      // Dans la zone (gratuit + payant en mode rayon, ou polygone)
      if (inSelection) {
        totalAbsorbed++
        const velosClient = client.velo_valide || 0
        totalVelos += velosClient
        totalVelosDevis += client.velo_devis || 0
        clientsAbsorbedIds.push(client.id)

        // Éligibilité tournée intelligente : ensemble livrable ∩ filtres actifs.
        // Exclut systématiquement livre / client_hs (jamais dans STATUTS_LIVRABLES).
        const isEligible = isClientEligible(client, filters)
        if (isEligible) {
          clientsEligibles++
          velosEligibles += velosClient
          clientsEligiblesIds.push(client.id)

          // Breakdown par statut commercial — éligibles seulement.
          const statutElig = client.statut_commercial || 'non_renseigne'
          if (!statutsBreakdownEligibles[statutElig]) statutsBreakdownEligibles[statutElig] = { count: 0, velos: 0 }
          statutsBreakdownEligibles[statutElig].count++
          statutsBreakdownEligibles[statutElig].velos += velosClient
        } else {
          clientsNonEligibles++
          velosNonEligibles += velosClient
        }

        // Breakdown par statut commercial
        const statut = client.statut_commercial || 'non_renseigne'
        if (!statutsBreakdown[statut]) statutsBreakdown[statut] = { clients: 0, velos: 0 }
        statutsBreakdown[statut].clients++
        statutsBreakdown[statut].velos += velosClient

        // Breakdown NAF
        const naf = client.validation_naf
        if (naf === 'OUI') nafBreakdown.OUI++
        else if (naf === 'NON') nafBreakdown.NON++
        else nafBreakdown.AUTRE++

        if (distance <= rayonKm) {
          clientsInGratuite++
          velosInGratuite += velosClient
        } else {
          clientsInPayante++
          velosInPayante += velosClient
        }

        // Client actuellement non assigné
        if (!client.depot_retrait_id && !client.depot_logistique_id) {
          clientsCurrentlyUnassigned++
        }
      }
    }

    // Ne garder que les tranches pertinentes.
    // Mode rayon : non vides OU dans le rayon. Mode zone : non vides seulement.
    const clientsByDistance = distanceRanges.filter(r =>
      r.count > 0 || (!isPolygonMode && r.max <= maxRayon)
    ).map(({ range, count, velos }) => ({ range, count, velos }))

    return NextResponse.json({
      clientsAbsorbed: totalAbsorbed,
      velosAbsorbed: totalVelos,
      velosDevisAbsorbed: totalVelosDevis,
      clientsEligibles,
      velosEligibles,
      clientsNonEligibles,
      velosNonEligibles,
      clientsEligiblesIds,
      clientsInGratuite,
      clientsInPayante,
      velosInGratuite,
      velosInPayante,
      clientsCurrentlyUnassigned,
      clientsByDistance,
      statutsBreakdown,
      statutsBreakdownEligibles,
      nafBreakdown,
      clientsAbsorbedIds,
      totalClientsWithCoords: allClients.length,
      rayonKm: isPolygonMode ? null : rayonKm,
      rayonPayantKm: isPolygonMode ? null : (rayonPayantKm || null),
      mode: isPolygonMode ? 'polygon' : 'rayon',
      polygonPointCount: isPolygonMode ? (polygon as LatLng[]).length : null,
    })
  } catch (error: any) {
    console.error('Erreur simulation dépôt:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
