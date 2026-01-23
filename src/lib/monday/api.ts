/**
 * Monday.com API - Lecture et Écriture directe
 * Monday est la SOURCE DE VÉRITÉ UNIQUE
 */

import { MONDAY_CONFIG, getMondayApiKey } from './config'

interface MondayMutationResult {
  success: boolean
  itemId?: number
  error?: string
}

// Types pour les items Monday
export interface MondayColumnValue {
  id: string
  text: string
  value: string | null
  type: string
}

export interface MondayItem {
  id: string
  name: string
  column_values: MondayColumnValue[]
  created_at?: string
  updated_at?: string
}

async function executeMondayQuery(query: string): Promise<any> {
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
    body: JSON.stringify({ query }),
  })

  const data = await response.json()

  if (data.errors) {
    console.error('Monday API Error:', data.errors)
    throw new Error(data.errors[0]?.message || 'Erreur API Monday')
  }

  return data.data
}

// Alias pour rétrocompatibilité
const executeMondayMutation = executeMondayQuery

/**
 * LECTURE - Récupérer TOUS les items (clients) du board Monday avec pagination
 * Monday limite à 500 items par requête, donc on pagine automatiquement
 */
export async function getMondayItems(): Promise<MondayItem[]> {
  const boardId = MONDAY_CONFIG.boardIds.clients
  const allItems: MondayItem[] = []
  let cursor: string | null = null
  const pageSize = 500 // Maximum autorisé par Monday

  do {
    const cursorParam = cursor ? `, cursor: "${cursor}"` : ''
    const query = `
      query {
        boards(ids: [${boardId}]) {
          items_page(limit: ${pageSize}${cursorParam}) {
            cursor
            items {
              id
              name
              created_at
              updated_at
              column_values {
                id
                text
                value
                type
              }
            }
          }
        }
      }
    `

    const data = await executeMondayQuery(query)
    const itemsPage = data.boards?.[0]?.items_page

    if (itemsPage?.items) {
      allItems.push(...itemsPage.items)
    }

    // Récupérer le cursor pour la page suivante
    cursor = itemsPage?.cursor || null

    console.log(`📦 Monday: ${allItems.length} clients chargés...`)

  } while (cursor) // Continuer tant qu'il y a un cursor (= plus de pages)

  console.log(`✅ Monday: Total ${allItems.length} clients récupérés`)
  return allItems
}

/**
 * LECTURE - Récupérer un item spécifique par son ID Monday
 */
export async function getMondayItemById(itemId: string | number): Promise<MondayItem | null> {
  const query = `
    query {
      items(ids: [${itemId}]) {
        id
        name
        created_at
        updated_at
        column_values {
          id
          text
          value
          type
        }
      }
    }
  `

  const data = await executeMondayQuery(query)
  return data.items?.[0] || null
}

/**
 * Parser une valeur Monday vers le format interface
 */
export function parseValueFromMonday(
  columnType: string,
  textValue: string | null,
  rawValue: string | null
): any {
  if (!textValue && !rawValue) return null

  switch (columnType) {
    case 'numeric':
    case 'numbers':
      return textValue ? Number(textValue) : null

    case 'checkbox':
      if (rawValue) {
        try {
          const parsed = JSON.parse(rawValue)
          return parsed.checked === 'true'
        } catch {
          return false
        }
      }
      return false

    case 'date':
      if (rawValue) {
        try {
          const parsed = JSON.parse(rawValue)
          return parsed.date || null
        } catch {
          return textValue || null
        }
      }
      return textValue || null

    case 'link':
      if (rawValue) {
        try {
          const parsed = JSON.parse(rawValue)
          return parsed.url || textValue
        } catch {
          return textValue
        }
      }
      return textValue

    default:
      return textValue || null
  }
}

export function formatValueForMonday(columnId: string, value: any): string {
  if (value === null || value === undefined) return ''

  if (columnId === 'status') {
    return JSON.stringify({ label: String(value) })
  }
  if (columnId === 'date') {
    const dateStr = value instanceof Date
      ? value.toISOString().split('T')[0]
      : typeof value === 'string' && value.includes('T')
        ? value.split('T')[0]
        : String(value)
    return JSON.stringify({ date: dateStr })
  }
  if (columnId === 'numbers' || columnId === 'numbers1') {
    return JSON.stringify(Number(value) || 0)
  }
  if (columnId === 'email') {
    return JSON.stringify({ email: String(value), text: String(value) })
  }
  if (columnId === 'phone') {
    return JSON.stringify({ phone: String(value), countryShortName: 'FR' })
  }
  if (columnId === 'dropdown') {
    return JSON.stringify({ labels: [String(value)] })
  }
  return JSON.stringify(String(value))
}

export async function updateMondayItem(
  itemId: number,
  columnValues: Record<string, any>
): Promise<MondayMutationResult> {
  try {
    const boardId = MONDAY_CONFIG.boardIds.clients
    if (!boardId) throw new Error('Board ID Monday non configuré')

    const formattedValues: Record<string, string> = {}
    for (const [columnId, value] of Object.entries(columnValues)) {
      if (value !== null && value !== undefined && value !== '') {
        formattedValues[columnId] = formatValueForMonday(columnId, value)
      }
    }

    if (Object.keys(formattedValues).length === 0) {
      return { success: true, itemId }
    }

    const columnValuesJson = JSON.stringify(formattedValues).replace(/"/g, '\\"')
    const mutation = `mutation { change_multiple_column_values(board_id: ${boardId}, item_id: ${itemId}, column_values: "${columnValuesJson}") { id } }`

    const result = await executeMondayMutation(mutation)
    return { success: true, itemId: parseInt(result.change_multiple_column_values.id) }
  } catch (error: any) {
    console.error('Error updating Monday item:', error)
    return { success: false, error: error.message || 'Erreur de mise à jour Monday' }
  }
}

export async function updateMondayItemName(
  itemId: number,
  newName: string
): Promise<MondayMutationResult> {
  try {
    const boardId = MONDAY_CONFIG.boardIds.clients
    const escapedName = newName.replace(/"/g, '\\"')
    const mutation = `mutation { change_simple_column_value(board_id: ${boardId}, item_id: ${itemId}, column_id: "name", value: "${escapedName}") { id } }`
    const result = await executeMondayMutation(mutation)
    return { success: true, itemId: parseInt(result.change_simple_column_value.id) }
  } catch (error: any) {
    console.error('Error updating Monday item name:', error)
    return { success: false, error: error.message || 'Erreur de mise à jour du nom Monday' }
  }
}

export async function createMondayItem(
  itemName: string,
  columnValues?: Record<string, any>
): Promise<MondayMutationResult> {
  try {
    const boardId = MONDAY_CONFIG.boardIds.clients
    if (!boardId) throw new Error('Board ID Monday non configuré')

    const escapedName = itemName.replace(/"/g, '\\"')
    let colValuesStr = ''

    if (columnValues && Object.keys(columnValues).length > 0) {
      const formattedValues: Record<string, string> = {}
      for (const [columnId, value] of Object.entries(columnValues)) {
        if (value !== null && value !== undefined && value !== '') {
          formattedValues[columnId] = formatValueForMonday(columnId, value)
        }
      }
      colValuesStr = `, column_values: "${JSON.stringify(formattedValues).replace(/"/g, '\\"')}"`
    }

    const mutation = `mutation { create_item(board_id: ${boardId}, item_name: "${escapedName}"${colValuesStr}) { id } }`
    const result = await executeMondayMutation(mutation)
    return { success: true, itemId: parseInt(result.create_item.id) }
  } catch (error: any) {
    console.error('Error creating Monday item:', error)
    return { success: false, error: error.message || 'Erreur de création Monday' }
  }
}

/**
 * Créer une nouvelle colonne dans un board Monday
 */
export async function createMondayColumn(
  title: string,
  columnType: 'text' | 'date' | 'numbers' | 'status' | 'checkbox' = 'text',
  description?: string
): Promise<{ success: boolean; columnId?: string; error?: string }> {
  try {
    const boardId = MONDAY_CONFIG.boardIds.clients
    if (!boardId) throw new Error('Board ID Monday non configuré')

    const escapedTitle = title.replace(/"/g, '\\"')
    const descPart = description ? `, description: "${description.replace(/"/g, '\\"')}"` : ''

    const mutation = `mutation { create_column(board_id: ${boardId}, title: "${escapedTitle}", column_type: ${columnType}${descPart}) { id title } }`
    const result = await executeMondayQuery(mutation)

    console.log(`✅ Colonne créée dans Monday: ${result.create_column.title} (ID: ${result.create_column.id})`)
    return { success: true, columnId: result.create_column.id }
  } catch (error: any) {
    console.error('Error creating Monday column:', error)
    return { success: false, error: error.message || 'Erreur de création colonne Monday' }
  }
}

/**
 * Vérifier si Monday est configuré
 */
export function isMondayConfigured(): boolean {
  return !!(
    process.env.MONDAY_API_KEY &&
    MONDAY_CONFIG.boardIds.clients
  )
}

/**
 * Synchroniser un client Supabase vers Monday
 * @param client Objet partiel du client avec monday_item_id et les champs à sync
 * @param fieldsToSync Liste des champs Supabase à synchroniser (optionnel, tous si non spécifié)
 */
export async function syncClientToMonday(
  client: { monday_item_id: string | number } & Record<string, any>,
  fieldsToSync?: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!client.monday_item_id) {
      return { success: false, error: 'monday_item_id manquant' }
    }

    const itemId = typeof client.monday_item_id === 'string'
      ? parseInt(client.monday_item_id)
      : client.monday_item_id

    // Mapper les champs Supabase vers Monday
    const columnValues: Record<string, any> = {}
    const mapping = MONDAY_CONFIG.supabaseToMondayMapping as Record<string, string>

    for (const [supabaseField, mondayColumnId] of Object.entries(mapping)) {
      // Si fieldsToSync est spécifié, ne syncer que ces champs
      if (fieldsToSync && !fieldsToSync.includes(supabaseField)) {
        continue
      }

      if (client[supabaseField] !== undefined) {
        columnValues[mondayColumnId] = client[supabaseField]
      }
    }

    if (Object.keys(columnValues).length === 0) {
      return { success: true } // Rien à sync
    }

    const result = await updateMondayItem(itemId, columnValues)
    return result
  } catch (error: any) {
    console.error('Erreur syncClientToMonday:', error)
    return { success: false, error: error.message }
  }
}
