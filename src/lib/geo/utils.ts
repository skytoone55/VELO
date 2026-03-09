/**
 * Utilitaires géographiques partagés
 *
 * Centralise les fonctions de géocodage, calcul de distance Haversine,
 * et logique de proximité des dépôts.
 */

// ─── Types ──────────────────────────────────────────────────────────────

export interface GeoCoords {
  lat: number
  lng: number
}

export interface ClientAddress {
  adresse: string
  codePostal: string
  ville: string
  source: 'livraison' | 'societe'
}

export interface DepotWithCoords {
  id: string
  nom: string
  latitude: number
  longitude: number
  rayon_couverture_km: number
  rayon_livraison_payant_km?: number
  prix_livraison_payante?: number
  type: 'retrait' | 'logistique'
  agence?: string
}

export interface NearestDepotResult {
  depot: DepotWithCoords
  distanceKm: number
}

export interface ZoneClassification {
  depotRetraitId: string | null
  depotLogistiqueId: string | null
  modeLivraison: 'retrait' | 'domicile'
  zoneLivraison: 'gratuite' | 'payante' | 'hors_zone'
  depotInfo: DepotWithCoords | null
  distanceKm: number | null
  horsZone: boolean
}

// ─── Calcul de distance Haversine ───────────────────────────────────────

/**
 * Calcule la distance en km entre deux points GPS via la formule Haversine
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371 // Rayon de la Terre en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// ─── Géocodage ──────────────────────────────────────────────────────────

/**
 * Géocode une adresse via l'API gouvernementale française (api-adresse.data.gouv.fr)
 * Retourne les coordonnées GPS ou null si l'adresse n'est pas trouvée
 *
 * Stratégie en 3 passes :
 * 1. Adresse complète (adresse + CP + ville) → score précis
 * 2. Fallback CP + ville seulement → pour les lieux-dits, hameaux, ZI, etc.
 *    Le score est plafonné à 0.5 car c'est un géocodage au niveau commune
 * 3. Fallback code postal seul → centroïde de la commune (type=municipality)
 *    Le score est plafonné à 0.3 car c'est un géocodage très approximatif
 */
export async function geocodeAddress(
  adresse: string,
  codePostal: string,
  ville: string,
  minScore: number = 0.4
): Promise<(GeoCoords & { score: number }) | null> {
  // Passe 1 : adresse complète
  const fullResult = await _geocodeQuery(`${adresse} ${codePostal} ${ville}`)
  if (fullResult && fullResult.score >= minScore) {
    return fullResult
  }

  // Passe 2 : fallback CP + ville (lieux-dits, hameaux, ZI, adresses mal formatées)
  if (ville) {
    const fallbackResult = await _geocodeQuery(`${codePostal} ${ville}`)
    if (fallbackResult) {
      // Plafonner le score à 0.5 car c'est un géocodage au niveau commune, pas adresse
      return {
        ...fallbackResult,
        score: Math.min(fallbackResult.score, 0.5),
      }
    }
  }

  // Passe 3 : fallback code postal seul → centroïde municipality
  if (codePostal) {
    const centroidResult = await _geocodeMunicipality(codePostal)
    if (centroidResult) {
      return {
        ...centroidResult,
        score: Math.min(centroidResult.score, 0.3),
      }
    }
  }

  return null
}

/**
 * Appel unitaire à l'API de géocodage
 */
async function _geocodeQuery(
  queryStr: string
): Promise<(GeoCoords & { score: number }) | null> {
  try {
    const query = encodeURIComponent(queryStr)
    const response = await fetch(
      `https://api-adresse.data.gouv.fr/search/?q=${query}&limit=1`
    )

    if (!response.ok) return null

    const data = await response.json()

    if (data.features && data.features.length > 0) {
      const feature = data.features[0]
      const [lng, lat] = feature.geometry.coordinates
      const score = feature.properties?.score || 0
      return { lat, lng, score }
    }
    return null
  } catch (error) {
    console.error('Erreur géocodage:', error)
    return null
  }
}

/**
 * Appel à l'API de géocodage pour obtenir le centroïde d'une commune via son code postal
 * Utilise type=municipality pour récupérer le centre de la commune
 */
async function _geocodeMunicipality(
  codePostal: string
): Promise<(GeoCoords & { score: number }) | null> {
  try {
    const cp = encodeURIComponent(codePostal.trim())
    const response = await fetch(
      `https://api-adresse.data.gouv.fr/search/?q=${cp}&type=municipality&postcode=${cp}&limit=1`
    )

    if (!response.ok) return null

    const data = await response.json()

    if (data.features && data.features.length > 0) {
      const feature = data.features[0]
      const [lng, lat] = feature.geometry.coordinates
      const score = feature.properties?.score || 0
      return { lat, lng, score }
    }
    return null
  } catch (error) {
    console.error('Erreur géocodage municipality:', error)
    return null
  }
}

// ─── Logique d'adresse client ───────────────────────────────────────────

/**
 * Détermine la meilleure adresse à utiliser pour un client
 * Priorité : adresse de livraison > adresse société
 *
 * Accepte un objet client partiel avec les champs d'adresse
 */
export function buildClientAddress(client: {
  adresse_livraison_ligne1?: string | null
  adresse_livraison_cp?: string | null
  adresse_livraison_ville?: string | null
  adresse_societe_ligne1?: string | null
  adresse_societe_cp?: string | null
  adresse_societe_ville?: string | null
}): ClientAddress | null {
  // Priorité 1 : adresse de livraison (si complète)
  if (
    client.adresse_livraison_ligne1 &&
    client.adresse_livraison_cp &&
    client.adresse_livraison_ville
  ) {
    return {
      adresse: client.adresse_livraison_ligne1,
      codePostal: client.adresse_livraison_cp,
      ville: client.adresse_livraison_ville,
      source: 'livraison',
    }
  }

  // Priorité 2 : adresse société (fallback)
  if (
    client.adresse_societe_ligne1 &&
    client.adresse_societe_cp &&
    client.adresse_societe_ville
  ) {
    return {
      adresse: client.adresse_societe_ligne1,
      codePostal: client.adresse_societe_cp,
      ville: client.adresse_societe_ville,
      source: 'societe',
    }
  }

  // Priorité 3 : code postal seul (centroïde commune)
  const cp =
    client.adresse_livraison_cp || client.adresse_societe_cp
  const ville =
    client.adresse_livraison_ville || client.adresse_societe_ville
  if (cp) {
    return {
      adresse: '',
      codePostal: cp,
      ville: ville || '',
      source: 'societe',
    }
  }

  return null
}

// ─── Proximité dépôts ───────────────────────────────────────────────────

/**
 * Trouve le dépôt le plus proche d'un point GPS parmi une liste de dépôts
 */
export function findNearestDepot(
  lat: number,
  lng: number,
  depots: DepotWithCoords[]
): NearestDepotResult | null {
  let nearest: NearestDepotResult | null = null

  for (const depot of depots) {
    if (!depot.latitude || !depot.longitude) continue

    const distance = calculateHaversineDistance(lat, lng, depot.latitude, depot.longitude)

    if (!nearest || distance < nearest.distanceKm) {
      nearest = {
        depot,
        distanceKm: Math.round(distance * 10) / 10,
      }
    }
  }

  return nearest
}

/**
 * Classifie un client dans une zone par rapport aux dépôts disponibles
 *
 * Logique :
 * 1. Chercher le dépôt RETRAIT le plus proche → si dans sa couverture, mode retrait
 * 2. Sinon, chercher le dépôt LOGISTIQUE le plus proche → livraison domicile
 * 3. Si hors zone de tous les dépôts → hors zone
 *
 * Zones par dépôt :
 * - 0 à rayon_couverture_km = Zone gratuite
 * - rayon_couverture_km à rayon_livraison_payant_km = Zone payante
 * - Au-delà = Hors zone
 */
export function classifyClientZone(
  lat: number,
  lng: number,
  depots: DepotWithCoords[]
): ZoneClassification {
  const depotsRetrait = depots.filter((d) => d.type === 'retrait')
  const depotsLogistique = depots.filter((d) => d.type === 'logistique')

  // 1. Chercher le dépôt RETRAIT le plus proche
  const nearestRetrait = findNearestDepot(lat, lng, depotsRetrait)

  if (nearestRetrait) {
    const rayonGratuit = nearestRetrait.depot.rayon_couverture_km || 30
    const rayonPayant = nearestRetrait.depot.rayon_livraison_payant_km || rayonGratuit

    if (nearestRetrait.distanceKm <= rayonGratuit) {
      return {
        depotRetraitId: nearestRetrait.depot.id,
        depotLogistiqueId: null,
        modeLivraison: 'retrait',
        zoneLivraison: 'gratuite',
        depotInfo: nearestRetrait.depot,
        distanceKm: nearestRetrait.distanceKm,
        horsZone: false,
      }
    }

    if (nearestRetrait.distanceKm <= rayonPayant) {
      return {
        depotRetraitId: nearestRetrait.depot.id,
        depotLogistiqueId: null,
        modeLivraison: 'retrait',
        zoneLivraison: 'payante',
        depotInfo: nearestRetrait.depot,
        distanceKm: nearestRetrait.distanceKm,
        horsZone: false,
      }
    }
  }

  // 2. Chercher le dépôt LOGISTIQUE le plus proche
  const nearestLogistique = findNearestDepot(lat, lng, depotsLogistique)

  if (nearestLogistique) {
    const rayonGratuit = nearestLogistique.depot.rayon_couverture_km || 30
    const rayonPayant = nearestLogistique.depot.rayon_livraison_payant_km || rayonGratuit

    if (nearestLogistique.distanceKm <= rayonGratuit) {
      return {
        depotRetraitId: null,
        depotLogistiqueId: nearestLogistique.depot.id,
        modeLivraison: 'domicile',
        zoneLivraison: 'gratuite',
        depotInfo: nearestLogistique.depot,
        distanceKm: nearestLogistique.distanceKm,
        horsZone: false,
      }
    }

    if (nearestLogistique.distanceKm <= rayonPayant) {
      return {
        depotRetraitId: null,
        depotLogistiqueId: nearestLogistique.depot.id,
        modeLivraison: 'domicile',
        zoneLivraison: 'payante',
        depotInfo: nearestLogistique.depot,
        distanceKm: nearestLogistique.distanceKm,
        horsZone: false,
      }
    }

    // Hors zone — rattaché au dépôt logistique le plus proche par défaut
    return {
      depotRetraitId: null,
      depotLogistiqueId: nearestLogistique.depot.id,
      modeLivraison: 'domicile',
      zoneLivraison: 'hors_zone',
      depotInfo: nearestLogistique.depot,
      distanceKm: nearestLogistique.distanceKm,
      horsZone: true,
    }
  }

  // 3. Aucun dépôt logistique — essayer le dépôt retrait le plus proche
  if (nearestRetrait) {
    return {
      depotRetraitId: nearestRetrait.depot.id,
      depotLogistiqueId: null,
      modeLivraison: 'retrait',
      zoneLivraison: 'hors_zone',
      depotInfo: nearestRetrait.depot,
      distanceKm: nearestRetrait.distanceKm,
      horsZone: true,
    }
  }

  // 4. Aucun dépôt trouvé du tout
  return {
    depotRetraitId: null,
    depotLogistiqueId: null,
    modeLivraison: 'domicile',
    zoneLivraison: 'hors_zone',
    depotInfo: null,
    distanceKm: null,
    horsZone: true,
  }
}

/**
 * Version simplifiée pour la liste clients :
 * retourne 'dans_la_zone' | 'hors_zone' | null (pas de coords)
 */
export function getSimpleZoneStatus(
  client: { latitude?: number | null; longitude?: number | null },
  depots: DepotWithCoords[]
): 'dans_la_zone' | 'hors_zone' | null {
  if (!client.latitude || !client.longitude || depots.length === 0) return null
  const result = classifyClientZone(client.latitude, client.longitude, depots)
  return result.horsZone ? 'hors_zone' : 'dans_la_zone'
}
