#!/usr/bin/env node
/**
 * Cleanup des clients "SMT - COPIE %" en base PPE.
 *
 * Mode DRY-RUN par défaut (preview seulement).
 * Pour exécuter pour de vrai : node scripts/cleanup-smt-copies-ppe.mjs --go
 *
 * Charge les credentials depuis .env.ppe.local (NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY) — base PPE = zfpzhhdovxllchlsihcr.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = resolve(__dirname, '..', '.env.ppe.local')

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => {
      const i = line.indexOf('=')
      if (i < 0) return null
      const key = line.slice(0, i).trim()
      let val = line.slice(i + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      return [key, val]
    })
    .filter(Boolean)
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY dans .env.ppe.local')
  process.exit(1)
}

const GO = process.argv.includes('--go')
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

console.log(`\n🔌 Connexion : ${SUPABASE_URL}`)
console.log(`🚦 Mode : ${GO ? 'EXÉCUTION RÉELLE' : 'DRY-RUN (preview seulement)'}\n`)

// 1) Liste les SMT - COPIE
const patterns = ['SMT - COPIE%', 'SMT-COPIE%', 'SMT  COPIE%', 'SMT COPIE%']
let allClients = []
for (const p of patterns) {
  const { data, error } = await supabase
    .from('clients')
    .select('id, raison_sociale, statut_commercial, in_enemat, monday_board_id, created_at')
    .ilike('raison_sociale', p)
  if (error) { console.error('Erreur fetch:', error.message); process.exit(1) }
  allClients = allClients.concat(data || [])
}
// Déduplique
const seen = new Set()
allClients = allClients.filter(c => seen.has(c.id) ? false : (seen.add(c.id), true))
allClients.sort((a, b) => a.raison_sociale.localeCompare(b.raison_sociale))

console.log(`🔎 Trouvé : ${allClients.length} client(s) "SMT - COPIE..."`)
if (allClients.length === 0) {
  console.log('Rien à supprimer. Fin.')
  process.exit(0)
}
for (const c of allClients) {
  console.log(`  - ${c.raison_sociale} (id=${c.id}, statut=${c.statut_commercial}, enemat=${c.in_enemat})`)
}

// 2) Vérifier dépendances : livraisons
const ids = allClients.map(c => c.id)
const { data: livraisons } = await supabase
  .from('livraisons')
  .select('id, client_id, statut, tournee_id')
  .in('client_id', ids)
console.log(`\n🔗 Livraisons liées : ${livraisons?.length ?? 0}`)
if (livraisons && livraisons.length > 0) {
  const byStatut = {}
  for (const l of livraisons) byStatut[l.statut] = (byStatut[l.statut] ?? 0) + 1
  for (const [s, n] of Object.entries(byStatut)) console.log(`  - ${s}: ${n}`)
}

// 3) Autres dépendances (⚠️ JAMAIS 'fnuci' : étiquettes physiques, désassocier pas supprimer)
const otherTables = ['workflow_transitions', 'formulaires_log', 'enemat_history', 'clients_hors_zone', 'data_clients', 'webhook_logs']
const depCounts = {}
for (const t of otherTables) {
  try {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true }).in('client_id', ids)
    if (count) depCounts[t] = count
  } catch {}
}
if (Object.keys(depCounts).length > 0) {
  console.log(`\n🔗 Autres dépendances :`)
  for (const [t, n] of Object.entries(depCounts)) console.log(`  - ${t}: ${n}`)
}

if (!GO) {
  console.log('\n💡 Pour exécuter pour de vrai : node scripts/cleanup-smt-copies-ppe.mjs --go')
  process.exit(0)
}

// 4) DELETE — supprime livraisons puis dépendances puis clients
console.log('\n🗑️  Suppression…')

// Supprimer livraisons (cascade par client_id)
if (livraisons && livraisons.length > 0) {
  const { error } = await supabase.from('livraisons').delete().in('client_id', ids)
  if (error) { console.error('Erreur delete livraisons:', error.message); process.exit(1) }
  console.log(`  ✅ ${livraisons.length} livraison(s) supprimée(s)`)
}

// Supprimer entrées dans tables avec FK client_id
for (const t of otherTables) {
  if (!depCounts[t]) continue
  const { error } = await supabase.from(t).delete().in('client_id', ids)
  if (error) { console.error(`Erreur delete ${t}:`, error.message) }
  else console.log(`  ✅ ${t}: ${depCounts[t]} ligne(s) supprimée(s)`)
}

// FNUCI : désassocier (étiquettes physiques, ne JAMAIS supprimer)
const { data: fnuciAssoc } = await supabase.from('fnuci').select('id, numero').in('client_id', ids)
if (fnuciAssoc && fnuciAssoc.length > 0) {
  const { error } = await supabase.from('fnuci').update({
    statut: 'disponible', client_id: null, livraison_id: null, attribue_at: null, distribue_at: null,
  }).in('client_id', ids)
  if (!error) console.log(`  ✅ fnuci: ${fnuciAssoc.length} désassocié(s) (numéros ${fnuciAssoc.map(f => f.numero).join(', ')})`)
}

// Supprimer les clients
const { error: errCl } = await supabase.from('clients').delete().in('id', ids)
if (errCl) { console.error('Erreur delete clients:', errCl.message); process.exit(1) }
console.log(`  ✅ ${ids.length} client(s) "SMT - COPIE" supprimé(s)`)

console.log('\n✨ Terminé.')
