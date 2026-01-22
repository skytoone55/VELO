import { NextRequest, NextResponse } from 'next/server'
import { MONDAY_CONFIG } from '@/lib/monday/config'

/**
 * API pour créer une nouvelle colonne dans Monday
 * POST /api/monday/columns
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.MONDAY_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'MONDAY_API_KEY non configurée' },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()
    const { title, columnType = 'text', description } = body

    if (!title) {
      return NextResponse.json(
        { error: 'Le titre de la colonne est requis' },
        { status: 400 }
      )
    }

    // Mapping des types de notre interface vers les types Monday
    const mondayColumnTypes: Record<string, string> = {
      'text': 'text',
      'long_text': 'long_text',
      'number': 'numbers',
      'email': 'email',
      'phone': 'phone',
      'date': 'date',
      'status': 'color',
      'dropdown': 'dropdown',
      'checkbox': 'checkbox',
      'link': 'link',
      'file': 'file',
    }

    const mondayType = mondayColumnTypes[columnType] || 'text'

    // Mutation pour créer une colonne
    const mutation = `
      mutation {
        create_column(
          board_id: ${MONDAY_CONFIG.boardIds.clients},
          title: "${title}",
          column_type: ${mondayType}
          ${description ? `, description: "${description}"` : ''}
        ) {
          id
          title
          type
        }
      }
    `

    const response = await fetch(MONDAY_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({ query: mutation }),
    })

    const data = await response.json()

    if (data.errors) {
      return NextResponse.json(
        { error: 'Erreur création colonne Monday', details: data.errors },
        { status: 500 }
      )
    }

    const newColumn = data.data?.create_column
    if (!newColumn) {
      return NextResponse.json(
        { error: 'Échec de création de la colonne' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      column: newColumn,
    })

  } catch (error: any) {
    console.error('Erreur création colonne Monday:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de connexion à Monday' },
      { status: 500 }
    )
  }
}
