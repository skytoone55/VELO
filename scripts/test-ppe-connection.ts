/**
 * Quick test: can we connect to PPE Supabase?
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.ppe.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

console.log('URL:', url)
console.log('Key prefix:', key?.substring(0, 20) + '...')

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function test() {
  // Test 1: List tables via simple select
  console.log('\n--- Test 1: Select from monday_field_mapping ---')
  const { data: mappings, error: mappingErr } = await supabase
    .from('monday_field_mapping')
    .select('id, interface_field, board_id')
    .limit(3)

  if (mappingErr) {
    console.error('Error:', mappingErr.message, mappingErr.code)
  } else {
    console.log('Rows:', mappings?.length, mappings)
  }

  // Test 2: Check if board_id column exists
  console.log('\n--- Test 2: Check board_id column ---')
  const { data: withBoard, error: boardErr } = await supabase
    .from('monday_field_mapping')
    .select('board_id')
    .limit(1)

  if (boardErr) {
    console.error('board_id column error:', boardErr.message)
    console.log('→ Migration probably needs to be applied first!')
  } else {
    console.log('board_id column exists ✅')
  }

  // Test 3: Check monday_boards table
  console.log('\n--- Test 3: Check monday_boards table ---')
  const { data: boards, error: boardsErr } = await supabase
    .from('monday_boards')
    .select('*')
    .limit(3)

  if (boardsErr) {
    console.error('monday_boards table error:', boardsErr.message)
    console.log('→ Migration probably needs to be applied first!')
  } else {
    console.log('monday_boards table exists ✅, rows:', boards?.length)
  }

  // Test 4: Check clients.monday_board_id
  console.log('\n--- Test 4: Check clients.monday_board_id ---')
  const { data: clients, error: clientsErr } = await supabase
    .from('clients')
    .select('id, monday_board_id')
    .limit(1)

  if (clientsErr) {
    console.error('clients.monday_board_id error:', clientsErr.message)
    console.log('→ Migration probably needs to be applied first!')
  } else {
    console.log('clients.monday_board_id column exists ✅')
  }
}

test().catch(console.error)
