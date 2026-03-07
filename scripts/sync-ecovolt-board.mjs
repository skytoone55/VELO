#!/usr/bin/env node
/**
 * Sync Ecovolt Monday board → Ecovolt Supabase
 * Board: 9990833105 (Velos Cargos General)
 * Usage: node scripts/sync-ecovolt-board.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://irpnllwlxivlylclfjwd.supabase.co'
const SUPABASE_SERVICE_KEY = 'REDACTED_SERVICE_ROLE_KEY'
const MONDAY_API_KEY = 'REDACTED_MONDAY_API_KEY'
const MONDAY_API_URL = 'https://api.monday.com/v2'
const BOARD_ID = '9990833105'
const BATCH_SIZE = 100

// Same column IDs as PPE boards (shared Monday template)
const COLUMN_MAPPING = {
  'name': 'raison_sociale',
  'text_mkvfykn9': 'siret',
  'text_mkvfxbkp': 'reference_dossier',
  'pulse_id_mkvc9y13': 'monday_item_id',
  'email_mkvfk63f': 'email',
  'email_mkvfnv4q': 'email_beneficiaire',
  'long_text_mkvn5k9w': 'telephone',
  'text_mkvfkr8t': 'contact_nom',
  'text_mkvfjqvv': 'contact_prenom',
  'text_mkvfetg2': 'adresse_societe_ligne1',
  'text_mkvfhcn9': 'adresse_societe_cp',
  'text_mkvfgh8t': 'adresse_societe_ville',
  'text_mkzvhvmd': 'adresse_livraison_ligne1',
  'text_mkzvrj8d': 'adresse_livraison_ligne2',
  'text_mkzvp1ea': 'adresse_livraison_cp',
  'text_mkzvhaed': 'adresse_livraison_ville',
  'text_mkvtxy4q': 'format_juridique',
  'text_mkvft2w3': 'code_ape',
  'numeric_mkvcqwxn': 'nb_salaries',
  'color_mkvdkzxh': 'departement',
  'numeric_mkvfghjq': 'velo_devis',
  'numeric_mkvcqm0r': 'velo_valide',
  'text_mkvf8zp6': 'numero_devis',
  'text_mkvfqsxv': 'devis_pdf_url',
  'date_mkvfqvv1': 'date_signature_devis',
  'date_mkvsxn5j': 'date_statut',
  'text_mkzvqk4s': 'code_enemat_saisi',
  'color_mkvfws5n': 'statut_commercial',
  'color_mkvgsswc': 'statut_retina',
  'color_mkyqn153': 'statut_mail',
  'color_mkvp4dmz': 'statut_anomalie',
  'color_mkvdek2g': 'statut_make',
  'color_mkvn1kg0': 'statut_doublon',
  'multiple_person_mkvd4axb': 'commercial_assigne',
  'multiple_person_mkve97pm': 'equipe_ids',
}

const STATUT_COMMERCIAL_MAP = {
  'DOSSIER COMPLET': 'dossier_complet',
  'DEVIS SIGNÉ': 'devis_signe',
  'CLIENT HS': 'client_hs',
  'DEVIS CREE': 'devis_cree',
  'CONTROLE VALIDÉ': 'controle_valide',
  'Inconnu': 'inconnu',
  'CLIENT INJOIGNABLE': 'client_injoignable',
  'DOUBLON': 'doublon',
  'CONTROLE A REGULARISER': 'controle_a_regulariser',
  'AH SIGNÉE': 'ah_signee',
  'LIVRÉ': 'livre',
  'PAYÈ': 'paye',
  'CONTROLE A JOUR': 'controle_a_jour',
  'CLIENT CONTACTÉ': 'client_contacte',
  'FRANCK': 'franck',
  'CODE ENVOYÉ': 'code_envoye',
  'FORMULAIRE ENVOYÉ': 'formulaire_envoye',
  'FORMULAIRE VALIDÉ': 'formulaire_valide',
}

const DEPARTEMENT_MAP = {
  'Réunion': '974', 'La Réunion': '974', 'Martinique': '972',
  'Guadeloupe': '971', 'Guyane': '973', 'Mayotte': '976', 'Hors DOM': 'hors_dom',
}

const STATUT_RETINA_MAP = { 'DEVIS CRÉÉ': 'devis_cree', 'DEVIS SIGNÉ': 'devis_signe', 'SUPPRIMÉ': 'supprime' }
const STATUT_MAIL_MAP = { 'mail 2': 'mail_2', 'Mail FNUCI': 'mail_fnuci', 'Mail 3': 'mail_3' }
const STATUT_ANOMALIE_MAP = {
  'En cours': 'en_cours', 'Fait': 'fait', 'Bloqué': 'bloque',
  'bonification soumise au pncee': 'bonification_pncee', '#REF!': 'ref_error',
  '#N/A': 'na_error', 'sans bonification': 'sans_bonification', 'Supprimé de RETINA': 'supprime_retina',
}
const STATUT_DOUBLON_MAP = {
  'DOUBLON A ETUDIER': 'a_etudier', 'DOUBLON A SUPPRIMER': 'a_supprimer',
  'OK - AUTRE DOUBLON SUPPRIME': 'ok_autre_supprime',
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function extractColumnValue(col) {
  if (col.id?.startsWith('boolean_') || col.id?.startsWith('checkbox_')) {
    if (col.value) { try { const p = JSON.parse(col.value); if (typeof p.checked === 'boolean') return p.checked } catch {} }
    return col.text === 'v' || col.text === 'true'
  }
  if (col.text !== null && col.text !== undefined && col.text !== '') return col.text
  if (col.value) {
    try {
      const p = JSON.parse(col.value)
      if (typeof p.checked === 'boolean') return p.checked
      if (p.email) return p.email
      if (p.phone) return p.phone
      if (p.date) return p.date
      if (p.label?.text) return p.label.text
      if (typeof p === 'number') return p
      if (p.text) return p.text
      return p
    } catch { return col.value }
  }
  return null
}

function extractPeopleIds(col) {
  if (!col.value) return null
  try {
    const p = JSON.parse(col.value)
    if (p.personsAndTeams && Array.isArray(p.personsAndTeams)) {
      const ids = p.personsAndTeams.filter(x => x.kind === 'person').map(x => x.id.toString())
      return ids.length > 0 ? ids.join(',') : null
    }
  } catch {}
  return col.text || null
}

function convertValue(columnId, value) {
  switch (columnId) {
    case 'color_mkvfws5n': return STATUT_COMMERCIAL_MAP[value] || value
    case 'color_mkvdkzxh': return DEPARTEMENT_MAP[value] || value
    case 'color_mkvgsswc': return STATUT_RETINA_MAP[value] || value
    case 'color_mkyqn153': return STATUT_MAIL_MAP[value] || value
    case 'color_mkvp4dmz': return STATUT_ANOMALIE_MAP[value] || value
    case 'color_mkvn1kg0': return STATUT_DOUBLON_MAP[value] || value
    default: return value
  }
}

function mapItem(item) {
  const client = { raison_sociale: item.name }
  for (const col of item.column_values || []) {
    const field = COLUMN_MAPPING[col.id]
    if (!field) continue
    let value = extractColumnValue(col)
    if (value === null || value === undefined || value === '') continue
    value = convertValue(col.id, value)
    if (col.id?.startsWith('multiple_person_') || col.id?.startsWith('people_')) value = extractPeopleIds(col)
    if (['velo_valide', 'velo_devis', 'nb_salaries'].includes(field)) {
      const n = parseFloat(value); if (!isNaN(n)) value = Math.floor(n)
    }
    if (col.id?.startsWith('numeric_') && typeof value === 'string' && value.includes('.')) {
      const n = parseFloat(value); if (!isNaN(n)) value = Math.floor(n)
    }
    client[field] = value
  }
  return client
}

async function main() {
  console.log(`Sync Ecovolt board ${BOARD_ID} -> Supabase`)
  let cursor = null, hasMore = true
  let created = 0, errors = 0, processed = 0
  const startTime = Date.now()

  while (hasMore) {
    const q = `query { boards(ids: [${BOARD_ID}]) { items_page(limit: ${BATCH_SIZE}${cursor ? `, cursor: "${cursor}"` : ''}) { cursor items { id name column_values { id text value } } } } }`
    const res = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: MONDAY_API_KEY },
      body: JSON.stringify({ query: q }),
    })
    const data = await res.json()
    if (data.errors) { console.error('Monday API error:', data.errors); break }
    const page = data.data?.boards?.[0]?.items_page
    const items = page?.items || []
    cursor = page?.cursor || null
    hasMore = !!cursor && items.length > 0

    // Batch insert
    const batch = []
    for (const item of items) {
      processed++
      const clientData = mapItem(item)
      clientData.monday_item_id = parseInt(item.id)
      clientData.monday_synced_at = new Date().toISOString()
      clientData.monday_sync_status = 'synced'
      clientData.created_at = new Date().toISOString()
      clientData.updated_at = new Date().toISOString()
      batch.push(clientData)
    }

    if (batch.length > 0) {
      const { error } = await supabase.from('clients').insert(batch)
      if (error) {
        console.error(`Batch insert error at ${processed}:`, error.message)
        // Fallback: insert one by one
        for (const c of batch) {
          const { error: e2 } = await supabase.from('clients').insert(c)
          if (e2) { errors++; console.error(`  Item ${c.monday_item_id}: ${e2.message}`) }
          else created++
        }
      } else {
        created += batch.length
      }
    }

    process.stdout.write(`  ${processed} processed, ${created} created, ${errors} errors\r`)
    if (hasMore) await new Promise(r => setTimeout(r, 200))
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  // Log sync
  await supabase.from('sync_monday_log').insert({
    action: 'sync_batch', direction: 'monday_to_supabase',
    statut: errors === 0 ? 'success' : 'partial',
    donnees_apres: { itemsProcessed: processed, itemsCreated: created, errors, duration: `${elapsed}s`, board: BOARD_ID, source: 'sync-ecovolt-board.mjs' },
  })

  const { count } = await supabase.from('clients').select('id', { count: 'exact', head: true })
  console.log(`\nDone in ${elapsed}s: ${processed} processed, ${created} created, ${errors} errors`)
  console.log(`Clients in Supabase: ${count}`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
