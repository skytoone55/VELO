import { NextRequest, NextResponse } from 'next/server'
import { MONDAY_CONFIG } from '@/lib/monday/config'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

// Cache du sch\u00e9ma pour \u00e9viter les appels r\u00e9p\u00e9t\u00e9s \u00e0 Monday
// En multi-board: cache par boardId
const schemaCache: Map<string, { data: any; timestamp: number }> = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * API pour r\u00e9cup\u00e9rer le sch\u00e9ma du board Monday (colonnes disponibles)
 * GET /api/monday/schema?boardId=xxx
 *
 * En multi-board, le boardId est obligatoire
 * En single-board, il utilise MONDAY_CONFIG.boardIds.clients par d\u00e9faut
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(['super_admin', 'admin'])
  if (isAuthError(auth)) return auth

  const apiKey = process.env.MONDAY_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'MONDAY_API_KEY non configur\u00e9e' },
      { status: 400 }
    )
  }

  // R\u00e9cup\u00e9rer le boardId depuis les query params ou la config
  const { searchParams } = new URL(request.url)
  const requestedBoardId = searchParams.get('boardId')
  const boardId = requestedBoardId || MONDAY_CONFIG.boardIds.clients

  if (!boardId) {
    return NextResponse.json(
      { error: 'Board ID non sp\u00e9cifi\u00e9' },
      { status: 400 }
    )
  }

  // Retourner le cache s'il est valide
  const cached = schemaCache.get(boardId)
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return NextResponse.json(cached.data)
  }

  try {
    // Query pour r\u00e9cup\u00e9rer toutes les colonnes du board
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
        { error: 'Board non trouv\u00e9' },
        { status: 404 }
      )
    }

    // Parser les settings pour les colonnes status (r\u00e9cup\u00e9rer les labels)
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
    console.error('Erreur r\u00e9cup\u00e9ration sch\u00e9ma Monday:', error)

    // Si on a un cache m\u00eame expir\u00e9, le retourner plut\u00f4t que d'\u00e9chouer
    const cachedFallback = schemaCache.get(boardId)
    if (cachedFallback) {
      console.log('Retour du cache expir\u00e9 suite \u00e0 erreur')
      return NextResponse.json(cachedFallback.data)
    }

    return NextResponse.json(
      { error: error.message || 'Erreur de connexion \u00e0 Monday' },
      { status: 500 }
    )
  }
}
