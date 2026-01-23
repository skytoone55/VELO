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
 * Exécuter une mutation Monday avec des variables GraphQL
 * C'est la méthode recommandée pour éviter les problèmes d'échappement
 */
async function executeMondayMutationWithVariables(query: string, variables: Record<string, any>): Promise<any> {
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

/**
 * Formate une valeur pour l'API Monday
 * Retourne l'objet/valeur directement (pas JSON stringifié)
 * Le JSON.stringify sera fait dans updateMondayItem
 */
export function formatValueForMonday(columnId: string, value: any): any {
  if (value === null || value === undefined) return null

  // Si la valeur est déjà un objet avec 'label', ne pas re-formatter (status/color)
  if (typeof value === 'object' && value !== null && 'label' in value) {
    return value
  }
  // Si la valeur est déjà un objet avec 'date', ne pas re-formatter
  if (typeof value === 'object' && value !== null && 'date' in value) {
    return value
  }
  // Si la valeur est déjà un objet avec 'email', ne pas re-formatter
  if (typeof value === 'object' && value !== null && 'email' in value) {
    return value
  }

  // Colonnes de type status/color (commencent par color_)
  if (columnId.startsWith('color_')) {
    return { label: String(value) }
  }
  // Colonnes de type date
  if (columnId.startsWith('date_') || columnId === 'date') {
    const dateStr = value instanceof Date
      ? value.toISOString().split('T')[0]
      : typeof value === 'string' && value.includes('T')
        ? value.split('T')[0]
        : String(value)
    return { date: dateStr }
  }
  // Colonnes numériques
  if (columnId.startsWith('numeric_') || columnId === 'numbers' || columnId === 'numbers1') {
    return String(Number(value) || 0)
  }
  // Colonnes email
  if (columnId.startsWith('email_') || columnId === 'email') {
    return { email: String(value), text: String(value) }
  }
  // Colonnes téléphone (long_text pour téléphone dans ce cas)
  if (columnId.startsWith('phone_')) {
    return { phone: String(value), countryShortName: 'FR' }
  }
  // Colonnes dropdown
  if (columnId === 'dropdown') {
    return { labels: [String(value)] }
  }
  // Colonnes texte (text_, long_text_, ou autres)
  return String(value)
}

export async function updateMondayItem(
  itemId: number | string,
  columnValues: Record<string, any>
): Promise<MondayMutationResult> {
  try {
    const boardId = MONDAY_CONFIG.boardIds.clients
    if (!boardId) throw new Error('Board ID Monday non configuré')

    const itemIdStr = String(itemId)

    // Séparer le champ "name" (colonne spéciale) des autres colonnes
    const nameValue = columnValues['name']
    const otherColumns = { ...columnValues }
    delete otherColumns['name']

    const formattedValues: Record<string, any> = {}
    for (const [columnId, value] of Object.entries(otherColumns)) {
      if (value !== null && value !== undefined && value !== '') {
        const formatted = formatValueForMonday(columnId, value)
        console.log(`updateMondayItem - formatting ${columnId}:`, { input: value, output: formatted })
        if (formatted !== null) {
          // NE PAS stringify ici - le JSON.stringify final s'en chargera
          formattedValues[columnId] = formatted
        }
      }
    }

    console.log('updateMondayItem - final formattedValues:', JSON.stringify(formattedValues))

    // Mettre à jour les colonnes normales avec des variables GraphQL
    if (Object.keys(formattedValues).length > 0) {
      const mutation = `
        mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
          change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
            id
          }
        }
      `
      const variables = {
        boardId: boardId,
        itemId: itemIdStr,
        columnValues: JSON.stringify(formattedValues)
      }
      console.log('updateMondayItem - sending to Monday:', JSON.stringify(variables))
      await executeMondayMutationWithVariables(mutation, variables)
    }

    // Mettre à jour le nom séparément si fourni (utilise change_simple_column_value avec type String)
    if (nameValue) {
      const mutation = `
        mutation ($boardId: ID!, $itemId: ID!, $value: String!) {
          change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: "name", value: $value) {
            id
          }
        }
      `
      const variables = {
        boardId: boardId,
        itemId: itemIdStr,
        value: String(nameValue)
      }
      await executeMondayMutationWithVariables(mutation, variables)
    }

    return { success: true, itemId: typeof itemId === 'number' ? itemId : parseInt(itemIdStr) }
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
      const formattedValues: Record<string, any> = {}
      for (const [columnId, value] of Object.entries(columnValues)) {
        if (value !== null && value !== undefined && value !== '') {
          const formatted = formatValueForMonday(columnId, value)
          if (formatted !== null) {
            formattedValues[columnId] = typeof formatted === 'object'
              ? JSON.stringify(formatted)
              : formatted
          }
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
 * Détermine quels champs ont été modifiés entre deux versions du client
 * Utilise les mappings DYNAMIQUES depuis la base de données
 */
export async function getChangedFields(
  oldClient: Record<string, any>,
  newClient: Record<string, any>
): Promise<string[]> {
  const { getSupabaseToMondayMapping } = await import('./dynamic-mapping')
  const mapping = await getSupabaseToMondayMapping()
  const changedFields: string[] = []

  for (const field of Object.keys(mapping)) {
    // IMPORTANT: Ne comparer que les champs présents dans newClient (les champs qu'on veut modifier)
    // Si le champ n'est pas dans newClient, on ne le considère pas comme modifié
    if (!(field in newClient)) {
      continue
    }

    const oldValue = oldClient[field]
    const newValue = newClient[field]

    // Comparer les valeurs (gérer null/undefined)
    if (oldValue !== newValue) {
      if (oldValue == null && newValue == null) continue
      changedFields.push(field)
    }
  }

  return changedFields
}

/**
 * Synchroniser un client Supabase vers Monday
 * Utilise les mappings DYNAMIQUES depuis la base de données
 *
 * @param client Objet partiel du client avec monday_item_id et les champs à sync
 * @param fieldsToSync Liste des champs Supabase à synchroniser (optionnel, tous si non spécifié)
 */
export async function syncClientToMonday(
  client: { monday_item_id: string | number } & Record<string, any>,
  fieldsToSync?: string[]
): Promise<{ success: boolean; error?: string }> {
  // Import dynamique pour éviter les dépendances circulaires
  const { getSupabaseToMondayMapping, convertValueToMonday } = await import('./dynamic-mapping')

  try {
    if (!client.monday_item_id) {
      return { success: false, error: 'monday_item_id manquant' }
    }

    // Garder l'ID en string pour éviter les pertes de précision
    const itemId = String(client.monday_item_id)

    // Charger le mapping dynamique depuis la base
    const mapping = await getSupabaseToMondayMapping()

    // DEBUG: Log le mapping pour statut_commercial
    console.log('syncClientToMonday - fieldsToSync:', fieldsToSync)
    console.log('syncClientToMonday - mapping statut_commercial:', mapping['statut_commercial'])
    console.log('syncClientToMonday - client.statut_commercial:', client.statut_commercial)

    // Mapper les champs Supabase vers Monday
    const columnValues: Record<string, any> = {}

    for (const [supabaseField, mondayColumnId] of Object.entries(mapping)) {
      // Si fieldsToSync est spécifié, ne syncer que ces champs
      if (fieldsToSync && !fieldsToSync.includes(supabaseField)) {
        continue
      }

      const value = client[supabaseField]
      if (value === undefined) continue

      // Convertir la valeur selon le mapping de valeurs (ex: statuts)
      const mondayValue = await convertValueToMonday(supabaseField, value)

      // DEBUG: Log pour statut_commercial
      if (supabaseField === 'statut_commercial') {
        console.log('syncClientToMonday - statut_commercial:', {
          supabaseField,
          mondayColumnId,
          originalValue: value,
          convertedValue: mondayValue
        })
      }

      if (mondayValue !== null && mondayValue !== undefined) {
        columnValues[mondayColumnId] = mondayValue
      }
    }

    // DEBUG: Log les colonnes finales
    console.log('syncClientToMonday - columnValues to send:', JSON.stringify(columnValues))

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
