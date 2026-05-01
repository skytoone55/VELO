#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '..', '.env.ppe.local'), 'utf8')
    .split('\n').filter(l => l.trim() && !l.startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      if (i < 0) return null
      let v = l.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      return [l.slice(0, i).trim(), v]
    }).filter(Boolean)
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: cl } = await supabase.from('clients').select('id, raison_sociale').ilike('raison_sociale', 'TEST LIVREUR%')
console.log(`🔎 ${cl?.length ?? 0} client(s) "TEST LIVREUR" :`)
for (const c of cl || []) console.log(`   - ${c.raison_sociale} (${c.id})`)
if (!cl || cl.length === 0) process.exit(0)
const ids = cl.map(c => c.id)

// ⚠️ NE JAMAIS inclure 'fnuci' dans cette liste : ce sont les étiquettes physiques
// des vélos. Il faut les DÉSASSOCIER (statut='disponible', client_id=NULL) pas les supprimer.
const tables = ['livraisons', 'formulaires_log', 'workflow_transitions', 'enemat_history', 'clients_hors_zone', 'data_clients', 'webhook_logs']
for (const t of tables) {
  try {
    const { error, count } = await supabase.from(t).delete({ count: 'exact' }).in('client_id', ids)
    if (!error && count) console.log(`   ✅ ${t}: ${count} supprimée(s)`)
  } catch {}
}

// FNUCI : désassocier au lieu de supprimer (étiquettes physiques)
const { data: fnuciAssoc } = await supabase.from('fnuci').select('id, numero').in('client_id', ids)
if (fnuciAssoc && fnuciAssoc.length > 0) {
  const { error } = await supabase.from('fnuci').update({
    statut: 'disponible', client_id: null, livraison_id: null, attribue_at: null, distribue_at: null,
  }).in('client_id', ids)
  if (!error) console.log(`   ✅ fnuci: ${fnuciAssoc.length} désassocié(s) (numéros ${fnuciAssoc.map(f => f.numero).join(', ')})`)
}

const { error: errCl } = await supabase.from('clients').delete().in('id', ids)
if (errCl) { console.error('❌', errCl.message); process.exit(1) }
console.log(`✅ ${ids.length} client(s) supprimé(s)`)
