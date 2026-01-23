import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MONDAY_CONFIG, getMondayApiKey } from '@/lib/monday/config'

/**
 * GET /api/monday/sync-ids
 * Vérifie et corrige les monday_item_id dans Supabase
 * en matchant par raison_sociale avec Monday
 */
export async function GET() {
  try {
    const apiKey = getMondayApiKey()
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key Monday non configurée' }, { status: 500 })
    }

    const boardId = MONDAY_CONFIG.boardIds.clients
    const adminClient = createAdminClient()

    // 1. Récupérer tous les items Monday
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
      return NextResponse.json({ error: mondayData.errors[0]?.message }, { status: 500 })
    }

    const mondayItems = mondayData.data?.boards?.[0]?.items_page?.items || []
    console.log(`Monday: ${mondayItems.length} items trouvés`)

    // 2. Récupérer tous les clients Supabase
    const { data: supabaseClients, error: fetchError } = await adminClient
      .from('clients')
      .select('id, raison_sociale, monday_item_id')

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    console.log(`Supabase: ${supabaseClients?.length || 0} clients trouvés`)

    // 3. Matcher et corriger
    const results = {
      total_monday: mondayItems.length,
      total_supabase: supabaseClients?.length || 0,
      matched: 0,
      updated: 0,
      not_found_in_monday: [] as string[],
      details: [] as any[],
    }

    // Créer un index par nom Monday (normalisé)
    const mondayByName: Record<string, { id: string; name: string }> = {}
    for (const item of mondayItems) {
      const normalizedName = normalizeCompanyName(item.name)
      mondayByName[normalizedName] = item
    }

    for (const client of supabaseClients || []) {
      const normalizedName = normalizeCompanyName(client.raison_sociale || '')
      const mondayItem = mondayByName[normalizedName]

      if (mondayItem) {
        results.matched++

        // Vérifier si le monday_item_id est correct
        if (client.monday_item_id !== mondayItem.id) {
          // Mettre à jour
          const { error: updateError } = await adminClient
            .from('clients')
            .update({ monday_item_id: mondayItem.id })
            .eq('id', client.id)

          if (!updateError) {
            results.updated++
            results.details.push({
              raison_sociale: client.raison_sociale,
              old_id: client.monday_item_id,
              new_id: mondayItem.id,
              status: 'updated',
            })
          }
        } else {
          results.details.push({
            raison_sociale: client.raison_sociale,
            monday_item_id: client.monday_item_id,
            status: 'ok',
          })
        }
      } else {
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
 */
export async function POST() {
  try {
    const apiKey = getMondayApiKey()
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key Monday non configurée' }, { status: 500 })
    }

    const boardId = MONDAY_CONFIG.boardIds.clients
    const adminClient = createAdminClient()

    // Récupérer tous les items Monday
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
      return NextResponse.json({ error: mondayData.errors[0]?.message }, { status: 500 })
    }

    const mondayItems = mondayData.data?.boards?.[0]?.items_page?.items || []

    // Récupérer les clients Supabase existants
    const { data: existingClients } = await adminClient
      .from('clients')
      .select('monday_item_id')

    const existingIds = new Set((existingClients || []).map(c => c.monday_item_id))

    // Créer les clients manquants
    let created = 0
    for (const item of mondayItems) {
      if (!existingIds.has(item.id)) {
        const { error } = await adminClient
          .from('clients')
          .insert({
            raison_sociale: item.name,
            monday_item_id: item.id,
            statut_commercial: 'inconnu',
          })

        if (!error) {
          created++
        }
      }
    }

    return NextResponse.json({
      total_monday: mondayItems.length,
      already_exist: existingIds.size,
      created,
    })

  } catch (error: any) {
    console.error('Erreur sync-ids POST:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
