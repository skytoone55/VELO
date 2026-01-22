import { NextRequest, NextResponse } from 'next/server'
import { MONDAY_CONFIG } from '@/lib/monday/config'

/**
 * API pour récupérer le schéma du board Monday (colonnes disponibles)
 * GET /api/monday/schema
 */
export async function GET() {
  const apiKey = process.env.MONDAY_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'MONDAY_API_KEY non configurée' },
      { status: 400 }
    )
  }

  try {
    // Query pour récupérer toutes les colonnes du board
    const query = `
      query {
        boards(ids: [${MONDAY_CONFIG.boardIds.clients}]) {
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

    const response = await fetch(MONDAY_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({ query }),
    })

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

    return NextResponse.json({
      boardId: board.id,
      boardName: board.name,
      columns,
    })

  } catch (error: any) {
    console.error('Erreur récupération schéma Monday:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de connexion à Monday' },
      { status: 500 }
    )
  }
}
