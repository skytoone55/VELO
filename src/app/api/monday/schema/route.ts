import { NextRequest, NextResponse } from 'next/server'
import { MONDAY_CONFIG } from '@/lib/monday/config'

// Cache du schéma pour éviter les appels répétés à Monday
// En multi-board: cache par boardId
const schemaCache: Map<string, { data: any; timestamp: number }> = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * API pour récupérer le schéma du board Monday (colonnes disponibles)
 * GET /api/monday/schema?boardId=xxx
 *
 * En multi-board, le boardId est obligatoire
 * En single-board, il utilise MONDAY_CONFIG.boardIds.clients par défaut
 */
export async function GET(request: NextRequest) {
  const apiKey = process.env.MONDAY_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'MONDAY_API_KEY non configurée' },
      { status: 400 }
    )
  }

  // Récupérer le boardId depuis les query params ou la config
  const { searchParams } = new URL(request.url)
  const requestedBoardId = searchParams.get('boardId')
  const boardId = requestedBoardId || MONDAY_CONFIG.boardIds.clients

  if (!boardId) {
    return NextResponse.json(
      { error: 'Board ID non spécifié' },
      { status: 400 }
    )
  }

  // Retourner le cache s'il est valide
  const cached = schemaCache.get(boardId)
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return NextResponse.json(cached.data)
  }

  try {
    // Query pour récupérer toutes les colonnes du board
    const query = `
      query {
        boards(ids: [${boardId}]) {
          id
          name
          columns {
            id
            title
            type
            settings_str
          }
        }
      }
    `

    // Ajouter un AbortController avec timeout de 10 secondes
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(MONDAY_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const data = await response.json()

    if (data.errors) {
      return NextResponse.json(
        { error: 'Erreur API Monday', details: data.errors },
        { status: 500 }
      )
    }

    const board = data.data?.boards?.[0]
    if (!board) {
      return NextResponse.json(
        { error: 'Board non trouvé' },
        { status: 404 }
      )
    }

    // Parser les settings pour les colonnes status (récupérer les labels)
    const columns = board.columns.map((col: any) => {
      const column: any = {
        id: col.id,
        title: col.title,
        type: col.type,
      }

      // Pour les colonnes status, extraire les labels possibles
      if (col.type === 'color' && col.settings_str) {
        try {
          const settings = JSON.parse(col.settings_str)
          if (settings.labels) {
            column.labels = Object.entries(settings.labels).map(([id, label]) => ({
              id,
              label,
            }))
          }
        } catch {
          // Ignorer les erreurs de parsing
        }
      }

      return column
    })

    const result = {
      boardId: board.id,
      boardName: board.name,
      columns,
    }

    // Mettre en cache
    schemaCache.set(boardId, { data: result, timestamp: Date.now() })

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Erreur récupération schéma Monday:', error)

    // Si on a un cache même expiré, le retourner plutôt que d'échouer
    const cachedFallback = schemaCache.get(boardId)
    if (cachedFallback) {
      console.log('Retour du cache expiré suite à erreur')
      return NextResponse.json(cachedFallback.data)
    }

    return NextResponse.json(
      { error: error.message || 'Erreur de connexion à Monday' },
      { status: 500 }
    )
  }
}
