// Test rapide du nouvel optimizer : barème par paliers + retour dépôt + maxTravelMinutes
import * as opt from '../src/lib/tournees/optimizer.ts'
const {
  getTimeAtClient,
  getClientBikeCount,
  findOptimalClients,
  countClusters,
  calculateTourStats,
  DEFAULT_MAX_TRAVEL_MINUTES,
} = opt

let pass = 0
let fail = 0
const check = (label, expected, actual) => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual)
  if (ok) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`) }
}

console.log('\n=== 1. Barème temps chez le client (par paliers) ===')
check('1 vélo  → 15 min', 15, getTimeAtClient(1))
check('0 vélos → 15 min (clamp)', 15, getTimeAtClient(0))
check('2 vélos → 20 min', 20, getTimeAtClient(2))
check('3 vélos → 20 min', 20, getTimeAtClient(3))
check('4 vélos → 25 min', 25, getTimeAtClient(4))
check('5 vélos → 25 min', 25, getTimeAtClient(5))
check('6 vélos → 30 min', 30, getTimeAtClient(6))
check('7 vélos → 30 min', 30, getTimeAtClient(7))
check('8 vélos → 35 min', 35, getTimeAtClient(8))
check('9 vélos → 35 min', 35, getTimeAtClient(9))
check('10 vélos → 40 min', 40, getTimeAtClient(10))
check('15 vélos → 50 min (25 + ceil(10/2)*5)', 50, getTimeAtClient(15))

console.log('\n=== 2. Default maxTravelMinutes ===')
check('DEFAULT_MAX_TRAVEL_MINUTES = 30', 30, DEFAULT_MAX_TRAVEL_MINUTES)

console.log('\n=== 3. Algo end-to-end avec mock clients ===')
// 4 clients alignés sur un axe nord-sud, anchor au sud
// Distances Haversine ~5 km entre chaque (×1.3 = 6.5 km route → ~13 min de trajet)
const anchor = { lat: 48.85, lng: 2.35 }
const clients = [
  { id: 'A', raison_sociale: 'A', latitude: 48.86, longitude: 2.35, departement: '75',
    adresse_livraison_ville: null, adresse_livraison_ligne1: null, adresse_livraison_cp: null,
    velo_devis: 1, velo_valide: 1, statut_commercial: 'a_livrer', telephone: null, email: null, depot_logistique_id: null },
  { id: 'B', raison_sociale: 'B', latitude: 48.91, longitude: 2.35, departement: '75',
    adresse_livraison_ville: null, adresse_livraison_ligne1: null, adresse_livraison_cp: null,
    velo_devis: 2, velo_valide: 2, statut_commercial: 'a_livrer', telephone: null, email: null, depot_logistique_id: null },
  { id: 'C', raison_sociale: 'C', latitude: 48.96, longitude: 2.35, departement: '75',
    adresse_livraison_ville: null, adresse_livraison_ligne1: null, adresse_livraison_cp: null,
    velo_devis: 3, velo_valide: 3, statut_commercial: 'a_livrer', telephone: null, email: null, depot_logistique_id: null },
  { id: 'D', raison_sociale: 'D', latitude: 49.00, longitude: 2.35, departement: '75',
    adresse_livraison_ville: null, adresse_livraison_ligne1: null, adresse_livraison_cp: null,
    velo_devis: 1, velo_valide: 1, statut_commercial: 'a_livrer', telephone: null, email: null, depot_logistique_id: null },
]

// Capacité 10 → tout doit rentrer (1+2+3+1 = 7 vélos)
const tour = findOptimalClients(clients, anchor, 10)
console.log(`  Ordre tournée : ${tour.map(c => c.id).join(' → ')}`)
check('4 clients dans la tournée', 4, tour.length)
check('Total = 7 vélos', 7, tour.reduce((s, c) => s + getClientBikeCount(c), 0))

const stats = calculateTourStats(tour, anchor)
console.log(`  Stats : ${stats.dureeFormatted} / ${stats.distanceTotaleKm} km / retour ${stats.retourDepotKm} km / ${stats.retourDepotMinutes} min`)
check('retourDepotKm défini (>0)', true, stats.retourDepotKm != null && stats.retourDepotKm > 0)
check('retourDepotMinutes défini (>0)', true, stats.retourDepotMinutes != null && stats.retourDepotMinutes > 0)

// Test contrainte maxTravelMinutes (nouveau algo NN pur)
console.log('\n=== 4. Contrainte maxTravelMinutes (algo NN pur depuis anchor) ===')
// Avec 10 min, le 1er client (A à 1.1 km / ~3 min) passe car pas de contrainte sur 1er trajet
// Mais B est à ~6.5 km / ~13 min de A → > 10 min → s'arrête à A
const tourSerre = findOptimalClients(clients, anchor, 10, [], 0, undefined, undefined, undefined, 10)
console.log(`  maxTravelMinutes=10 (serré) → ordre: ${tourSerre.map(c => c.id).join(' → ')}`)
check('maxTravelMinutes=10 → 1 seul client (le plus proche, A)', 1, tourSerre.length)
check('maxTravelMinutes=10 → c\'est bien A (le plus proche de l\'anchor)', 'A', tourSerre[0]?.id)

// Avec 30 min (default), tout passe
const tourLarge = findOptimalClients(clients, anchor, 10, [], 0, undefined, undefined, undefined, 30)
check('Avec maxTravelMinutes=30, 4 clients', 4, tourLarge.length)
check('Ordre A→B→C→D (NN depuis anchor)', 'A→B→C→D', tourLarge.map(c => c.id).join('→'))

// Mode client forcé : démarre depuis B, pas A. NN depuis B.
const tourForced = findOptimalClients(clients, anchor, 10, [], 0, 'B', undefined, undefined, 30)
console.log(`  Mode client forcé B → ordre: ${tourForced.map(c => c.id).join(' → ')}`)
check('Forced=B, capacité 10 → contient B', true, tourForced.some(c => c.id === 'B'))
check('Forced=B, B est en 1er', 'B', tourForced[0]?.id)

console.log('\n=== 5. countClusters retourne 0 ou 1 (1 simulation unique) ===')
const nClusters30 = countClusters(clients, anchor, 10, [], undefined, undefined, undefined, 30)
const nClusters10 = countClusters(clients, anchor, 10, [], undefined, undefined, undefined, 10)
console.log(`  clusters @30min = ${nClusters30}, @10min = ${nClusters10}`)
check('clusters @30min = 1 (au moins 1 client trouvé)', 1, nClusters30)
check('clusters @10min = 1 (le 1er trajet ignore la contrainte)', 1, nClusters10)

console.log('\n=== 6. Compacité — l\'algo prend les proches en priorité (le bug que John signalait) ===')
// Mock : 3 clients très proches du dépôt + 1 client lointain
// Le NN doit prendre les 3 proches d'abord, pas sauter au lointain
const anchorParis = { lat: 48.86, lng: 2.35 }
const clientsCompact = [
  { id: 'P1', raison_sociale: 'P1', latitude: 48.87, longitude: 2.36, departement: '75',
    adresse_livraison_ville: null, adresse_livraison_ligne1: null, adresse_livraison_cp: null,
    velo_devis: 1, velo_valide: 1, statut_commercial: 'a_livrer', telephone: null, email: null, depot_logistique_id: null },
  { id: 'P2', raison_sociale: 'P2', latitude: 48.88, longitude: 2.36, departement: '75',
    adresse_livraison_ville: null, adresse_livraison_ligne1: null, adresse_livraison_cp: null,
    velo_devis: 1, velo_valide: 1, statut_commercial: 'a_livrer', telephone: null, email: null, depot_logistique_id: null },
  { id: 'P3', raison_sociale: 'P3', latitude: 48.89, longitude: 2.36, departement: '75',
    adresse_livraison_ville: null, adresse_livraison_ligne1: null, adresse_livraison_cp: null,
    velo_devis: 1, velo_valide: 1, statut_commercial: 'a_livrer', telephone: null, email: null, depot_logistique_id: null },
  { id: 'LOIN', raison_sociale: 'LOIN', latitude: 48.95, longitude: 2.50, departement: '75',
    adresse_livraison_ville: null, adresse_livraison_ligne1: null, adresse_livraison_cp: null,
    velo_devis: 1, velo_valide: 1, statut_commercial: 'a_livrer', telephone: null, email: null, depot_logistique_id: null },
]
const tourCompact = findOptimalClients(clientsCompact, anchorParis, 10, [], 0, undefined, undefined, undefined, 30)
console.log(`  Ordre tournée compact : ${tourCompact.map(c => c.id).join(' → ')}`)
check('Démarre par P1 (le plus proche du dépôt)', 'P1', tourCompact[0]?.id)
check('P2 en 2ᵉ (plus proche de P1)', 'P2', tourCompact[1]?.id)
check('P3 en 3ᵉ (plus proche de P2)', 'P3', tourCompact[2]?.id)
// LOIN doit être EXCLU car > 30 min trajet depuis P3 — c'est exactement le bug que John signalait
check('LOIN exclu : algo respecte la contrainte 30 min', false, tourCompact.some(c => c.id === 'LOIN'))

// Avec maxTravelMinutes=60, LOIN devrait passer en dernier (et seulement après les proches)
const tourLarge2 = findOptimalClients(clientsCompact, anchorParis, 10, [], 0, undefined, undefined, undefined, 60)
console.log(`  Avec maxTravelMinutes=60 → ${tourLarge2.map(c => c.id).join(' → ')}`)
check('Avec 60 min, LOIN inclus mais en DERNIER', 'LOIN', tourLarge2[tourLarge2.length - 1]?.id)
check('Avec 60 min, P1 toujours en 1er (compacité préservée)', 'P1', tourLarge2[0]?.id)

console.log(`\n=== Résultat : ${pass} pass / ${fail} fail ===`)
process.exit(fail > 0 ? 1 : 0)
