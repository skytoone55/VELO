import { NextResponse } from 'next/server'
import { MONDAY_CONFIG, getMondayApiKey } from '@/lib/monday/config'

/**
 * GET /api/monday/statuts
 * Récupère les statuts disponibles depuis Monday dynamiquement
 *
 * Retourne les labels de la colonne statut_commercial (color_mkvfws5n)
 */
export async function GET() {
  try {
    const apiKey = getMondayApiKey()
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key Monday non configurée' }, { status: 500 })
    }

    const boardId = MONDAY_CONFIG.boardIds.clients
    if (!boardId) {
      return NextResponse.json({ error: 'Board ID Monday non configuré' }, { status: 500 })
    }

    // Récupérer les colonnes du board
    const response = await fetch(MONDAY_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query: `query { boards(ids: [${boardId}]) { columns { id title type settings_str } } }`
      }),
    })

    const data = await response.json()

    if (data.errors) {
      console.error('Monday API Error:', data.errors)
      return NextResponse.json({ error: data.errors[0]?.message }, { status: 500 })
    }

    const columns = data.data?.boards?.[0]?.columns || []

    // Trouver la colonne statut_commercial
    const statusColumn = columns.find((c: any) => c.id === 'color_mkvfws5n')

    if (!statusColumn) {
      return NextResponse.json({ error: 'Colonne statut_commercial non trouvée' }, { status: 404 })
    }

    // Parser les labels
    const settings = JSON.parse(statusColumn.settings_str || '{}')
    const labels = settings.labels || {}

    // Convertir en array avec value (label Monday) et key (pour Supabase)
    const statuts = Object.entries(labels)
      .filter(([_, label]) => label && String(label).trim() !== '')
      .map(([index, label]) => {
        // Convertir le label Monday en clé Supabase (snake_case)
        const labelStr = String(label)
        const key = labelStr
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Supprimer accents
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, '_')
          .trim()

        return {
          index: parseInt(index),
          key,
          label: labelStr,
        }
      })
      .sort((a, b) => a.index - b.index)

    return NextResponse.json({
      column_id: statusColumn.id,
      column_title: statusColumn.title,
      statuts,
    })

  } catch (error: any) {
    console.error('Erreur API statuts Monday:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
