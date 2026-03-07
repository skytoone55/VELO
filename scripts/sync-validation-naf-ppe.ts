/**
 * Script one-shot : Sync validation_naf depuis Monday vers Supabase (PPE)
 * Lit les colonnes Validation NAF de chaque board et met à jour en batch.
 *
 * Usage: npx tsx scripts/sync-validation-naf-ppe.ts
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

// Board ID → column ID pour validation_naf
const BOARDS: Record<string, string> = {
  '2144986053': 'color_mm0vrhdk',  // ATHOME
  '2137662048': 'color_mm0vgkmf',  // JM
  '5013455904': 'color_mm0vf9d2',  // SALIH
  '5001072451': 'color_mm0vq45a',  // STELLARS
  '5002798369': 'color_mm0vz342',  // ALEX
  '2140187165': 'color_mm0v8049',  // EKL
  '2146667697': 'color_mm0v75kg',  // DIZIEN
}

async function fetchAllItems(boardId: string, columnId: string): Promise<{ mondayId: string; naf: string }[]> {
  const results: { mondayId: string; naf: string }[] = []
  let cursor: string | null = null

  while (true) {
    const cursorArg = cursor ? `, cursor: "${cursor}"` : ''
    const query = `{ boards(ids: ${boardId}) { items_page(limit: 500${cursorArg}) { cursor items { id column_values(ids: "${columnId}") { text } } } } }`

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
        results.push({ mondayId: item.id, naf: text })
      }
    }

    cursor = page.cursor
    if (!cursor) break
  }

  return results
}

async function main() {
  console.log('🚀 Sync validation_naf depuis Monday vers Supabase PPE')
  let totalUpdated = 0
  let totalNotFound = 0
  let totalErrors = 0

  for (const [boardId, columnId] of Object.entries(BOARDS)) {
    console.log(`\n📋 Board ${boardId} (col: ${columnId})`)
    const items = await fetchAllItems(boardId, columnId)
    console.log(`   ${items.length} items avec validation_naf`)

    // Batch update par groupes de 50
    for (let i = 0; i < items.length; i += 50) {
      const batch = items.slice(i, i + 50)

      for (const item of batch) {
        const { data, error } = await supabase
          .from('clients')
          .update({ validation_naf: item.naf })
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
    }
    console.log(`   ✅ Done`)
  }

  console.log('\n═══════════════════════════════════════')
  console.log(`✅ Terminé`)
  console.log(`   Mis à jour : ${totalUpdated}`)
  console.log(`   Non trouvés : ${totalNotFound}`)
  console.log(`   Erreurs : ${totalErrors}`)
  console.log('═══════════════════════════════════════')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
