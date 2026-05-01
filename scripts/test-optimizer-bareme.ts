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

// Test contrainte maxTravelMinutes
console.log('\n=== 4. Contrainte maxTravelMinutes ===')
const tourSerre = findOptimalClients(clients, anchor, 10, [], 0, undefined, undefined, undefined, 10)
console.log(`  maxTravelMinutes=10 (serré) → ${tourSerre.length} client(s) — algo rejette tournées <2 clients`)
check('maxTravelMinutes=10 trop serré → 0 client (filtre length>=2)', 0, tourSerre.length)

// Avec 30 min (default), tout passe
const tourLarge = findOptimalClients(clients, anchor, 10, [], 0, undefined, undefined, undefined, 30)
check('Avec maxTravelMinutes=30, 4 clients', 4, tourLarge.length)

// Avec client forcé (mode "client" du UI), contrainte serrée → 1 client (le forcé)
const tourForced = findOptimalClients(clients, anchor, 10, [], 0, 'A', undefined, undefined, 10)
check('Mode client forcé + maxTravelMinutes=10 → 1 client', 1, tourForced.length)

console.log('\n=== 5. countClusters propage maxTravelMinutes ===')
const nClusters30 = countClusters(clients, anchor, 10, [], undefined, undefined, undefined, 30)
const nClusters10 = countClusters(clients, anchor, 10, [], undefined, undefined, undefined, 10)
console.log(`  clusters @30min = ${nClusters30}, @10min = ${nClusters10}`)
check('clusters @10min ≤ @30min (contrainte serre les options)', true, nClusters10 <= nClusters30)

console.log(`\n=== Résultat : ${pass} pass / ${fail} fail ===`)
process.exit(fail > 0 ? 1 : 0)
