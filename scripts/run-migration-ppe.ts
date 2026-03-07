/**
 * Applique la migration multi-board directement sur PPE Supabase via postgres.js
 * Usage: npx tsx scripts/run-migration-ppe.ts
 */
import postgres from 'postgres'
import * as fs from 'fs'
import * as path from 'path'

// Connexion directe au Postgres PPE
// Format: postgresql://postgres.[project-ref]:[password]@[host]:5432/postgres
const DB_URL = 'postgresql://postgres.zfpzhhdovxllchlsihcr:REDACTED@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'

const sql = postgres(DB_URL, { ssl: 'require' })

async function main() {
  console.log('🚀 Connexion directe PostgreSQL au projet PPE...')

  try {
    // Test connexion
    const [{ now }] = await sql`SELECT NOW() as now`
    console.log(`✅ Connecté! Server time: ${now}`)
    console.log('')

    // Lire le fichier migration
    const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260217_add_multi_board_support.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8')

    console.log('📋 Exécution de la migration multi-board...')
    console.log('')

    // Exécuter la migration en entier (postgres.js supporte les scripts multi-statement via unsafe)
    await sql.unsafe(migrationSQL)

    console.log('✅ Migration appliquée avec succès!')
    console.log('')

    // Vérification
    console.log('🔍 Vérification...')

    const boardIdCol = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'monday_field_mapping' AND column_name = 'board_id'
    `
    console.log(`   board_id dans monday_field_mapping: ${boardIdCol.length > 0 ? '✅' : '❌'}`)

    const mondayBoardsTable = await sql`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'monday_boards'
    `
    console.log(`   table monday_boards: ${mondayBoardsTable.length > 0 ? '✅' : '❌'}`)

    const clientBoardCol = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'clients' AND column_name = 'monday_board_id'
    `
    console.log(`   monday_board_id dans clients: ${clientBoardCol.length > 0 ? '✅' : '❌'}`)

    console.log('')
    console.log('🎉 Tout est prêt! Lance maintenant: npx tsx scripts/seed-ppe-mappings.ts')

  } catch (err: any) {
    console.error('❌ Erreur:', err.message)
    if (err.message.includes('password authentication failed')) {
      console.log('')
      console.log('💡 Le mot de passe DB peut être différent.')
      console.log('   Va dans Supabase Dashboard → Settings → Database → Connection string')
      console.log('   Et mets à jour le DB_URL dans ce script.')
    }
  } finally {
    await sql.end()
  }
}

main()
