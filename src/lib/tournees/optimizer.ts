/**
 * Algorithme de tournées intelligentes v3
 *
 * Règle fondamentale : max 50 minutes par vélo dans la tournée.
 *   - 20 min chez le client (1er vélo)
 *   - 5 min par vélo supplémentaire
 *   - 30 min max de trajet vers le client suivant
 *
 * Génère jusqu'à 10 simulations. Chaque simulation part d'un seed
 * différent et construit une tournée par nearest-neighbor en
 * respectant le budget temps.
 */

import { calculateHaversineDistance } from '@/lib/geo/utils'

// ─── Types ──────────────────────────────────────────────────────────────

export interface TourneeClient {
  id: string
  raison_sociale: string
  latitude: number
  longitude: number
  departement: string
  adresse_livraison_ville: string | null
  adresse_livraison_ligne1: string | null
  adresse_livraison_cp: string | null
  velo_devis: number
  velo_valide: number | null
  statut_commercial: string | null
  telephone: string | null
  email: string | null
  depot_logistique_id: string | null
}

export interface TourneeProposal {
  clients: TourneeClient[]
  stats: TourneeStats
  clientsSansGPS: number
  anchorPoint: { lat: number; lng: number }
}

export interface TourneeStats {
  nbClients: number
  nbVelosTotal: number
  distanceTotaleKm: number
  dureeEstimeeMinutes: number
  dureeFormatted: string
  retourDepotKm?: number
  retourDepotMinutes?: number
}

// ─── Constantes ─────────────────────────────────────────────────────────

const ROAD_FACTOR = 1.3
const AVERAGE_SPEED_KMH = 30
export const DEFAULT_MAX_TRAVEL_MINUTES = 30 // Trajet max entre 2 clients (paramétrable UI)
const MAX_BUDGET_MINUTES = 600 // 10h max de tournée (sans le retour final au dépôt)
const MAX_SIMULATIONS = 10

// ─── Fonctions utilitaires ──────────────────────────────────────────────

export function getClientBikeCount(client: TourneeClient): number {
  return client.velo_valide ?? client.velo_devis ?? 1
}

/**
 * Barème temps chez le client selon nombre de vélos :
 *  1 vélo  → 15 min
 *  2-3     → 20 min
 *  4-5     → 25 min
 *  6+      → 25 + 5 min par tranche de 2 vélos au-dessus de 5
 *            (6-7 = 30, 8-9 = 35, 10-11 = 40, ...)
 */
export function getTimeAtClient(nbVelos: number): number {
  if (nbVelos <= 1) return 15
  if (nbVelos <= 3) return 20
  if (nbVelos <= 5) return 25
  return 25 + Math.ceil((nbVelos - 5) / 2) * 5
}

function maxStepKmFromMinutes(maxTravelMinutes: number): number {
  return (maxTravelMinutes / 60) * AVERAGE_SPEED_KMH
}

export function estimateRoadDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  return calculateHaversineDistance(lat1, lon1, lat2, lon2) * ROAD_FACTOR
}

export function estimateTravelTime(distanceKm: number): number {
  return (distanceKm / AVERAGE_SPEED_KMH) * 60
}

/**
 * Calcule la durée totale d'une tournée.
 * Inclut : trajet anchor→1er client + temps chez chaque client + trajets inter-clients.
 * Si `includeReturnTrip` est true, ajoute aussi le trajet dernier client→anchor (retour dépôt).
 *
 * Note : le retour au dépôt n'est PAS inclus dans la contrainte de budget temps
 * (règle métier : max 10h sans compter le chemin de retour).
 */
function computeTourDuration(
  clients: TourneeClient[],
  anchor: { lat: number; lng: number },
  includeReturnTrip: boolean = false,
): number {
  if (clients.length === 0) return 0

  let totalMinutes = 0

  // Trajet anchor → premier client (pas de contrainte de distance ici)
  const distToFirst = estimateRoadDistance(anchor.lat, anchor.lng, clients[0].latitude, clients[0].longitude)
  totalMinutes += estimateTravelTime(distToFirst)

  for (let i = 0; i < clients.length; i++) {
    // Temps chez le client
    totalMinutes += getTimeAtClient(getClientBikeCount(clients[i]))

    // Trajet vers le client suivant
    if (i < clients.length - 1) {
      const dist = estimateRoadDistance(
        clients[i].latitude, clients[i].longitude,
        clients[i + 1].latitude, clients[i + 1].longitude,
      )
      totalMinutes += estimateTravelTime(dist)
    }
  }

  // Trajet retour : dernier client → anchor (pas de contrainte de distance non plus)
  if (includeReturnTrip) {
    const last = clients[clients.length - 1]
    const distReturn = estimateRoadDistance(last.latitude, last.longitude, anchor.lat, anchor.lng)
    totalMinutes += estimateTravelTime(distReturn)
  }

  return totalMinutes
}

// ─── Algorithme principal : simulations multi-seed ──────────────────────

export function generateSimulations(
  clients: TourneeClient[],
  anchor: { lat: number; lng: number },
  capaciteVelos: number,
  forcedClientId?: string,
  forcedClientIds?: string[],
  budgetMinutesOverride?: number,
  maxTravelMinutes: number = DEFAULT_MAX_TRAVEL_MINUTES,
): TourneeClient[][] {
  if (clients.length === 0) return []

  const budgetMinutes = budgetMinutesOverride ?? MAX_BUDGET_MINUTES
  const forcedClient = forcedClientId ? clients.find(c => c.id === forcedClientId) : undefined
  const forcedClients = forcedClientIds?.length
    ? clients.filter(c => forcedClientIds.includes(c.id))
    : []
  const seeds = selectDiverseSeeds(clients, anchor, maxTravelMinutes)
  const sims: TourneeClient[][] = []

  // Si un client est forcé, l'utiliser comme 1er seed
  if (forcedClient) {
    const tour = buildProximityTour(clients, forcedClient, anchor, capaciteVelos, budgetMinutes, maxTravelMinutes, forcedClientId, forcedClientIds)
    if (tour.length >= 1) sims.push(tour)
  }

  // Mode créneau : utiliser le client le plus proche de l'anchor parmi les forcés
  if (forcedClients.length > 0 && !forcedClient) {
    let best = forcedClients[0]
    let bestDist = Infinity
    for (const c of forcedClients) {
      const d = estimateRoadDistance(anchor.lat, anchor.lng, c.latitude, c.longitude)
      if (d < bestDist) { bestDist = d; best = c }
    }
    const tour = buildProximityTour(clients, best, anchor, capaciteVelos, budgetMinutes, maxTravelMinutes, undefined, forcedClientIds)
    if (tour.length >= 1) sims.push(tour)
  }

  for (const seed of seeds) {
    if (sims.length >= MAX_SIMULATIONS) break
    const tour = buildProximityTour(clients, seed, anchor, capaciteVelos, budgetMinutes, maxTravelMinutes, forcedClientId, forcedClientIds)
    if (tour.length >= 2 && !isDuplicateTour(tour, sims)) {
      sims.push(tour)
    }
  }

  // Si peu de simulations, essayer chaque client comme seed
  if (sims.length < 3 && clients.length >= 3) {
    for (const c of clients) {
      if (sims.length >= MAX_SIMULATIONS) break
      const tour = buildProximityTour(clients, c, anchor, capaciteVelos, budgetMinutes, maxTravelMinutes, forcedClientId, forcedClientIds)
      if (tour.length >= 2 && !isDuplicateTour(tour, sims)) {
        sims.push(tour)
      }
    }
  }

  return sims
}

/**
 * Sélectionne des seeds diversifiés géographiquement.
 */
function selectDiverseSeeds(
  clients: TourneeClient[],
  anchor: { lat: number; lng: number },
  maxTravelMinutes: number = DEFAULT_MAX_TRAVEL_MINUTES,
): TourneeClient[] {
  const seeds: TourneeClient[] = []
  const usedIds = new Set<string>()
  const SECTORS = 12
  const maxStepKm = maxStepKmFromMinutes(maxTravelMinutes)

  // 1. Client le plus proche de l'anchor
  let nearest = clients[0]
  let nearestDist = Infinity
  for (const c of clients) {
    const d = estimateRoadDistance(anchor.lat, anchor.lng, c.latitude, c.longitude)
    if (d < nearestDist) { nearestDist = d; nearest = c }
  }
  seeds.push(nearest)
  usedIds.add(nearest.id)

  // 2. Un seed par secteur angulaire
  for (let s = 0; s < SECTORS; s++) {
    const targetAngle = (s * 2 * Math.PI) / SECTORS - Math.PI
    let bestClient: TourneeClient | null = null
    let bestAngleDiff = Infinity

    for (const c of clients) {
      if (usedIds.has(c.id)) continue
      const angle = Math.atan2(c.longitude - anchor.lng, c.latitude - anchor.lat)
      const diff = Math.abs(angle - targetAngle)
      const normalizedDiff = diff > Math.PI ? 2 * Math.PI - diff : diff
      if (normalizedDiff < bestAngleDiff) {
        bestAngleDiff = normalizedDiff
        bestClient = c
      }
    }

    if (bestClient) {
      seeds.push(bestClient)
      usedIds.add(bestClient.id)
    }
  }

  // 3. Client le plus éloigné de l'anchor (mais dans un rayon raisonnable)
  let farthest = clients[0]
  let farthestDist = 0
  for (const c of clients) {
    if (usedIds.has(c.id)) continue
    const d = estimateRoadDistance(anchor.lat, anchor.lng, c.latitude, c.longitude)
    if (d > farthestDist && d <= maxStepKm * 3) { farthestDist = d; farthest = c }
  }
  if (!usedIds.has(farthest.id)) {
    seeds.push(farthest)
  }

  return seeds
}

/**
 * Construit une tournée par nearest-neighbor depuis un seed.
 *
 * Contraintes strictes :
 * 1. Capacité vélos max
 * 2. Distance max entre 2 clients consécutifs (MAX_STEP_KM ≈ 25km = 50 min)
 * 3. Budget temps total (capaciteVelos × 50 min ou override créneau)
 *
 * S'arrête dès qu'une contrainte est violée.
 */
function buildProximityTour(
  allClients: TourneeClient[],
  seed: TourneeClient,
  anchor: { lat: number; lng: number },
  capaciteVelos: number,
  budgetMinutes: number,
  maxTravelMinutes: number,
  forcedClientId?: string,
  forcedClientIds?: string[],
): TourneeClient[] {
  const maxStepKm = maxStepKmFromMinutes(maxTravelMinutes)
  const result: TourneeClient[] = [seed]
  const used = new Set<string>([seed.id])
  let totalBikes = getClientBikeCount(seed)

  // Si un client est forcé et n'est pas le seed, l'ajouter
  if (forcedClientId && forcedClientId !== seed.id) {
    const forced = allClients.find(c => c.id === forcedClientId)
    if (forced && totalBikes + getClientBikeCount(forced) <= capaciteVelos) {
      result.push(forced)
      used.add(forced.id)
      totalBikes += getClientBikeCount(forced)
    }
  }

  // Mode créneau : forcer tous les clients du créneau
  if (forcedClientIds?.length) {
    for (const fid of forcedClientIds) {
      if (used.has(fid)) continue
      const forced = allClients.find(c => c.id === fid)
      if (!forced) continue
      const forcedBikes = getClientBikeCount(forced)
      if (totalBikes + forcedBikes <= capaciteVelos) {
        result.push(forced)
        used.add(forced.id)
        totalBikes += forcedBikes
      }
    }
  }

  // Remplir avec nearest-neighbor en respectant les contraintes
  while (totalBikes < capaciteVelos) {
    const last = result[result.length - 1]

    let bestClient: TourneeClient | null = null
    let bestDist = Infinity

    for (const c of allClients) {
      if (used.has(c.id)) continue
      const bikes = getClientBikeCount(c)
      if (totalBikes + bikes > capaciteVelos) continue

      const d = estimateRoadDistance(last.latitude, last.longitude, c.latitude, c.longitude)
      if (d > maxStepKm) continue // > maxTravelMinutes de trajet entre 2 clients, skip
      if (d < bestDist) {
        bestDist = d
        bestClient = c
      }
    }

    if (!bestClient) break

    // Vérifier que l'ajout ne dépasse pas le budget temps
    const candidateTour = [...result, bestClient]
    const sorted = nearestNeighborSort(candidateTour, anchor)
    const duration = computeTourDuration(sorted, anchor)
    if (duration > budgetMinutes) break

    result.push(bestClient)
    used.add(bestClient.id)
    totalBikes += getClientBikeCount(bestClient)
  }

  // Optimiser l'ordre de visite
  return nearestNeighborSort(result, anchor)
}

/**
 * Détecte si une tournée est quasi-identique à une existante
 * (> 80% de clients en commun).
 */
function isDuplicateTour(tour: TourneeClient[], existing: TourneeClient[][]): boolean {
  const ids = new Set(tour.map(c => c.id))
  return existing.some(sim => {
    const simIds = new Set(sim.map(c => c.id))
    let overlap = 0
    for (const id of ids) { if (simIds.has(id)) overlap++ }
    return overlap / Math.max(ids.size, simIds.size) > 0.8
  })
}

// ─── Fonctions de compatibilité (appelées par l'API) ────────────────────

export function findOptimalClients(
  clients: TourneeClient[],
  anchor: { lat: number; lng: number },
  capaciteVelos: number,
  excludeIds: string[] = [],
  simulationIndex: number = 0,
  forcedClientId?: string,
  forcedClientIds?: string[],
  budgetMinutesOverride?: number,
  maxTravelMinutes: number = DEFAULT_MAX_TRAVEL_MINUTES,
): TourneeClient[] {
  const eligible = clients.filter(c => !excludeIds.includes(c.id))
  if (eligible.length === 0) return []

  const sims = generateSimulations(eligible, anchor, capaciteVelos, forcedClientId, forcedClientIds, budgetMinutesOverride, maxTravelMinutes)
  if (sims.length === 0) return []

  const idx = simulationIndex % sims.length
  return sims[idx]
}

export function countClusters(
  clients: TourneeClient[],
  anchor: { lat: number; lng: number },
  capaciteVelos: number,
  excludeIds: string[] = [],
  forcedClientId?: string,
  forcedClientIds?: string[],
  budgetMinutesOverride?: number,
  maxTravelMinutes: number = DEFAULT_MAX_TRAVEL_MINUTES,
): number {
  const eligible = clients.filter(c => !excludeIds.includes(c.id))
  return generateSimulations(eligible, anchor, capaciteVelos, forcedClientId, forcedClientIds, budgetMinutesOverride, maxTravelMinutes).length
}

// ─── TSP nearest-neighbor ───────────────────────────────────────────────

function nearestNeighborSort(
  clients: TourneeClient[],
  start: { lat: number; lng: number }
): TourneeClient[] {
  if (clients.length <= 1) return clients

  const result: TourneeClient[] = []
  const remaining = [...clients]
  let currentLat = start.lat
  let currentLng = start.lng

  while (remaining.length > 0) {
    let nearestIdx = 0
    let nearestDist = Infinity

    for (let i = 0; i < remaining.length; i++) {
      const dist = estimateRoadDistance(currentLat, currentLng, remaining[i].latitude, remaining[i].longitude)
      if (dist < nearestDist) {
        nearestDist = dist
        nearestIdx = i
      }
    }

    const nearest = remaining.splice(nearestIdx, 1)[0]
    result.push(nearest)
    currentLat = nearest.latitude
    currentLng = nearest.longitude
  }

  return result
}

// ─── Stats et distances ─────────────────────────────────────────────────

export function calculateTourStats(
  clients: TourneeClient[],
  anchor: { lat: number; lng: number }
): TourneeStats {
  if (clients.length === 0) {
    return { nbClients: 0, nbVelosTotal: 0, distanceTotaleKm: 0, dureeEstimeeMinutes: 0, dureeFormatted: '0h00' }
  }

  let distanceTotaleKm = 0

  // Trajet anchor → premier client
  distanceTotaleKm += estimateRoadDistance(anchor.lat, anchor.lng, clients[0].latitude, clients[0].longitude)

  for (let i = 0; i < clients.length; i++) {
    if (i < clients.length - 1) {
      distanceTotaleKm += estimateRoadDistance(
        clients[i].latitude, clients[i].longitude,
        clients[i + 1].latitude, clients[i + 1].longitude
      )
    }
  }

  // Retour au dépôt (dernier client → anchor) — inclus dans stats affichées
  const last = clients[clients.length - 1]
  distanceTotaleKm += estimateRoadDistance(last.latitude, last.longitude, anchor.lat, anchor.lng)

  const dureeMinutes = computeTourDuration(clients, anchor, true)
  const nbVelosTotal = clients.reduce((sum, c) => sum + getClientBikeCount(c), 0)
  const hours = Math.floor(dureeMinutes / 60)
  const mins = Math.round(dureeMinutes % 60)

  // Retour dépôt en valeurs séparées (pour affichage UI)
  const retourDepotKm = estimateRoadDistance(last.latitude, last.longitude, anchor.lat, anchor.lng)
  const retourDepotMinutes = estimateTravelTime(retourDepotKm)

  return {
    nbClients: clients.length,
    nbVelosTotal,
    distanceTotaleKm: Math.round(distanceTotaleKm * 10) / 10,
    dureeEstimeeMinutes: Math.round(dureeMinutes),
    dureeFormatted: `${hours}h${mins.toString().padStart(2, '0')}`,
    retourDepotKm: Math.round(retourDepotKm * 10) / 10,
    retourDepotMinutes: Math.round(retourDepotMinutes),
  }
}

export function calculateInterClientDistances(
  clients: TourneeClient[],
  anchor: { lat: number; lng: number }
): { distanceFromPrevKm: number; travelMinutesFromPrev: number }[] {
  return clients.map((client, i) => {
    if (i === 0) {
      const dist = estimateRoadDistance(anchor.lat, anchor.lng, client.latitude, client.longitude)
      return { distanceFromPrevKm: Math.round(dist * 10) / 10, travelMinutesFromPrev: Math.round(estimateTravelTime(dist)) }
    }
    const prev = clients[i - 1]
    const dist = estimateRoadDistance(prev.latitude, prev.longitude, client.latitude, client.longitude)
    return { distanceFromPrevKm: Math.round(dist * 10) / 10, travelMinutesFromPrev: Math.round(estimateTravelTime(dist)) }
  })
}

// ─── Centroïdes départements (France métropolitaine + DOM) ──────────────

const DEPARTEMENT_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  '01': { lat: 46.07, lng: 5.35 }, '02': { lat: 49.56, lng: 3.56 },
  '03': { lat: 46.39, lng: 3.17 }, '04': { lat: 44.10, lng: 6.24 },
  '05': { lat: 44.66, lng: 6.26 }, '06': { lat: 43.94, lng: 7.12 },
  '07': { lat: 44.75, lng: 4.50 }, '08': { lat: 49.62, lng: 4.63 },
  '09': { lat: 42.93, lng: 1.50 }, '10': { lat: 48.30, lng: 4.08 },
  '11': { lat: 43.16, lng: 2.40 }, '12': { lat: 44.28, lng: 2.68 },
  '13': { lat: 43.49, lng: 5.07 }, '14': { lat: 49.09, lng: -0.37 },
  '15': { lat: 45.03, lng: 2.68 }, '16': { lat: 45.72, lng: 0.16 },
  '17': { lat: 45.84, lng: -0.78 }, '18': { lat: 47.02, lng: 2.50 },
  '19': { lat: 45.36, lng: 1.87 }, '21': { lat: 47.32, lng: 4.77 },
  '22': { lat: 48.44, lng: -2.98 }, '23': { lat: 46.08, lng: 2.00 },
  '24': { lat: 45.14, lng: 0.73 }, '25': { lat: 47.16, lng: 6.36 },
  '26': { lat: 44.68, lng: 5.17 }, '27': { lat: 49.11, lng: 1.15 },
  '28': { lat: 48.33, lng: 1.49 }, '29': { lat: 48.28, lng: -4.10 },
  '2A': { lat: 41.87, lng: 8.98 }, '2B': { lat: 42.45, lng: 9.21 },
  '30': { lat: 44.02, lng: 4.18 }, '31': { lat: 43.35, lng: 1.22 },
  '32': { lat: 43.65, lng: 0.58 }, '33': { lat: 44.73, lng: -0.58 },
  '34': { lat: 43.59, lng: 3.46 }, '35': { lat: 48.11, lng: -1.68 },
  '36': { lat: 46.81, lng: 1.69 }, '37': { lat: 47.25, lng: 0.68 },
  '38': { lat: 45.26, lng: 5.73 }, '39': { lat: 46.73, lng: 5.67 },
  '40': { lat: 43.98, lng: -0.77 }, '41': { lat: 47.63, lng: 1.33 },
  '42': { lat: 45.73, lng: 4.17 }, '43': { lat: 45.14, lng: 3.75 },
  '44': { lat: 47.28, lng: -1.75 }, '45': { lat: 47.91, lng: 2.17 },
  '46': { lat: 44.62, lng: 1.60 }, '47': { lat: 44.37, lng: 0.47 },
  '48': { lat: 44.52, lng: 3.50 }, '49': { lat: 47.39, lng: -0.59 },
  '50': { lat: 48.89, lng: -1.33 }, '51': { lat: 48.95, lng: 3.83 },
  '52': { lat: 48.11, lng: 5.27 }, '53': { lat: 48.08, lng: -0.77 },
  '54': { lat: 48.79, lng: 6.17 }, '55': { lat: 49.00, lng: 5.38 },
  '56': { lat: 47.83, lng: -2.83 }, '57': { lat: 49.02, lng: 6.67 },
  '58': { lat: 47.08, lng: 3.50 }, '59': { lat: 50.45, lng: 3.17 },
  '60': { lat: 49.42, lng: 2.50 }, '61': { lat: 48.58, lng: 0.17 },
  '62': { lat: 50.52, lng: 2.33 }, '63': { lat: 45.72, lng: 3.08 },
  '64': { lat: 43.30, lng: -0.77 }, '65': { lat: 43.08, lng: 0.17 },
  '66': { lat: 42.58, lng: 2.50 }, '67': { lat: 48.58, lng: 7.58 },
  '68': { lat: 47.87, lng: 7.17 }, '69': { lat: 45.87, lng: 4.63 },
  '70': { lat: 47.62, lng: 6.17 }, '71': { lat: 46.63, lng: 4.42 },
  '72': { lat: 47.92, lng: 0.17 }, '73': { lat: 45.48, lng: 6.42 },
  '74': { lat: 46.08, lng: 6.33 }, '75': { lat: 48.86, lng: 2.35 },
  '76': { lat: 49.67, lng: 1.08 }, '77': { lat: 48.62, lng: 2.92 },
  '78': { lat: 48.82, lng: 1.87 }, '79': { lat: 46.50, lng: -0.33 },
  '80': { lat: 49.92, lng: 2.33 }, '81': { lat: 43.77, lng: 2.17 },
  '82': { lat: 44.02, lng: 1.28 }, '83': { lat: 43.47, lng: 6.22 },
  '84': { lat: 44.00, lng: 5.17 }, '85': { lat: 46.67, lng: -1.33 },
  '86': { lat: 46.58, lng: 0.33 }, '87': { lat: 45.83, lng: 1.25 },
  '88': { lat: 48.17, lng: 6.42 }, '89': { lat: 47.83, lng: 3.58 },
  '90': { lat: 47.63, lng: 6.87 }, '91': { lat: 48.52, lng: 2.25 },
  '92': { lat: 48.83, lng: 2.25 }, '93': { lat: 48.91, lng: 2.48 },
  '94': { lat: 48.78, lng: 2.47 }, '95': { lat: 49.07, lng: 2.17 },
  '971': { lat: 16.19, lng: -61.55 }, '972': { lat: 14.64, lng: -61.02 },
  '973': { lat: 3.93, lng: -53.23 }, '974': { lat: -21.11, lng: 55.53 },
  '976': { lat: -12.82, lng: 45.17 },
}

export function getDepartementCentroid(dept: string): { lat: number; lng: number } | null {
  return DEPARTEMENT_CENTROIDS[dept] ?? null
}

export function getClientsCentroid(clients: TourneeClient[]): { lat: number; lng: number } {
  if (clients.length === 0) return { lat: 48.86, lng: 2.35 }
  const sumLat = clients.reduce((s, c) => s + c.latitude, 0)
  const sumLng = clients.reduce((s, c) => s + c.longitude, 0)
  return { lat: sumLat / clients.length, lng: sumLng / clients.length }
}
