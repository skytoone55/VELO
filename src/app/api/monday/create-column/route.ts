import { NextRequest, NextResponse } from 'next/server'
import { createMondayColumn } from '@/lib/monday/api'

/**
 * API pour créer une colonne dans Monday
 * Usage: POST /api/monday/create-column
 * Body: { title: string, type?: 'text' | 'date' | 'numbers' | 'status' | 'checkbox', description?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, type = 'text', description } = body

    if (!title) {
      return NextResponse.json(
        { error: 'Le titre de la colonne est requis' },
        { status: 400 }
      )
    }

    const result = await createMondayColumn(title, type, description)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      columnId: result.columnId,
      message: `Colonne "${title}" créée avec succès. ID: ${result.columnId}`,
      nextStep: `Ajouter ce mapping dans config.ts: '${result.columnId}': 'code_enemat_saisi'`,
    })

  } catch (error: any) {
    console.error('Erreur création colonne Monday:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
