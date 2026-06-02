import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateHaversineDistance } from '@/lib/geo/utils'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { parseFilters, isClientEligible } from '../_filters'

type LatLng = { lat: number; lng: number }

/** Test ray-casting even-odd (x = lng, y = lat), aucune dépendance externe. */
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

/** Centroïde simple (moyenne des sommets) — référence de distance en mode zone. */
function polygonCentroid(polygon: LatLng[]): LatLng {
  const n = polygon.length
  let lat = 0, lng = 0
  for (const p of polygon) { lat += p.lat; lng += p.lng }
  return { lat: lat / n, lng: lng / n }
}

/**
 * POST /api/admin/depots/simulate/export
 *
 * Exporte en XLSX la liste des clients d'une zone simulée.
 * Body (mode rayon) : { latitude, longitude, rayonKm, scope?: 'absorbed' | 'eligibles' }
 * Body (mode zone)  : { polygon: [{lat,lng}, ...], scope? }  (≥ 3 points)
 *
 * Mêmes colonnes / même format dans les deux modes (parité avec l'export rayon).
 * - 'absorbed' (défaut) : tous les clients dans la zone
 * - 'eligibles' : seulement ceux qui passent les critères tournée
 *   (NAF=OUI + dépôt logistique assigné + statut Contrôle validé / Formulaire envoyé / À livrer)
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['super_admin', 'admin', 'agent_secteur'])
  if (isAuthError(auth)) return auth

  try {
    const body = await request.json()
    const { latitude, longitude, rayonKm = 30, scope = 'absorbed', polygon } = body
    // Filtres actifs de la carte (statut / NAF / commercial). Vide = pas de restriction.
    const filters = parseFilters(body)

    const isPolygonMode = Array.isArray(polygon) && polygon.length >= 3

    if (!isPolygonMode && (!latitude || !longitude)) {
      return NextResponse.json({ error: 'latitude et longitude requis (ou un polygone d\'au moins 3 points)' }, { status: 400 })
    }

    const refPoint: LatLng = isPolygonMode
      ? polygonCentroid(polygon as LatLng[])
      : { lat: latitude, lng: longitude }

    const supabase = createAdminClient()

    // Récupérer tous les clients avec coordonnées + toutes les colonnes utiles
    const allClients: any[] = []
    let page = 0
    const pageSize = 1000
    while (true) {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .not('monday_sync_status', 'eq', 'deleted')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .range(page * pageSize, (page + 1) * pageSize - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      allClients.push(...data)
      if (data.length < pageSize) break
      page++
    }

    // Filtre : polygone (point-in-polygon) OU rayon (Haversine). Distance vs réf (centre ou centroïde).
    // Éligible tournée = ensemble livrable ∩ filtres actifs (voir _filters.ts) :
    // exclut systématiquement livre / client_hs.
    const inZone: any[] = []
    for (const c of allClients) {
      const d = calculateHaversineDistance(refPoint.lat, refPoint.lng, c.latitude, c.longitude)
      const inSelection = isPolygonMode
        ? pointInPolygon(c.latitude, c.longitude, polygon as LatLng[])
        : d <= rayonKm
      if (!inSelection) continue
      const isEligible = isClientEligible(c, filters)
      if (scope === 'eligibles' && !isEligible) continue
      inZone.push({ ...c, _distance_km: Math.round(d * 10) / 10, _eligible_tournee: isEligible ? 'OUI' : 'NON' })
    }

    if (inZone.length === 0) {
      const where = isPolygonMode ? 'zone personnalisée' : `rayon=${rayonKm} km`
      return NextResponse.json({ error: `Aucun client trouvé (scope=${scope}, ${where})` }, { status: 404 })
    }

    // Récupérer les noms des dépôts pour résoudre depot_logistique_id / depot_retrait_id
    const { data: depots } = await supabase.from('depots').select('id, nom')
    const depotMap: Record<string, string> = {}
    for (const d of depots || []) depotMap[d.id] = d.nom

    // Colonnes : ordre stable + libellés FR
    const columns: { header: string; get: (r: any) => any }[] = [
      { header: 'Raison sociale', get: r => r.raison_sociale ?? '' },
      { header: 'Réf. Retina', get: r => r.reference_retina ?? '' },
      { header: 'SIRET', get: r => r.siret ?? '' },
      { header: 'Statut commercial', get: r => r.statut_commercial ?? '' },
      { header: 'Validation NAF', get: r => r.validation_naf ?? '' },
      { header: 'Code NAF', get: r => r.code_naf ?? '' },
      { header: 'Éligible tournée', get: r => r._eligible_tournee },
      { header: 'Distance zone (km)', get: r => r._distance_km },
      { header: 'Vélos validés', get: r => r.velo_valide ?? 0 },
      { header: 'Vélos devis', get: r => r.velo_devis ?? 0 },
      { header: 'Commercial', get: r => r.commercial_assigne ?? '' },
      { header: 'Email', get: r => r.email ?? '' },
      { header: 'Téléphone', get: r => r.telephone ?? '' },
      { header: 'Adresse livraison', get: r => r.adresse_livraison_ligne1 ?? '' },
      { header: 'CP livraison', get: r => r.adresse_livraison_cp ?? '' },
      { header: 'Ville livraison', get: r => r.adresse_livraison_ville ?? '' },
      { header: 'Département', get: r => r.departement ?? '' },
      { header: 'Type de zone', get: r => r.type_de_zone ?? '' },
      { header: 'Dépôt retrait', get: r => r.depot_retrait_id ? (depotMap[r.depot_retrait_id] ?? '') : '' },
      { header: 'Dépôt logistique', get: r => r.depot_logistique_id ? (depotMap[r.depot_logistique_id] ?? '') : '' },
      { header: 'Latitude', get: r => r.latitude },
      { header: 'Longitude', get: r => r.longitude },
      { header: 'In ENEMAT', get: r => r.in_enemat ? 'OUI' : 'NON' },
      { header: 'Statut ENEMAT', get: r => r.statut_enemat ?? '' },
      { header: 'Date dépôt ENEMAT', get: r => r.date_depot_enemat ? new Date(r.date_depot_enemat).toISOString().slice(0, 10) : '' },
      { header: 'N° lot ENEMAT', get: r => r.numero_lot_enemat ?? '' },
      { header: 'N° facture ENEMAT', get: r => r.numero_facture_enemat ?? '' },
      { header: 'Created at', get: r => r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '' },
    ]

    // Tri par distance croissante
    inZone.sort((a, b) => a._distance_km - b._distance_km)

    const headers = columns.map(c => c.header)
    const sheetData = [headers, ...inZone.map(r => columns.map(c => c.get(r) ?? ''))]

    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    ws['!cols'] = headers.map((h, i) => {
      const maxLen = Math.max(h.length, ...sheetData.slice(1).map(r => String(r[i] ?? '').length))
      return { wch: Math.min(maxLen + 2, 40) }
    })
    const wb = XLSX.utils.book_new()
    const sheetName = isPolygonMode ? 'Zone personnalisee' : `Zone ${rayonKm}km`
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const today = new Date().toISOString().slice(0, 10)
    const filename = isPolygonMode
      ? `zone-simulee-${scope}-polygone-${today}.xlsx`
      : `zone-simulee-${scope}-${rayonKm}km-${today}.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: any) {
    console.error('Erreur export simulation:', err)
    return NextResponse.json({ error: err.message || 'Erreur serveur' }, { status: 500 })
  }
}
