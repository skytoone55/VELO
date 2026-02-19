import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MONDAY_CONFIG, getMondayApiKey } from '@/lib/monday/config'

/**
 * GET /api/monday/sync-ids?boardId=xxx
 * Vérifie et corrige les monday_item_id dans Supabase
 * en matchant par raison_sociale avec Monday
 *
 * En multi-board, itère sur tous les boards (ou un board spécifique)
 * et met aussi à jour monday_board_id sur les clients
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = getMondayApiKey()
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key Monday non configurée' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const requestedBoardId = searchParams.get('boardId')

    // Boards à synchroniser
    const boardIds = requestedBoardId
      ? [requestedBoardId]
      : MONDAY_CONFIG.allBoardIds

    const adminClient = createAdminClient()

    // 2. Récupérer tous les clients Supabase
    const { data: supabaseClients, error: fetchError } = await adminClient
      .from('clients')
      .select('id, raison_sociale, monday_item_id, monday_board_id')

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    console.log(`Supabase: ${supabaseClients?.length || 0} clients trouvés`)

    const results = {
      total_monday: 0,
      total_supabase: supabaseClients?.length || 0,
      matched: 0,
      updated: 0,
      boards_processed: [] as string[],
      not_found_in_monday: [] as string[],
      details: [] as any[],
      isMultiBoard: MONDAY_CONFIG.isMultiBoard,
    }

    // Itérer sur chaque board
    for (const boardId of boardIds) {
      try {
        // 1. Récupérer les items Monday du board
        const mondayResponse = await fetch(MONDAY_CONFIG.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: apiKey,
          },
          body: JSON.stringify({
            query: `query {
              boards(ids: [${boardId}]) {
                items_page(limit: 500) {
                  items {
                    id
                    name
                  }
                }
              }
            }`
          }),
        })

        const mondayData = await mondayResponse.json()
        if (mondayData.errors) {
          console.warn(`Erreur Monday board ${boardId}:`, mondayData.errors[0]?.message)
          continue
        }

        const mondayItems = mondayData.data?.boards?.[0]?.items_page?.items || []
        results.total_monday += mondayItems.length
        results.boards_processed.push(boardId)
        console.log(`Monday board ${boardId}: ${mondayItems.length} items trouvés`)

        // Créer un index par nom Monday (normalisé)
        const mondayByName: Record<string, { id: string; name: string }> = {}
        for (const item of mondayItems) {
          const normalizedName = normalizeCompanyName(item.name)
          mondayByName[normalizedName] = item
        }

        // 3. Matcher et corriger
        for (const client of supabaseClients || []) {
          const normalizedName = normalizeCompanyName(client.raison_sociale || '')
          const mondayItem = mondayByName[normalizedName]

          if (mondayItem) {
            results.matched++

            // Préparer les updates
            const updates: Record<string, any> = {}
            let needsUpdate = false

            // Vérifier si le monday_item_id est correct
            if (client.monday_item_id !== mondayItem.id) {
              updates.monday_item_id = mondayItem.id
              needsUpdate = true
            }

            // En multi-board, mettre aussi à jour le monday_board_id
            if (MONDAY_CONFIG.isMultiBoard && client.monday_board_id !== boardId) {
              updates.monday_board_id = boardId
              needsUpdate = true
            }

            if (needsUpdate) {
              const { error: updateError } = await adminClient
                .from('clients')
                .update(updates)
                .eq('id', client.id)

              if (!updateError) {
                results.updated++
                results.details.push({
                  raison_sociale: client.raison_sociale,
                  boardId,
                  old_id: client.monday_item_id,
                  new_id: mondayItem.id,
                  status: 'updated',
                })
              }
            } else {
              results.details.push({
                raison_sociale: client.raison_sociale,
                boardId,
                monday_item_id: client.monday_item_id,
                status: 'ok',
              })
            }
          }
        }
      } catch (boardErr: any) {
        console.warn(`Erreur sync-ids board ${boardId}:`, boardErr.message)
      }
    }

    // Trouver les clients non matchés (après avoir parcouru tous les boards)
    const matchedClientIds = new Set(results.details.map((d: any) => d.raison_sociale))
    for (const client of supabaseClients || []) {
      if (!matchedClientIds.has(client.raison_sociale)) {
        results.not_found_in_monday.push(client.raison_sociale || 'N/A')
      }
    }

    return NextResponse.json(results)

  } catch (error: any) {
    console.error('Erreur sync-ids:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * Normalise un nom d'entreprise pour le matching
 */
function normalizeCompanyName(name: string): string {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer accents
    .replace(/[^A-Z0-9\s]/g, '') // Garder que lettres et chiffres
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * POST /api/monday/sync-ids
 * Force la création des clients manquants dans Supabase depuis Monday
 *
 * En multi-board, itère sur tous les boards et stocke monday_board_id
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = getMondayApiKey()
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key Monday non configurée' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const requestedBoardId = body.boardId

    // Boards à synchroniser
    const boardIds = requestedBoardId
      ? [requestedBoardId]
      : MONDAY_CONFIG.allBoardIds

    const adminClient = createAdminClient()

    // Récupérer les clients Supabase existants
    const { data: existingClients } = await adminClient
      .from('clients')
      .select('monday_item_id')

    const existingIds = new Set((existingClients || []).map(c => c.monday_item_id))

    let totalMonday = 0
    let created = 0
    const boardResults: any[] = []

    for (const boardId of boardIds) {
      try {
        // Récupérer tous les items Monday du board
        const mondayResponse = await fetch(MONDAY_CONFIG.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: apiKey,
          },
          body: JSON.stringify({
            query: `query {
              boards(ids: [${boardId}]) {
                items_page(limit: 500) {
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
            }`
          }),
        })

        const mondayData = await mondayResponse.json()
        if (mondayData.errors) {
          boardResults.push({ boardId, error: mondayData.errors[0]?.message })
          continue
        }

        const mondayItems = mondayData.data?.boards?.[0]?.items_page?.items || []
        totalMonday += mondayItems.length
        let boardCreated = 0

        // Créer les clients manquants
        for (const item of mondayItems) {
          if (!existingIds.has(item.id)) {
            const insertData: Record<string, any> = {
              raison_sociale: item.name,
              monday_item_id: item.id,
              statut_commercial: 'inconnu',
            }

            // En multi-board, stocker le board d'origine
            if (MONDAY_CONFIG.isMultiBoard) {
              insertData.monday_board_id = boardId
            }

            const { error } = await adminClient
              .from('clients')
              .insert(insertData)

            if (!error) {
              created++
              boardCreated++
              existingIds.add(item.id) // Éviter les doublons entre boards
            }
          }
        }

        boardResults.push({ boardId, items: mondayItems.length, created: boardCreated })
      } catch (boardErr: any) {
        boardResults.push({ boardId, error: boardErr.message })
      }
    }

    return NextResponse.json({
      total_monday: totalMonday,
      already_exist: (existingClients || []).length,
      created,
      boards: boardResults,
      isMultiBoard: MONDAY_CONFIG.isMultiBoard,
    })

  } catch (error: any) {
    console.error('Erreur sync-ids POST:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
