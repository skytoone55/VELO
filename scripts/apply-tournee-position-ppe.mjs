/**
 * Applique la migration `tournee_position` sur PPE Supabase via postgres.js
 * Usage: node scripts/apply-tournee-position-ppe.mjs
 */
import postgres from 'postgres'

const DB_URL = 'postgresql://postgres.zfpzhhdovxllchlsihcr:Roca6140@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'

const sql = postgres(DB_URL, { ssl: 'require' })

try {
  const [{ now }] = await sql`SELECT NOW() as now`
  console.log(`Connected: ${now}`)

  await sql.unsafe(
    'ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS tournee_position INTEGER NULL;'
  )
  console.log('Migration applied.')

  const col = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'livraisons' AND column_name = 'tournee_position'
  `
  console.log('Verification:', col)
} catch (err) {
  console.error('Error:', err.message)
  process.exit(1)
} finally {
  await sql.end()
}
