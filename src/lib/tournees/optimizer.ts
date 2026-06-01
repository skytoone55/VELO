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
  coutEssenceEur?: number
  coutPeageEur?: number
  coutTotalEur?: number
}

// Estimation coût utilitaire diesel France (paramètres ajustables si besoin)
export const COST_ESSENCE_EUR_PER_KM = 0.135  // 8L/100km × 1.70 €/L
export const COST_PEAGE_EUR_PER_KM = 0.05     // moyenne forfaitaire (très approximatif)

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

/** Distance Haversine brute (sans facteur route) — suffit pour comparer/ordonner. */
function rawDist(
  aLat: number, aLng: number, bLat: number, bLng: number,
): number {
  return calculateHaversineDistance(aLat, aLng, bLat, bLng)
}

/**
 * Choisit le PREMIER client de la séquence selon la règle métier de John :
 *  - CAS 1 (point de départ physique) : le client le PLUS LOIN du point de départ.
 *    La tournée finit alors naturellement près du départ.
 *  - CAS 2 (pas de départ physique) : le client en EXTRÉMITÉ, c'est-à-dire le plus
 *    éloigné du barycentre de tous les candidats (point « au bord », pas au milieu).
 */
function pickStartClient(
  candidates: TourneeClient[],
  anchor: { lat: number; lng: number },
  hasDeparturePoint: boolean,
): TourneeClient | null {
  if (candidates.length === 0) return null
  const reference = hasDeparturePoint
    ? anchor
    : (() => {
        const sumLat = candidates.reduce((s, c) => s + c.latitude, 0)
        const sumLng = candidates.reduce((s, c) => s + c.longitude, 0)
        return { lat: sumLat / candidates.length, lng: sumLng / candidates.length }
      })()
  let best: TourneeClient | null = null
  let bestDist = -1
  for (const c of candidates) {
    const d = rawDist(reference.lat, reference.lng, c.latitude, c.longitude)
    if (d > bestDist) { bestDist = d; best = c }
  }
  return best
}

const segDist = (a: TourneeClient, b: TourneeClient) =>
  rawDist(a.latitude, a.longitude, b.latitude, b.longitude)

/**
 * Recherche locale combinant 2-opt et Or-opt, exécutés EN ALTERNANCE
 * jusqu'à convergence (plus aucune amélioration), avec une borne d'itérations.
 *
 *  - 2-opt : inverse un sous-segment [i..k] pour décroiser le parcours.
 *  - Or-opt : déplace un segment consécutif de longueur 1, 2 ou 3 vers sa
 *    meilleure position ailleurs dans le parcours. C'est lui qui regroupe un
 *    cluster entier (ex. les 4 clients Le Havre) au bon endroit — chose que le
 *    2-opt seul ne sait pas faire quand le NN a « coincé » le cluster.
 *
 * `fixFirst` = true : l'index 0 (1er client = extrémité choisie par pickStartClient)
 *   est FIGÉ ; le reste est librement réordonné. Utilisé pour le parcours ouvert (CAS 2)
 *   et pour le pré-arrangement de la boucle (CAS 1, réorienté ensuite).
 *
 * `closedAnchor` : si fourni, on optimise la BOUCLE fermée (CAS 1, dépôt = anchor) ;
 *   sinon le parcours OUVERT (CAS 2). La métrique est Haversine pure (le facteur
 *   route ×1.3 est monotone et n'affecte pas l'ordre optimal).
 */
function localSearchImprove(
  tour: TourneeClient[],
  closedAnchor: { lat: number; lng: number } | null,
  fixFirst: boolean,
  maxIterations: number = 1000,
): TourneeClient[] {
  const n = tour.length
  if (n < 3) return tour.slice()
  const route = tour.slice()
  const firstMovable = fixFirst ? 1 : 0

  // Distance d'un point d'ancrage virtuel (avant route[0] ou après route[n-1])
  // en mode boucle fermée ; renvoie 0 en mode ouvert (pas d'arête extérieure).
  const anchorDist = (c: TourneeClient): number =>
    closedAnchor ? rawDist(closedAnchor.lat, closedAnchor.lng, c.latitude, c.longitude) : 0

  // ── 2-opt : inverse [i..k]. En mode ouvert, i>=1 si fixFirst (arête a=route[i-1]).
  //    En mode fermé, on autorise i=firstMovable avec un voisin gauche = anchor.
  const twoOptPass = (): boolean => {
    let improved = false
    const lo0 = closedAnchor ? firstMovable : Math.max(firstMovable, 1)
    for (let i = lo0; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        // voisin gauche de i
        const aDist = (c: TourneeClient) =>
          i === 0 ? anchorDist(c) : segDist(route[i - 1], c)
        // voisin droit de k
        const dRight = k + 1 < n ? route[k + 1] : null
        const dDist = (c: TourneeClient) =>
          dRight ? segDist(c, dRight) : anchorDist(c)
        const b = route[i], c = route[k]
        const before = aDist(b) + dDist(c)
        const after = aDist(c) + dDist(b)
        if (after + 1e-9 < before) {
          let l = i, h = k
          while (l < h) { const t = route[l]; route[l] = route[h]; route[h] = t; l++; h-- }
          improved = true
        }
      }
    }
    return improved
  }

  // ── Or-opt : retire le segment [s..s+L-1] et le réinsère ailleurs (meilleure place).
  const orOptPass = (): boolean => {
    let improved = false
    for (let L = 1; L <= 3; L++) {
      for (let s = firstMovable; s + L - 1 < n; s++) {
        const segStart = s, segEnd = s + L - 1
        const seg = route.slice(segStart, segEnd + 1)

        // voisins actuels du segment
        const prev = segStart === 0 ? null : route[segStart - 1]
        const next = segEnd + 1 < n ? route[segEnd + 1] : null
        const prevDist = prev ? segDist(prev, seg[0]) : anchorDist(seg[0])
        const nextDist = next ? segDist(seg[L - 1], next) : anchorDist(seg[L - 1])
        const bridge = prev && next ? segDist(prev, next)
          : prev ? anchorDist(prev)
          : next ? anchorDist(next)
          : 0
        const removalGain = prevDist + nextDist - bridge

        // route privée du segment
        const rest = route.slice(0, segStart).concat(route.slice(segEnd + 1))
        const m = rest.length

        let bestDelta = -1e-9 // exige une amélioration stricte
        let bestPos = -1
        let bestRev = false
        // positions d'insertion : entre rest[p-1] et rest[p], pour p de 0..m
        for (let p = 0; p <= m; p++) {
          // interdit de déplacer dans la zone figée (avant firstMovable)
          if (p < firstMovable) continue
          const left = p === 0 ? null : rest[p - 1]
          const right = p < m ? rest[p] : null
          const gapBase = left && right ? segDist(left, right)
            : left ? anchorDist(left)
            : right ? anchorDist(right)
            : 0
          for (const rev of [false, true]) {
            if (L === 1 && rev) continue
            const head = rev ? seg[L - 1] : seg[0]
            const tail = rev ? seg[0] : seg[L - 1]
            const addCost = (left ? segDist(left, head) : anchorDist(head))
              + (right ? segDist(tail, right) : anchorDist(tail))
              - gapBase
            const delta = removalGain - addCost
            if (delta > bestDelta) { bestDelta = delta; bestPos = p; bestRev = rev }
          }
        }

        if (bestPos >= 0 && bestDelta > 1e-9) {
          const insSeg = bestRev ? seg.slice().reverse() : seg
          rest.splice(bestPos, 0, ...insSeg)
          for (let q = 0; q < n; q++) route[q] = rest[q]
          improved = true
        }
      }
    }
    return improved
  }

  let iter = 0
  let improvedAny = true
  while (improvedAny && iter < maxIterations) {
    improvedAny = false
    iter++
    if (twoOptPass()) improvedAny = true
    if (orOptPass()) improvedAny = true
  }
  return route
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
 *
 * - `hasDeparturePoint` (défaut true) : si true, l'anchor est un vrai point physique
 *   (dépôt, adresse de départ saisie). On compte donc le trajet anchor→1er client.
 *   Si false, l'anchor est juste un point de référence virtuel (centroïde de zone /
 *   département / CP), sans réalité physique → on n'ajoute PAS le trajet anchor→1er.
 * - `includeReturnTrip` (défaut false) : si true, on ajoute le trajet final
 *   dernier client→anchor (retour dépôt). N'est applicable que si hasDeparturePoint=true.
 */
function computeTourDuration(
  clients: TourneeClient[],
  anchor: { lat: number; lng: number },
  includeReturnTrip: boolean = false,
  hasDeparturePoint: boolean = true,
): number {
  if (clients.length === 0) return 0

  let totalMinutes = 0

  // Trajet anchor → premier client : seulement s'il y a un vrai point de départ
  if (hasDeparturePoint) {
    const distToFirst = estimateRoadDistance(anchor.lat, anchor.lng, clients[0].latitude, clients[0].longitude)
    totalMinutes += estimateTravelTime(distToFirst)
  }

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

  // Trajet retour : seulement si vrai point de départ ET demandé
  if (includeReturnTrip && hasDeparturePoint) {
    const last = clients[clients.length - 1]
    const distReturn = estimateRoadDistance(last.latitude, last.longitude, anchor.lat, anchor.lng)
    totalMinutes += estimateTravelTime(distReturn)
  }

  return totalMinutes
}

// ─── Algorithme principal : nearest-neighbor pur depuis le point de départ ─

/**
 * Construit UNE tournée optimale par nearest-neighbor pur :
 *  1. Part du point de départ (anchor — dépôt OU client de référence)
 *  2. Ajoute le client le plus proche du point courant
 *  3. Depuis ce client, ajoute le plus proche restant
 *  4. Répète jusqu'à ce qu'aucun candidat ne respecte les contraintes
 *
 * Contraintes :
 *  - Capacité vélos max
 *  - Temps max entre 2 clients consécutifs (param user, défaut 30 min)
 *    → ne s'applique PAS au trajet anchor → 1er client (règle métier)
 *  - Budget temps total ≤ MAX_BUDGET_MINUTES (10h, hors retour dépôt)
 *
 * Modes :
 *  - forcedClientId  : démarre depuis ce client (mode "client de référence")
 *  - forcedClientIds : tous ces clients sont insérés en priorité par NN entre
 *                      eux, puis on continue à remplir avec les autres
 */
function buildOptimalTour(
  allClients: TourneeClient[],
  anchor: { lat: number; lng: number },
  capaciteVelos: number,
  budgetMinutes: number,
  maxTravelMinutes: number,
  forcedClientId?: string,
  forcedClientIds?: string[],
  hasDeparturePoint: boolean = true,
): TourneeClient[] {
  if (allClients.length === 0) return []

  const maxStepKm = maxStepKmFromMinutes(maxTravelMinutes)
  const used = new Set<string>()
  const tour: TourneeClient[] = []
  let totalBikes = 0
  let totalMinutes = 0
  let currentLat = anchor.lat
  let currentLng = anchor.lng

  /** Prend un client : update tour, used, totalBikes, totalMinutes, courant.
   *  Le trajet jusqu'au client est compté SEULEMENT si on a un vrai point
   *  de départ ou si on a déjà des clients dans la tournée. */
  const take = (c: TourneeClient) => {
    const stayMin = getTimeAtClient(getClientBikeCount(c))
    let travelMin = 0
    // 1er client + pas de point de départ physique → on ne compte pas le trajet
    if (tour.length > 0 || hasDeparturePoint) {
      const dist = estimateRoadDistance(currentLat, currentLng, c.latitude, c.longitude)
      travelMin = estimateTravelTime(dist)
    }
    tour.push(c)
    used.add(c.id)
    totalBikes += getClientBikeCount(c)
    totalMinutes += travelMin + stayMin
    currentLat = c.latitude
    currentLng = c.longitude
  }

  // ─── 1. Forced clients ──────────────────────────────────────────────
  // Mode "client de référence" : on commence depuis ce client (pas depuis l'anchor)
  if (forcedClientId) {
    const forced = allClients.find(c => c.id === forcedClientId)
    if (forced && totalBikes + getClientBikeCount(forced) <= capaciteVelos) {
      take(forced)
    }
  }

  // Mode "créneau" : tous les clients du créneau doivent être inclus
  // On les ordonne entre eux par NN depuis le point courant
  if (forcedClientIds && forcedClientIds.length > 0) {
    const remainingForced = forcedClientIds
      .map(id => allClients.find(c => c.id === id))
      .filter((c): c is TourneeClient => !!c && !used.has(c.id))
    while (remainingForced.length > 0) {
      let bestIdx = -1
      let bestDist = Infinity
      for (let i = 0; i < remainingForced.length; i++) {
        const c = remainingForced[i]
        if (totalBikes + getClientBikeCount(c) > capaciteVelos) continue
        const d = estimateRoadDistance(currentLat, currentLng, c.latitude, c.longitude)
        if (d < bestDist) { bestDist = d; bestIdx = i }
      }
      if (bestIdx === -1) break
      take(remainingForced.splice(bestIdx, 1)[0])
    }
  }

  // ─── 1bis. Choix du PREMIER client (si aucun forçage n'a déjà amorcé) ──
  // Règle métier John :
  //  - CAS 1 (départ physique) : démarrer par le client le PLUS LOIN du départ,
  //    pour que la tournée se termine naturellement près du départ.
  //  - CAS 2 (pas de départ) : démarrer par un client en extrémité (le plus loin
  //    du barycentre), pour ne pas amorcer au milieu et zigzaguer.
  // Sans ce choix, le remplissage NN ci-dessous prendrait le client le plus proche
  // de l'anchor → départ au centre → zigzag.
  if (tour.length === 0) {
    const startCandidates = allClients.filter(
      c => !used.has(c.id) && totalBikes + getClientBikeCount(c) <= capaciteVelos,
    )
    const start = pickStartClient(startCandidates, anchor, hasDeparturePoint)
    if (start) take(start)
  }

  // ─── 2. Remplissage par nearest-neighbor pur ────────────────────────
  while (totalBikes < capaciteVelos) {
    let bestClient: TourneeClient | null = null
    let bestDist = Infinity
    let bestTravelMin = 0
    let bestStayMin = 0

    for (const c of allClients) {
      if (used.has(c.id)) continue
      const bikes = getClientBikeCount(c)
      if (totalBikes + bikes > capaciteVelos) continue

      const dist = estimateRoadDistance(currentLat, currentLng, c.latitude, c.longitude)
      // Contrainte trajet inter-clients (ne s'applique pas si on n'a pas encore ajouté de client)
      if (tour.length > 0 && dist > maxStepKm) continue

      // Trajet anchor→1er client : compté seulement si point de départ physique
      const travelMin = (tour.length > 0 || hasDeparturePoint) ? estimateTravelTime(dist) : 0
      const stayMin = getTimeAtClient(bikes)

      // Contrainte budget temps (hors retour dépôt — celui-ci est ajouté côté stats)
      if (totalMinutes + travelMin + stayMin > budgetMinutes) continue

      if (dist < bestDist) {
        bestDist = dist
        bestClient = c
        bestTravelMin = travelMin
        bestStayMin = stayMin
      }
    }

    if (!bestClient) break
    tour.push(bestClient)
    used.add(bestClient.id)
    totalBikes += getClientBikeCount(bestClient)
    totalMinutes += bestTravelMin + bestStayMin
    currentLat = bestClient.latitude
    currentLng = bestClient.longitude
  }

  // ─── 3. Recherche locale 2-opt + Or-opt jusqu'à convergence ─────────
  // L'Or-opt déplace des clusters entiers (segments de 1 à 3 clients) vers leur
  // meilleure position : c'est lui qui évite qu'un cluster reste « échoué » loin
  // (ex. Le Havre coincé en bout de tournée par le NN). 2-opt décroise.
  // Aucun client n'est ajouté ni retiré → contraintes capacité/forçage préservées.
  if (tour.length < 3) return tour

  if (hasDeparturePoint) {
    // CAS 1 — départ physique (dépôt) : on minimise la BOUCLE fermée
    // anchor→…→anchor. Le 1er client n'est PAS figé pendant l'optim (la boucle
    // sera réorientée après). Puis règle métier : démarrer par le client le plus
    // loin du dépôt, finir près du dépôt.
    const optimized = localSearchImprove(tour, anchor, /*fixFirst*/ false)
    return orientLoopFromAnchor(optimized, anchor)
  }

  // CAS 2 — pas de départ physique : on minimise le PARCOURS OUVERT.
  // Le 1er client (extrémité choisie par pickStartClient) reste FIGÉ ; le reste
  // (y compris le dernier) est librement réordonné.
  return localSearchImprove(tour, null, /*fixFirst*/ true)
}

/**
 * Réoriente une boucle fermée (ordre cyclique déjà optimisé) en une séquence
 * linéaire respectant la règle métier : démarrer par le client le PLUS LOIN du
 * dépôt et terminer par un client PROCHE du dépôt. On choisit, parmi les n points
 * de départ possibles et les 2 sens de parcours, l'orientation qui maximise la
 * distance dépôt→1er tout en gardant la même boucle (donc même distance totale).
 *
 * En pratique : le 1er client = le plus loin du dépôt ; le sens est choisi pour
 * que le voisin de boucle le plus proche du dépôt soit placé en fin de séquence.
 */
function orientLoopFromAnchor(
  loop: TourneeClient[],
  anchor: { lat: number; lng: number },
): TourneeClient[] {
  const n = loop.length
  if (n < 2) return loop.slice()

  // Index du client le plus loin du dépôt → devient le 1er.
  let farIdx = 0
  let farDist = -1
  for (let i = 0; i < n; i++) {
    const d = rawDist(anchor.lat, anchor.lng, loop[i].latitude, loop[i].longitude)
    if (d > farDist) { farDist = d; farIdx = i }
  }

  // Deux séquences linéaires possibles à partir de farIdx (sens horaire / antihoraire),
  // en gardant l'ordre cyclique intact (la distance de boucle est inchangée).
  const forward: TourneeClient[] = []
  for (let k = 0; k < n; k++) forward.push(loop[(farIdx + k) % n])
  const backward: TourneeClient[] = []
  for (let k = 0; k < n; k++) backward.push(loop[(farIdx - k + n) % n])

  // On choisit le sens dont le DERNIER client est le plus proche du dépôt
  // (retour au dépôt le plus court → règle métier « finit près du départ »).
  const lastDist = (seq: TourneeClient[]) => {
    const last = seq[seq.length - 1]
    return rawDist(anchor.lat, anchor.lng, last.latitude, last.longitude)
  }
  return lastDist(forward) <= lastDist(backward) ? forward : backward
}

/**
 * Wrapper conservé pour rétrocompat de l'API existante.
 * Retourne un tableau d'1 seule simulation (la tournée optimale NN).
 */
export function generateSimulations(
  clients: TourneeClient[],
  anchor: { lat: number; lng: number },
  capaciteVelos: number,
  forcedClientId?: string,
  forcedClientIds?: string[],
  budgetMinutesOverride?: number,
  maxTravelMinutes: number = DEFAULT_MAX_TRAVEL_MINUTES,
  hasDeparturePoint: boolean = true,
): TourneeClient[][] {
  if (clients.length === 0) return []
  const budgetMinutes = budgetMinutesOverride ?? MAX_BUDGET_MINUTES
  const tour = buildOptimalTour(
    clients, anchor, capaciteVelos, budgetMinutes, maxTravelMinutes,
    forcedClientId, forcedClientIds, hasDeparturePoint,
  )
  return tour.length > 0 ? [tour] : []
}

// ─── Fonctions de compatibilité (appelées par l'API) ────────────────────

export function findOptimalClients(
  clients: TourneeClient[],
  anchor: { lat: number; lng: number },
  capaciteVelos: number,
  excludeIds: string[] = [],
  _simulationIndex: number = 0, // conservé pour rétrocompat API, non utilisé (1 seule sim)
  forcedClientId?: string,
  forcedClientIds?: string[],
  budgetMinutesOverride?: number,
  maxTravelMinutes: number = DEFAULT_MAX_TRAVEL_MINUTES,
  hasDeparturePoint: boolean = true,
): TourneeClient[] {
  const eligible = clients.filter(c => !excludeIds.includes(c.id))
  if (eligible.length === 0) return []

  const budgetMinutes = budgetMinutesOverride ?? MAX_BUDGET_MINUTES
  return buildOptimalTour(
    eligible, anchor, capaciteVelos, budgetMinutes, maxTravelMinutes,
    forcedClientId, forcedClientIds, hasDeparturePoint,
  )
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
  hasDeparturePoint: boolean = true,
): number {
  const tour = findOptimalClients(
    clients, anchor, capaciteVelos, excludeIds, 0,
    forcedClientId, forcedClientIds, budgetMinutesOverride, maxTravelMinutes, hasDeparturePoint,
  )
  return tour.length > 0 ? 1 : 0
}

// ─── Stats et distances ─────────────────────────────────────────────────

export function calculateTourStats(
  clients: TourneeClient[],
  anchor: { lat: number; lng: number },
  hasDeparturePoint: boolean = true,
): TourneeStats {
  if (clients.length === 0) {
    return { nbClients: 0, nbVelosTotal: 0, distanceTotaleKm: 0, dureeEstimeeMinutes: 0, dureeFormatted: '0h00' }
  }

  let distanceTotaleKm = 0

  // Trajet anchor → premier client (seulement si point de départ physique)
  if (hasDeparturePoint) {
    distanceTotaleKm += estimateRoadDistance(anchor.lat, anchor.lng, clients[0].latitude, clients[0].longitude)
  }

  for (let i = 0; i < clients.length; i++) {
    if (i < clients.length - 1) {
      distanceTotaleKm += estimateRoadDistance(
        clients[i].latitude, clients[i].longitude,
        clients[i + 1].latitude, clients[i + 1].longitude
      )
    }
  }

  // Retour au dépôt (dernier client → anchor) — inclus dans stats affichées
  // SEULEMENT si on a un vrai point de départ
  const last = clients[clients.length - 1]
  if (hasDeparturePoint) {
    distanceTotaleKm += estimateRoadDistance(last.latitude, last.longitude, anchor.lat, anchor.lng)
  }

  const dureeMinutes = computeTourDuration(clients, anchor, hasDeparturePoint, hasDeparturePoint)
  const nbVelosTotal = clients.reduce((sum, c) => sum + getClientBikeCount(c), 0)
  const hours = Math.floor(dureeMinutes / 60)
  const mins = Math.round(dureeMinutes % 60)

  // Retour dépôt en valeurs séparées (pour affichage UI) — uniquement si point de départ
  const retourDepotKm = hasDeparturePoint
    ? estimateRoadDistance(last.latitude, last.longitude, anchor.lat, anchor.lng)
    : 0
  const retourDepotMinutes = hasDeparturePoint ? estimateTravelTime(retourDepotKm) : 0

  // Estimation coûts (essence + péage) — utilitaire diesel, France approximatif
  const coutEssenceEur = distanceTotaleKm * COST_ESSENCE_EUR_PER_KM
  const coutPeageEur = distanceTotaleKm * COST_PEAGE_EUR_PER_KM
  const coutTotalEur = coutEssenceEur + coutPeageEur

  return {
    nbClients: clients.length,
    nbVelosTotal,
    distanceTotaleKm: Math.round(distanceTotaleKm * 10) / 10,
    dureeEstimeeMinutes: Math.round(dureeMinutes),
    dureeFormatted: `${hours}h${mins.toString().padStart(2, '0')}`,
    retourDepotKm: hasDeparturePoint ? Math.round(retourDepotKm * 10) / 10 : undefined,
    retourDepotMinutes: hasDeparturePoint ? Math.round(retourDepotMinutes) : undefined,
    coutEssenceEur: Math.round(coutEssenceEur * 100) / 100,
    coutPeageEur: Math.round(coutPeageEur * 100) / 100,
    coutTotalEur: Math.round(coutTotalEur * 100) / 100,
  }
}

export function calculateInterClientDistances(
  clients: TourneeClient[],
  anchor: { lat: number; lng: number },
  hasDeparturePoint: boolean = true,
): { distanceFromPrevKm: number; travelMinutesFromPrev: number }[] {
  return clients.map((client, i) => {
    if (i === 0) {
      // Pas de point de départ physique → on ne calcule pas le 1er trajet
      if (!hasDeparturePoint) {
        return { distanceFromPrevKm: 0, travelMinutesFromPrev: 0 }
      }
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
