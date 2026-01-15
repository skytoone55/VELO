import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MONDAY_CONFIG, getMondayApiKey, isMondayConfigured } from '@/lib/monday/config'
import { SyncResult, SyncError } from '@/lib/monday/types'

// Create admin Supabase client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // Check if Monday is configured
    if (!isMondayConfigured()) {
      return NextResponse.json(
        { error: 'Monday.com non configure', configured: false },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { direction = 'supabase_to_monday' } = body

    const result: SyncResult = {
      success: true,
      direction,
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      errors: [],
      timestamp: new Date().toISOString(),
    }

    if (direction === 'supabase_to_monday') {
      // Sync from Supabase to Monday
      await syncSupabaseToMonday(result)
    } else {
      // Sync from Monday to Supabase
      await syncMondayToSupabase(result)
    }

    // Log the sync operation
    await supabaseAdmin.from('sync_monday_log').insert({
      action: 'sync_batch',
      direction,
      statut: result.success ? 'success' : 'error',
      donnees_apres: result,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de synchronisation' },
      { status: 500 }
    )
  }
}

async function syncSupabaseToMonday(result: SyncResult) {
  const apiKey = getMondayApiKey()
  if (!apiKey) {
    result.success = false
    result.errors.push({ error: 'API Key Monday non configuree' })
    return
  }

  // Get clients that need sync (not synced or updated since last sync)
  const { data: clients, error } = await supabaseAdmin
    .from('clients')
    .select('*')
    .or('monday_synced_at.is.null,monday_sync_status.eq.pending')
    .limit(100)

  if (error) {
    result.success = false
    result.errors.push({ error: 'Erreur lecture clients', details: error })
    return
  }

  if (!clients || clients.length === 0) {
    return
  }

  for (const client of clients) {
    result.itemsProcessed++

    try {
      const columnValues = mapClientToMondayColumns(client)

      if (client.monday_item_id) {
        // Update existing Monday item
        await updateMondayItem(apiKey, client.monday_item_id, columnValues)
        result.itemsUpdated++
      } else {
        // Create new Monday item
        const mondayItemId = await createMondayItem(
          apiKey,
          MONDAY_CONFIG.boardIds.clients,
          client.raison_sociale,
          columnValues
        )

        // Store Monday item ID in Supabase
        await supabaseAdmin
          .from('clients')
          .update({
            monday_item_id: mondayItemId,
            monday_sync_status: 'synced',
            monday_synced_at: new Date().toISOString(),
          })
          .eq('id', client.id)

        result.itemsCreated++
      }

      // Log successful sync
      await supabaseAdmin.from('sync_monday_log').insert({
        action: 'sync_item',
        client_id: client.id,
        monday_item_id: client.monday_item_id,
        direction: 'supabase_to_monday',
        statut: 'success',
        donnees_avant: client,
      })
    } catch (err: any) {
      result.errors.push({
        itemId: client.id,
        mondayItemId: client.monday_item_id?.toString(),
        error: err.message,
      })
    }
  }

  result.success = result.errors.length === 0
}

async function syncMondayToSupabase(result: SyncResult) {
  const apiKey = getMondayApiKey()
  if (!apiKey) {
    result.success = false
    result.errors.push({ error: 'API Key Monday non configuree' })
    return
  }

  // Get items from Monday board
  const query = `
    query {
      boards(ids: [${MONDAY_CONFIG.boardIds.clients}]) {
        items_page(limit: 100) {
          items {
            id
            name
            column_values {
              id
              text
              value
            }
          }
        }
      }
    }
  `

  try {
    const response = await fetch(MONDAY_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({ query }),
    })

    const data = await response.json()

    if (data.errors) {
      result.success = false
      result.errors.push({ error: 'Erreur API Monday', details: data.errors })
      return
    }

    const items = data.data?.boards?.[0]?.items_page?.items || []

    for (const item of items) {
      result.itemsProcessed++

      try {
        // Check if this Monday item already exists in Supabase
        const { data: existingClient } = await supabaseAdmin
          .from('clients')
          .select('id')
          .eq('monday_item_id', parseInt(item.id))
          .single()

        if (existingClient) {
          // Update existing client (only specific fields from Monday)
          const updates = mapMondayColumnsToClient(item.column_values)

          if (Object.keys(updates).length > 0) {
            await supabaseAdmin
              .from('clients')
              .update({
                ...updates,
                monday_synced_at: new Date().toISOString(),
              })
              .eq('id', existingClient.id)
            result.itemsUpdated++
          } else {
            result.itemsSkipped++
          }
        } else {
          // New item from Monday - skip for now (clients should be created in Supabase)
          result.itemsSkipped++
        }
      } catch (err: any) {
        result.errors.push({
          mondayItemId: item.id,
          error: err.message,
        })
      }
    }

    result.success = result.errors.length === 0
  } catch (err: any) {
    result.success = false
    result.errors.push({ error: 'Erreur connexion Monday', details: err.message })
  }
}

function mapClientToMondayColumns(client: any): Record<string, any> {
  return {
    [MONDAY_CONFIG.clientFieldMappings.siret]: client.siret,
    [MONDAY_CONFIG.clientFieldMappings.email]: { email: client.email, text: client.email },
    [MONDAY_CONFIG.clientFieldMappings.telephone]: client.telephone,
    [MONDAY_CONFIG.clientFieldMappings.departement]: {
      labels: [client.departement],
    },
    [MONDAY_CONFIG.clientFieldMappings.statut_formulaire]: {
      label: MONDAY_CONFIG.statutMappings[client.statut_formulaire as keyof typeof MONDAY_CONFIG.statutMappings] || 'En attente',
    },
    [MONDAY_CONFIG.clientFieldMappings.velo_devis]: client.velo_devis?.toString(),
    [MONDAY_CONFIG.clientFieldMappings.velo_valide]: (client.velo_valide || 0).toString(),
  }
}

function mapMondayColumnsToClient(columnValues: any[]): Record<string, any> {
  const updates: Record<string, any> = {}

  for (const col of columnValues) {
    // Only sync specific fields from Monday to Supabase
    // Most fields should be managed in Supabase (SSOT)
    switch (col.id) {
      case MONDAY_CONFIG.clientFieldMappings.statut_formulaire:
        // Status could be updated from Monday for commercial workflow
        const label = col.text
        const statutKey = Object.entries(MONDAY_CONFIG.statutMappings).find(
          ([, v]) => v === label
        )?.[0]
        if (statutKey) {
          updates.statut_commercial = statutKey
        }
        break
      // Add other fields that can be updated from Monday
    }
  }

  return updates
}

async function createMondayItem(
  apiKey: string,
  boardId: string,
  itemName: string,
  columnValues: Record<string, any>
): Promise<number> {
  const mutation = `
    mutation {
      create_item(
        board_id: ${boardId},
        item_name: "${itemName.replace(/"/g, '\\"')}",
        column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
      ) {
        id
      }
    }
  `

  const response = await fetch(MONDAY_CONFIG.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query: mutation }),
  })

  const data = await response.json()

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Erreur creation Monday')
  }

  return parseInt(data.data.create_item.id)
}

async function updateMondayItem(
  apiKey: string,
  itemId: number,
  columnValues: Record<string, any>
): Promise<void> {
  const mutation = `
    mutation {
      change_multiple_column_values(
        item_id: ${itemId},
        board_id: ${MONDAY_CONFIG.boardIds.clients},
        column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
      ) {
        id
      }
    }
  `

  const response = await fetch(MONDAY_CONFIG.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query: mutation }),
  })

  const data = await response.json()

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Erreur mise a jour Monday')
  }
}

// GET endpoint to check sync status
export async function GET() {
  const configured = isMondayConfigured()

  // Get last sync info
  const { data: lastSync } = await supabaseAdmin
    .from('sync_monday_log')
    .select('*')
    .eq('action', 'sync_batch')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Get counts
  const { count: totalClients } = await supabaseAdmin
    .from('clients')
    .select('id', { count: 'exact', head: true })

  const { count: syncedClients } = await supabaseAdmin
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .not('monday_item_id', 'is', null)

  const { count: pendingSync } = await supabaseAdmin
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .or('monday_synced_at.is.null,monday_sync_status.eq.pending')

  return NextResponse.json({
    configured,
    lastSync: lastSync?.created_at || null,
    lastSyncResult: lastSync?.donnees_apres || null,
    stats: {
      totalClients: totalClients || 0,
      syncedClients: syncedClients || 0,
      pendingSync: pendingSync || 0,
    },
  })
}
