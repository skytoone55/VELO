import { NextRequest, NextResponse } from 'next/server'
import { MONDAY_CONFIG, getMondayApiKey } from '@/lib/monday/config'
import { loadMappings } from '@/lib/monday/dynamic-mapping'

/**
 * GET /api/monday/statuts?boardId=xxx&field=statut_commercial
 * Récupère les statuts disponibles depuis Monday dynamiquement
 *
 * En multi-board, utilise le mapping dynamique pour trouver la bonne colonne
 * En single-board, fallback sur la colonne hardcodée (color_mkvfws5n)
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = getMondayApiKey()
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key Monday non configurée' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const requestedBoardId = searchParams.get('boardId')
    const fieldName = searchParams.get('field') || 'statut_commercial'

    const boardId = requestedBoardId || MONDAY_CONFIG.boardIds.clients
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

    // Trouver la colonne statut via mapping dynamique ou fallback hardcodé
    let statusColumnId = 'color_mkvfws5n' // Fallback ECO-VOLT

    if (MONDAY_CONFIG.isMultiBoard) {
      // En multi-board, chercher dans le mapping dynamique
      try {
        const mappings = await loadMappings(false, boardId)
        const fieldMapping = mappings.find(m => m.interface_field === fieldName)
        if (fieldMapping?.monday_column_id) {
          statusColumnId = fieldMapping.monday_column_id
        }
      } catch (e) {
        console.warn('Pas de mapping dynamique, utilisation du fallback')
      }
    }

    const statusColumn = columns.find((c: any) => c.id === statusColumnId)

    if (!statusColumn) {
      // Essayer de trouver par titre "Statut"
      const fallback = columns.find((c: any) =>
        c.type === 'color' && c.title?.toLowerCase().includes('statut')
      )
      if (!fallback) {
        return NextResponse.json({ error: `Colonne ${fieldName} non trouvée (${statusColumnId})` }, { status: 404 })
      }
      // Use the fallback column
      return NextResponse.json(await parseStatusColumn(fallback))
    }

    return NextResponse.json(await parseStatusColumn(statusColumn))

  } catch (error: any) {
    console.error('Erreur API statuts Monday:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * Parse une colonne status Monday et retourne les labels formatés
 */
async function parseStatusColumn(statusColumn: any) {
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

  return {
    column_id: statusColumn.id,
    column_title: statusColumn.title,
    statuts,
  }
}
