import { NextRequest, NextResponse } from 'next/server'
import { getMondayItemById, parseValueFromMonday, updateMondayItem, updateMondayItemName, MondayItem } from '@/lib/monday/api'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * API pour un client spécifique DIRECTEMENT depuis Monday
 * Monday = Source de vérité unique
 *
 * GET /api/monday/clients/[id] - Récupérer un client
 * PUT /api/monday/clients/[id] - Mettre à jour un client
 */

interface MappingRecord {
  interface_field: string
  monday_column_id: string | null
  monday_column_type: string | null
}

// Récupérer le mapping depuis Supabase
async function getMapping() {
  const adminClient = createAdminClient()
  const { data: mappings } = await adminClient
    .from('monday_field_mapping')
    .select('interface_field, monday_column_id, monday_column_type')
    .not('monday_column_id', 'is', null)

  // Créer les index bidirectionnels
  const columnToField: Record<string, { field: string; type: string }> = {}
  const fieldToColumn: Record<string, { columnId: string; type: string }> = {}

  if (mappings) {
    for (const m of mappings as MappingRecord[]) {
      if (m.monday_column_id) {
        columnToField[m.monday_column_id] = {
          field: m.interface_field,
          type: m.monday_column_type || 'text',
        }
        fieldToColumn[m.interface_field] = {
          columnId: m.monday_column_id,
          type: m.monday_column_type || 'text',
        }
      }
    }
  }

  return { columnToField, fieldToColumn }
}

// Transformer un item Monday en objet client
function transformMondayToClient(
  item: MondayItem,
  columnToField: Record<string, { field: string; type: string }>
): Record<string, any> {
  const client: Record<string, any> = {
    id: item.id,
    monday_item_id: item.id,
    raison_sociale: item.name,
    created_at: item.created_at,
    updated_at: item.updated_at,
  }

  for (const col of item.column_values) {
    const mapping = columnToField[col.id]
    if (mapping) {
      client[mapping.field] = parseValueFromMonday(
        col.type || mapping.type,
        col.text,
        col.value
      )
    }
  }

  return client
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Récupérer le mapping
    const { columnToField } = await getMapping()

    // Récupérer l'item depuis Monday
    const mondayItem = await getMondayItemById(id)

    if (!mondayItem) {
      return NextResponse.json(
        { error: 'Client non trouvé dans Monday' },
        { status: 404 }
      )
    }

    // Transformer en format client
    const client = transformMondayToClient(mondayItem, columnToField)

    return NextResponse.json({
      client,
      source: 'monday',
    })

  } catch (error: any) {
    console.error('Erreur récupération client Monday:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de connexion à Monday' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Récupérer le mapping
    const { fieldToColumn } = await getMapping()

    // Construire l'objet columnValues pour Monday
    const columnValues: Record<string, any> = {}
    let newName: string | null = null

    for (const [field, value] of Object.entries(body)) {
      // Cas spécial: le nom (raison_sociale) est géré séparément
      if (field === 'raison_sociale' || field === 'name') {
        newName = String(value)
        continue
      }

      // Ignorer les champs système
      if (['id', 'monday_item_id', 'created_at', 'updated_at', 'source'].includes(field)) {
        continue
      }

      // Trouver le mapping pour ce champ
      const mapping = fieldToColumn[field]
      if (mapping) {
        columnValues[mapping.columnId] = value
      }
    }

    // 1. Mettre à jour le nom si changé
    if (newName) {
      const nameResult = await updateMondayItemName(Number(id), newName)
      if (!nameResult.success) {
        console.error('Erreur mise à jour nom:', nameResult.error)
      }
    }

    // 2. Mettre à jour les autres colonnes
    if (Object.keys(columnValues).length > 0) {
      const result = await updateMondayItem(Number(id), columnValues)
      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Erreur mise à jour Monday' },
          { status: 500 }
        )
      }
    }

    // 3. Récupérer l'item mis à jour
    const { columnToField } = await getMapping()
    const updatedItem = await getMondayItemById(id)

    if (!updatedItem) {
      return NextResponse.json(
        { error: 'Erreur récupération item après mise à jour' },
        { status: 500 }
      )
    }

    const client = transformMondayToClient(updatedItem, columnToField)

    return NextResponse.json({
      success: true,
      client,
      source: 'monday',
    })

  } catch (error: any) {
    console.error('Erreur mise à jour client Monday:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de mise à jour Monday' },
      { status: 500 }
    )
  }
}
