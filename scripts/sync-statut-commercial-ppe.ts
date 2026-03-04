/**
 * Script one-shot : Sync statut_commercial depuis Monday vers Supabase (PPE)
 * Usage: npx tsx scripts/sync-statut-commercial-ppe.ts
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.ppe.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const MONDAY_API_KEY = process.env.MONDAY_API_KEY!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// statut_commercial = colonne "status" sur tous les boards PPE
const BOARD_IDS = [
  '2144986053', '5001072451', '2140187165', '2137662048',
  '5013455904', '5002798369', '2146667697',
]
const COLUMN_ID = 'status'

async function fetchAllItems(boardId: string): Promise<{ mondayId: string; statut: string }[]> {
  const results: { mondayId: string; statut: string }[] = []
  let cursor: string | null = null

  while (true) {
    const cursorArg = cursor ? `, cursor: "${cursor}"` : ''
    const query = `{ boards(ids: ${boardId}) { items_page(limit: 500${cursorArg}) { cursor items { id column_values(ids: "${COLUMN_ID}") { text } } } } }`

    const res = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: { 'Authorization': MONDAY_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    const data = await res.json()
    const page = data.data?.boards?.[0]?.items_page
    if (!page?.items?.length) break

    for (const item of page.items) {
      const text = item.column_values?.[0]?.text
      if (text) {
        results.push({ mondayId: item.id, statut: text })
      }
    }

    cursor = page.cursor
    if (!cursor) break
  }

  return results
}

async function main() {
  console.log('\uD83D\uDE80 Sync statut_commercial depuis Monday vers Supabase PPE')
  let totalUpdated = 0
  let totalNotFound = 0
  let totalErrors = 0

  for (const boardId of BOARD_IDS) {
    console.log(`\n\uD83D\uDCCB Board ${boardId}`)
    const items = await fetchAllItems(boardId)
    console.log(`   ${items.length} items avec statut_commercial`)

    for (const item of items) {
      const { data, error } = await supabase
        .from('clients')
        .update({ statut_commercial: item.statut })
        .eq('monday_item_id', parseInt(item.mondayId))
        .select('id')

      if (error) {
        totalErrors++
      } else if (!data?.length) {
        totalNotFound++
      } else {
        totalUpdated++
      }
    }
    console.log(`   \u2705 Done`)
  }

  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550')
  console.log(`\u2705 Terminé`)
  console.log(`   Mis à jour : ${totalUpdated}`)
  console.log(`   Non trouvés : ${totalNotFound}`)
  console.log(`   Erreurs : ${totalErrors}`)
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
