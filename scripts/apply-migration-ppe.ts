/**
 * Applique la migration multi-board sur PPE Supabase via pg (connexion directe)
 *
 * Usage: npx tsx scripts/apply-migration-ppe.ts
 *
 * Alternative si pg non dispo: copier le SQL dans Supabase Dashboard → SQL Editor
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config({ path: path.resolve(__dirname, '../.env.ppe.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Exécuter du SQL brut via Supabase RPC (nécessite la fonction exec_sql ou rpc)
// On va utiliser l'approche par étapes individuelles via le REST API

async function execSQL(sql: string, label: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('exec_sql', { query: sql })
  if (error) {
    // Si exec_sql n'existe pas, on essaie via pg_net ou on affiche l'erreur
    console.error(`   ❌ ${label}: ${error.message}`)
    return false
  }
  console.log(`   ✅ ${label}`)
  return true
}

async function main() {
  console.log('🚀 Application de la migration multi-board sur PPE Supabase...')
  console.log(`   URL: ${SUPABASE_URL}`)
  console.log('')

  // Tester si la fonction exec_sql existe
  const { error: testErr } = await supabase.rpc('exec_sql', { query: 'SELECT 1' })

  if (testErr) {
    console.log('⚠️  La fonction exec_sql n\'existe pas sur ce projet.')
    console.log('')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('📋 COPIE LE SQL CI-DESSOUS dans Supabase Dashboard → SQL Editor')
    console.log('   https://supabase.com/dashboard/project/zfpzhhdovxllchlsihcr/sql')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('')

    const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260217_add_multi_board_support.sql')
    const sql = fs.readFileSync(migrationPath, 'utf-8')
    console.log(sql)

    console.log('')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('⬆️  Copie tout le SQL ci-dessus, colle-le dans le SQL Editor, et clique "Run"')
    console.log('   Ensuite relance: npx tsx scripts/seed-ppe-mappings.ts')
    console.log('═══════════════════════════════════════════════════════════')
    return
  }

  // Si exec_sql existe, on exécute étape par étape
  const steps = [
    {
      label: 'Ajout board_id à monday_field_mapping',
      sql: `ALTER TABLE monday_field_mapping ADD COLUMN IF NOT EXISTS board_id TEXT;`,
    },
    {
      label: 'Suppression ancienne contrainte unique',
      sql: `ALTER TABLE monday_field_mapping DROP CONSTRAINT IF EXISTS monday_field_mapping_interface_field_key;`,
    },
    {
      label: 'Création index unique composite',
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_monday_field_mapping_field_board ON monday_field_mapping(interface_field, COALESCE(board_id, '__null__'));`,
    },
    {
      label: 'Index board_id',
      sql: `CREATE INDEX IF NOT EXISTS idx_monday_field_mapping_board_id ON monday_field_mapping(board_id) WHERE board_id IS NOT NULL;`,
    },
    {
      label: 'Ajout monday_board_id à clients',
      sql: `ALTER TABLE clients ADD COLUMN IF NOT EXISTS monday_board_id TEXT;`,
    },
    {
      label: 'Index clients.monday_board_id',
      sql: `CREATE INDEX IF NOT EXISTS idx_clients_monday_board_id ON clients(monday_board_id) WHERE monday_board_id IS NOT NULL;`,
    },
    {
      label: 'Création table monday_boards',
      sql: `CREATE TABLE IF NOT EXISTS monday_boards (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        board_id TEXT NOT NULL UNIQUE,
        board_name TEXT NOT NULL,
        commercial_name TEXT,
        is_active BOOLEAN DEFAULT true,
        items_count INTEGER DEFAULT 0,
        last_synced_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );`,
    },
    {
      label: 'RLS monday_boards',
      sql: `ALTER TABLE monday_boards ENABLE ROW LEVEL SECURITY;`,
    },
    {
      label: 'Policy admin monday_boards',
      sql: `CREATE POLICY "Admin can manage monday boards" ON monday_boards FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role IN ('admin_general', 'admin_regional')));`,
    },
    {
      label: 'Policy service_role monday_boards',
      sql: `CREATE POLICY "Service role full access monday boards" ON monday_boards FOR ALL TO service_role USING (true) WITH CHECK (true);`,
    },
  ]

  let success = 0
  for (const step of steps) {
    const ok = await execSQL(step.sql, step.label)
    if (ok) success++
  }

  console.log('')
  console.log(`✅ Migration terminée: ${success}/${steps.length} étapes réussies`)
  console.log('   Maintenant lance: npx tsx scripts/seed-ppe-mappings.ts')
}

main().catch(console.error)
