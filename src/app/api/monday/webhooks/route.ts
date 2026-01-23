import { NextRequest, NextResponse } from 'next/server'
import { getMondayApiKey, MONDAY_CONFIG, getWebhookUrl } from '@/lib/monday/config'

/**
 * API pour gérer les webhooks Monday
 *
 * GET: Liste les webhooks existants
 * POST: Crée les webhooks nécessaires (change_column_value, change_name, create_item, delete_item)
 * DELETE: Supprime un webhook par ID
 */

async function executeMondayQuery(query: string, variables?: Record<string, any>): Promise<any> {
  const apiKey = getMondayApiKey()
  if (!apiKey) {
    throw new Error('API Key Monday non configurée')
  }

  const response = await fetch(MONDAY_CONFIG.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  })

  const data = await response.json()

  if (data.errors) {
    console.error('Monday API Error:', data.errors)
    throw new Error(data.errors[0]?.message || 'Erreur API Monday')
  }

  return data.data
}

// GET: Liste les webhooks du board
export async function GET() {
  try {
    const boardId = MONDAY_CONFIG.boardIds.clients

    // Utiliser la query webhooks au niveau racine (API 2024+)
    const query = `
      query {
        webhooks(board_id: ${boardId}) {
          id
          event
          board_id
          config
        }
        boards(ids: [${boardId}]) {
          id
          name
        }
      }
    `

    const data = await executeMondayQuery(query)
    const webhooks = data.webhooks || []

    return NextResponse.json({
      boardId,
      boardName: data.boards?.[0]?.name,
      webhooks,
      webhookUrl: getWebhookUrl(),
    })
  } catch (error: any) {
    console.error('Error listing webhooks:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Crée les webhooks nécessaires
export async function POST(request: NextRequest) {
  try {
    const webhookUrl = getWebhookUrl()
    const boardId = MONDAY_CONFIG.boardIds.clients

    if (!webhookUrl.startsWith('http')) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_APP_URL doit être configuré avec une URL complète (https://...)' },
        { status: 400 }
      )
    }

    // Types d'événements à écouter
    const eventTypes = [
      'change_column_value',  // Changement de valeur de colonne
      'change_name',          // Changement de nom de l'item
      'create_item',          // Création d'un item
      'delete_item',          // Suppression d'un item
    ]

    const results = []

    for (const eventType of eventTypes) {
      try {
        const mutation = `
          mutation {
            create_webhook(
              board_id: ${boardId},
              url: "${webhookUrl}",
              event: ${eventType}
            ) {
              id
              board_id
              event
            }
          }
        `

        const data = await executeMondayQuery(mutation)
        results.push({
          event: eventType,
          success: true,
          webhook: data.create_webhook,
        })
      } catch (err: any) {
        // Si le webhook existe déjà, on continue
        if (err.message?.includes('already exists')) {
          results.push({
            event: eventType,
            success: true,
            message: 'Webhook déjà existant',
          })
        } else {
          results.push({
            event: eventType,
            success: false,
            error: err.message,
          })
        }
      }
    }

    return NextResponse.json({
      message: 'Configuration des webhooks terminée',
      webhookUrl,
      boardId,
      results,
    })
  } catch (error: any) {
    console.error('Error creating webhooks:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE: Supprime un webhook
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const webhookId = searchParams.get('id')

    if (!webhookId) {
      return NextResponse.json({ error: 'ID du webhook requis' }, { status: 400 })
    }

    const mutation = `
      mutation {
        delete_webhook(id: ${webhookId}) {
          id
        }
      }
    `

    await executeMondayQuery(mutation)

    return NextResponse.json({
      message: 'Webhook supprimé',
      webhookId,
    })
  } catch (error: any) {
    console.error('Error deleting webhook:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
