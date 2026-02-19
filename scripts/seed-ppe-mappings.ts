/**
 * Script: Seed PPE Énergie per-board mappings into Supabase
 *
 * Usage:
 *   npx tsx scripts/seed-ppe-mappings.ts
 *
 * Pre-requisites:
 *   1. Copy .env.ppe.local → .env.local (or set env vars)
 *   2. Run the migration SQL on PPE Supabase first (see below)
 *
 * This script populates the `monday_field_mapping` table with one row
 * per (interface_field, board_id) for each of the 7 PPE boards.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.ppe.local
dotenv.config({ path: path.resolve(__dirname, '../.env.ppe.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SERVICE_ROLE_KEY. Check .env.ppe.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ===================================================================
// PPE Board IDs
// ===================================================================
const BOARDS = {
  ATHOME:   '2144986053',
  STELLARS: '5001072451',
  EKL:      '2140187165',
  JM:       '2137662048',
  SALIH:    '5013455904',
  ALEX:     '5002798369',
  DIZIEN:   '2146667697',
} as const

type BoardName = keyof typeof BOARDS

// ===================================================================
// Per-board column ID mappings
// For fields with IDENTICAL IDs across all boards, we use a shared value
// For fields with VARYING IDs, we specify per-board
// ===================================================================

// Fields with SAME column ID across all 7 boards
const COMMON_COLUMNS: Record<string, string> = {
  raison_sociale:          'name',
  contact_nom:             'text_mkvj39h',       // NOM
  adresse_societe_ligne1:  'text_mkvj6f51',      // ADRESSE
  adresse_societe_cp:      'numeric_mkvjbazm',   // CP
  adresse_societe_ville:   'text_mkvjgcp9',      // VILLE
  nb_salaries:             'numeric_mkvjefda',    // NB SALARIE
  velo_devis:              'numeric_mkvj879j',    // VELO VOULU → velo_devis (vélos demandés)
  velo_valide:             'numeric_mkvj6e60',    // VELO VALIDE → velo_valide (vélos validés)
  statut_commercial:       'status',              // Statut (status column)
}

// Fields with DIFFERENT column IDs per board
const VARYING_COLUMNS: Record<string, Record<BoardName, string>> = {
  siret: {
    ATHOME:   'text_mkvqtq36',
    STELLARS: 'text_mkvq3yka',
    EKL:      'numeric_mkvjym8v',   // ⚠️ numbers type on EKL
    JM:       'text_mkvq7s',
    SALIH:    'text_mkvq3yka',
    ALEX:     'text_mkvq3yka',
    DIZIEN:   'text_mkvq3yka',
  },
  reference_dossier: {  // RETINA
    ATHOME:   'text_mkvm2hb5',
    STELLARS: 'text_mkvmgppx',
    EKL:      'text_mkvmsyz1',
    JM:       'text_mkvm7z5h',
    SALIH:    'text_mkvmgppx',
    ALEX:     'text_mkvmgppx',
    DIZIEN:   'text_mkvmgppx',
  },
  numero_devis: {  // LIENS DEVIS
    ATHOME:   'text_mkvnsxfm',
    STELLARS: 'text_mkvncce0',
    EKL:      'text_mkvyeyzs',     // LIEN RETINA (pas de LIENS DEVIS sur EKL)
    JM:       'text_mkvqhr0c',
    SALIH:    'text_mkvncce0',
    ALEX:     'text_mkvncce0',
    DIZIEN:   'text_mkvncce0',
  },
  // E-mail = email_beneficiaire pour PPE (c'est l'email client, pas agent)
  email_beneficiaire: {
    ATHOME:   'email_mkvjx3jr',
    STELLARS: 'email_mkw56r94',
    EKL:      'email_mkvjx3jr',
    JM:       'email_mkvjx3jr',
    SALIH:    'email_mkvjx3jr',
    ALEX:     'email_mkvjx3jr',
    DIZIEN:   'email_mkvjx3jr',
  },
  telephone: {  // TEL
    ATHOME:   'phone_mkvjhbnt',
    STELLARS: 'phone_mkw5e4p2',
    EKL:      'phone_mkvjhbnt',
    JM:       'phone_mkvjhbnt',
    SALIH:    'phone_mkvjhbnt',
    ALEX:     'phone_mkvjhbnt',
    DIZIEN:   'phone_mkvjhbnt',
  },
  contact_prenom: {  // PRENOM
    ATHOME:   'text_mkvje9qa',
    STELLARS: 'text_mkw6q1vb',
    EKL:      'text_mkvje9qa',
    JM:       'text_mkvje9qa',
    SALIH:    'text_mkvje9qa',
    ALEX:     'text_mkvje9qa',
    DIZIEN:   'text_mkvje9qa',
  },
  code_ape: {  // NAF
    ATHOME:   'text_mkvkhf8p',
    STELLARS: 'text_mkvk64jp',
    EKL:      'text_mkvks2a4',
    JM:       'text_mkvkj1mb',
    SALIH:    'text_mkvk64jp',
    ALEX:     'text_mkvk64jp',
    DIZIEN:   'text_mkvk64jp',
  },
  // Newly created columns (session précédente) — all have DIFFERENT IDs per board
  adresse_livraison_ligne1: {
    ATHOME:   'text_mm0n2rg1',
    STELLARS: 'text_mm0n5wec',
    EKL:      'text_mm0n3sgx',
    JM:       'text_mm0nz6tt',
    SALIH:    'text_mm0neyd5',
    ALEX:     'text_mm0nbfcz',
    DIZIEN:   'text_mm0n12jh',
  },
  adresse_livraison_ligne2: {
    ATHOME:   'text_mm0n87fc',
    STELLARS: 'text_mm0nem3p',
    EKL:      'text_mm0nd149',
    JM:       'text_mm0n7j04',
    SALIH:    'text_mm0n7ybb',
    ALEX:     'text_mm0n7e7c',
    DIZIEN:   'text_mm0nganh',
  },
  adresse_livraison_cp: {
    ATHOME:   'text_mm0n8mjw',
    STELLARS: 'text_mm0nahz1',
    EKL:      'text_mm0nspcb',
    JM:       'text_mm0n1crc',
    SALIH:    'text_mm0n879d',
    ALEX:     'text_mm0n58f9',
    DIZIEN:   'text_mm0nysef',
  },
  adresse_livraison_ville: {
    ATHOME:   'text_mm0nggnc',
    STELLARS: 'text_mm0nanm',
    EKL:      'text_mm0nbcxy',
    JM:       'text_mm0n7vc6',
    SALIH:    'text_mm0nsbwn',
    ALEX:     'text_mm0n7gyc',
    DIZIEN:   'text_mm0n3cxy',
  },
  type_livraison: {
    ATHOME:   'color_mm0na7ef',
    STELLARS: 'color_mm0nwqqx',
    EKL:      'color_mm0ncfrm',
    JM:       'color_mm0nzka6',
    SALIH:    'color_mm0na6gk',
    ALEX:     'color_mm0n8wkm',
    DIZIEN:   'color_mm0n7rhr',
  },
  code_enemat_saisi: {
    ATHOME:   'text_mm0n9y2m',
    STELLARS: 'text_mm0n921y',
    EKL:      'text_mm0n5djx',
    JM:       'text_mm0nnd5s',
    SALIH:    'text_mm0nvxwh',
    ALEX:     'text_mm0n5dcv',
    DIZIEN:   'text_mm0ne37t',
  },
  code_enemat_valide: {
    ATHOME:   'boolean_mm0nfyq7',
    STELLARS: 'boolean_mm0nybje',
    EKL:      'boolean_mm0nfgcj',
    JM:       'boolean_mm0n35d2',
    SALIH:    'boolean_mm0nzv1j',
    ALEX:     'boolean_mm0nb8st',
    DIZIEN:   'boolean_mm0n8wrg',
  },
  date_validation_code: {
    ATHOME:   'date_mm0nhws9',
    STELLARS: 'date_mm0nykh8',
    EKL:      'date_mm0n6bfj',
    JM:       'date_mm0nx4x6',
    SALIH:    'date_mm0ng2r4',
    ALEX:     'date_mm0nbhf4',
    DIZIEN:   'date_mm0nh233',
  },
}

// ===================================================================
// Field metadata (label, type, section, required)
// ===================================================================
const FIELD_META: Record<string, { label: string; type: string; section: string; required?: boolean }> = {
  raison_sociale:          { label: 'Raison sociale', type: 'text', section: 'identification', required: true },
  siret:                   { label: 'SIRET', type: 'text', section: 'identification', required: true },
  reference_dossier:       { label: 'Code Retina / Réf dossier', type: 'text', section: 'identification' },
  numero_devis:            { label: 'Numéro de devis / Liens devis', type: 'text', section: 'identification' },
  email_beneficiaire:      { label: 'Email client (bénéficiaire)', type: 'email', section: 'contact', required: true },
  telephone:               { label: 'Téléphone', type: 'phone', section: 'contact' },
  contact_nom:             { label: 'Nom du contact', type: 'text', section: 'contact' },
  contact_prenom:          { label: 'Prénom du contact', type: 'text', section: 'contact' },
  adresse_societe_ligne1:  { label: 'Adresse siège (ligne 1)', type: 'text', section: 'adresse_siege' },
  adresse_societe_cp:      { label: 'Code postal siège', type: 'text', section: 'adresse_siege' },
  adresse_societe_ville:   { label: 'Ville siège', type: 'text', section: 'adresse_siege' },
  adresse_livraison_ligne1:{ label: 'Adresse livraison (ligne 1)', type: 'text', section: 'adresse_livraison' },
  adresse_livraison_ligne2:{ label: 'Adresse livraison (ligne 2)', type: 'text', section: 'adresse_livraison' },
  adresse_livraison_cp:    { label: 'CP livraison', type: 'text', section: 'adresse_livraison' },
  adresse_livraison_ville: { label: 'Ville livraison', type: 'text', section: 'adresse_livraison' },
  type_livraison:          { label: 'Type de livraison', type: 'status', section: 'livraison' },
  code_ape:                { label: 'Code APE/NAF', type: 'text', section: 'entreprise' },
  nb_salaries:             { label: 'Nombre de salariés', type: 'number', section: 'entreprise' },
  velo_devis:              { label: 'Nombre vélos demandés', type: 'number', section: 'velos' },
  velo_valide:             { label: 'Nombre vélos validés', type: 'number', section: 'velos' },
  statut_commercial:       { label: 'Statut commercial', type: 'status', section: 'statuts' },
  code_enemat_saisi:       { label: 'Code ENEMAT saisi', type: 'text', section: 'validation' },
  code_enemat_valide:      { label: 'Code ENEMAT validé', type: 'checkbox', section: 'validation' },
  date_validation_code:    { label: 'Date validation code', type: 'date', section: 'validation' },
}

// Value mappings for status fields (Supabase value → Monday label)
const VALUE_MAPPINGS: Record<string, Record<string, string>> = {
  statut_commercial: {
    // PPE uses simpler statuts than ECO-VOLT
    dossier_complet: 'DOSSIER COMPLET',
    devis_signe: 'DEVIS SIGNÉ',
    client_hs: 'CLIENT HS',
    devis_cree: 'DEVIS CREE',
    controle_valide: 'CONTROLE VALIDÉ',
    inconnu: 'Inconnu',
    client_injoignable: 'CLIENT INJOIGNABLE',
    doublon: 'DOUBLON',
    controle_a_regulariser: 'CONTROLE A REGULARISER',
    ah_signee: 'AH SIGNÉE',
    livre: 'LIVRÉ',
    paye: 'PAYÈ',
    controle_a_jour: 'CONTROLE A JOUR',
    client_contacte: 'CLIENT CONTACTÉ',
    code_envoye: 'CODE ENVOYÉ',
    formulaire_envoye: 'FORMULAIRE ENVOYÉ',
    formulaire_valide: 'FORMULAIRE VALIDÉ',
  },
  type_livraison: {
    livraison_gratuite: 'Livraison gratuite',
    retrait_depot: 'Retrait depot',
    livraison_payante: 'Livraison payante',
  },
}

// ===================================================================
// Main function
// ===================================================================
async function main() {
  console.log('🚀 Seeding PPE per-board mappings into Supabase...')
  console.log(`   URL: ${SUPABASE_URL}`)
  console.log(`   Boards: ${Object.keys(BOARDS).join(', ')}`)
  console.log('')

  // Step 1: Also insert monday_boards metadata
  console.log('📋 Step 1: Inserting monday_boards metadata...')
  const boardMeta: Record<BoardName, string> = {
    ATHOME:   'ATHOME',
    STELLARS: 'STELLARS',
    EKL:      'EKL',
    JM:       'JM',
    SALIH:    'SALIH',
    ALEX:     'ALEX',
    DIZIEN:   'DIZIEN',
  }

  for (const [name, boardId] of Object.entries(BOARDS)) {
    const { error } = await supabase
      .from('monday_boards')
      .upsert({
        board_id: boardId,
        board_name: name,
        commercial_name: boardMeta[name as BoardName],
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'board_id' })

    if (error) {
      console.warn(`   ⚠️  monday_boards ${name}: ${error.message}`)
    } else {
      console.log(`   ✅ Board ${name} (${boardId})`)
    }
  }

  // Step 2: Insert per-board field mappings
  console.log('')
  console.log('📋 Step 2: Inserting per-board field mappings...')

  let totalInserted = 0
  let totalUpdated = 0
  let totalErrors = 0

  for (const [boardName, boardId] of Object.entries(BOARDS)) {
    console.log(`\n   🔧 Board: ${boardName} (${boardId})`)
    let boardCount = 0

    // Get all fields for this board
    const allFields = getAllFieldsForBoard(boardName as BoardName)

    for (const [field, columnId] of Object.entries(allFields)) {
      const meta = FIELD_META[field]
      if (!meta) {
        console.warn(`   ⚠️  No metadata for field: ${field}`)
        continue
      }

      const mappingData = {
        interface_field: field,
        interface_label: meta.label,
        interface_type: meta.type,
        interface_section: meta.section,
        monday_column_id: columnId,
        monday_column_title: null as string | null,
        monday_column_type: null as string | null,
        value_mapping: VALUE_MAPPINGS[field] || {},
        is_synced: true,
        is_required: meta.required || false,
        board_id: boardId,
        updated_at: new Date().toISOString(),
      }

      // Check if exists (SELECT + INSERT/UPDATE pattern due to COALESCE index)
      const { data: existing } = await supabase
        .from('monday_field_mapping')
        .select('id')
        .eq('interface_field', field)
        .eq('board_id', boardId)
        .maybeSingle()

      let error: any = null

      if (existing) {
        const result = await supabase
          .from('monday_field_mapping')
          .update(mappingData)
          .eq('id', existing.id)
        error = result.error
        if (!error) totalUpdated++
      } else {
        const result = await supabase
          .from('monday_field_mapping')
          .insert(mappingData)
        error = result.error
        if (!error) totalInserted++
      }

      if (error) {
        console.error(`   ❌ ${field}: ${error.message}`)
        totalErrors++
      } else {
        boardCount++
      }
    }

    console.log(`   ✅ ${boardCount} mappings for ${boardName}`)
  }

  console.log('')
  console.log('═══════════════════════════════════════')
  console.log(`✅ Done!`)
  console.log(`   Inserted: ${totalInserted}`)
  console.log(`   Updated:  ${totalUpdated}`)
  console.log(`   Errors:   ${totalErrors}`)
  console.log(`   Total:    ${totalInserted + totalUpdated} mappings across ${Object.keys(BOARDS).length} boards`)
  console.log('═══════════════════════════════════════')
}

/**
 * Build the complete field → columnId map for a given board
 */
function getAllFieldsForBoard(boardName: BoardName): Record<string, string> {
  const result: Record<string, string> = {}

  // Add common columns (same ID for all boards)
  for (const [field, columnId] of Object.entries(COMMON_COLUMNS)) {
    result[field] = columnId
  }

  // Add varying columns (specific to this board)
  for (const [field, boardMap] of Object.entries(VARYING_COLUMNS)) {
    const columnId = boardMap[boardName]
    if (columnId) {
      result[field] = columnId
    }
  }

  return result
}

// Run
main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
