import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMondayToSupabaseMapping, convertValueToSupabase } from '@/lib/monday/dynamic-mapping'

/**
 * Webhook endpoint pour recevoir les événements Monday.com
 *
 * Board: Vélos Cargos - Général (ID: 9990833105)
 * Monday est la SOURCE DE VÉRITÉ (SSOT)
 *
 * Les mappings sont chargés DYNAMIQUEMENT depuis la table `monday_field_mapping`
 *
 * Monday envoie des webhooks pour:
 * - create_item: Nouvel item créé
 * - change_column_value: Valeur de colonne modifiée
 * - delete_item: Item supprimé
 * - change_name: Nom de l'item modifié
 *
 * POST /api/webhooks/monday
 */

interface MondayWebhookPayload {
  challenge?: string // Pour la vérification initiale du webhook
  event?: {
    type: string
    pulseId?: number // Item ID
    pulseName?: string // Item name
    boardId?: number
    columnId?: string
    columnTitle?: string
    value?: {
      label?: { text: string }
      value?: any
      text?: string
      name?: string
    }
    previousValue?: any
    userId?: number
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload: MondayWebhookPayload = await request.json()

    console.log('Monday webhook received:', JSON.stringify(payload, null, 2))

    // Challenge verification (Monday envoie ça lors de la configuration du webhook)
    if (payload.challenge) {
      console.log('Monday webhook challenge received')
      return NextResponse.json({ challenge: payload.challenge })
    }

    const event = payload.event
    if (!event) {
      return NextResponse.json({ success: true, message: 'No event' })
    }

    const adminClient = createAdminClient()
    const mondayItemId = event.pulseId

    if (!mondayItemId) {
      return NextResponse.json({ success: true, message: 'No item ID' })
    }

    // Log l'événement webhook
    await adminClient.from('sync_monday_log').insert({
      action: 'webhook_received',
      monday_item_id: mondayItemId,
      direction: 'monday_to_supabase',
      statut: 'pending',
      donnees_avant: payload,
    })

    switch (event.type) {
      case 'create_item':
        await handleCreateItem(adminClient, event)
        break

      case 'change_column_value':
      case 'update_column_value': // Monday envoie ce type
        await handleColumnChange(adminClient, event)
        break

      case 'change_name':
        await handleNameChange(adminClient, event)
        break

      case 'delete_item':
        await handleDeleteItem(adminClient, event)
        break

      default:
        console.log('Unhandled event type:', event.type)
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Monday webhook error:', error)
    return NextResponse.json(
      { error: error.message || 'Webhook processing error' },
      { status: 500 }
    )
  }
}

/**
 * Gère la création d'un nouvel item dans Monday
 */
async function handleCreateItem(adminClient: any, event: any) {
  const mondayItemId = event.pulseId
  const itemName = event.pulseName

  // Vérifier si le client existe déjà
  const { data: existing } = await adminClient
    .from('clients')
    .select('id')
    .eq('monday_item_id', mondayItemId)
    .single()

  if (existing) {
    console.log('Client already exists for Monday item:', mondayItemId)
    return
  }

  // Créer un nouveau client avec les infos de base
  // Les autres colonnes seront mises à jour via les webhooks change_column_value
  const { data: newClient, error } = await adminClient
    .from('clients')
    .insert({
      raison_sociale: itemName || 'Nouveau client',
      monday_item_id: mondayItemId,
      monday_sync_status: 'synced',
      monday_synced_at: new Date().toISOString(),
      statut_formulaire: 'en_attente',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating client from Monday:', error)
    await logSyncError(adminClient, mondayItemId, 'create_item', error.message)
    return
  }

  console.log('Created new client from Monday:', newClient.id)
  await logSyncSuccess(adminClient, mondayItemId, 'create_item', { clientId: newClient.id })
}

/**
 * Gère le changement d'une valeur de colonne
 * Utilise les mappings dynamiques depuis la base de données
 */
async function handleColumnChange(adminClient: any, event: any) {
  const mondayItemId = event.pulseId
  const columnId = event.columnId
  const value = event.value

  // Trouver le client correspondant
  const { data: client } = await adminClient
    .from('clients')
    .select('id')
    .eq('monday_item_id', mondayItemId)
    .single()

  if (!client) {
    console.log('No client found for Monday item:', mondayItemId)
    return
  }

  // Charger le mapping dynamique depuis la base
  const mondayToSupabaseMapping = await getMondayToSupabaseMapping()

  // Mapper la colonne Monday vers Supabase
  const supabaseColumn = mondayToSupabaseMapping[columnId]
  if (!supabaseColumn) {
    console.log('No mapping for Monday column:', columnId)
    return
  }

  // Extraire la valeur selon le type de colonne
  let rawValue = extractColumnValue(columnId, value)

  // Convertir la valeur selon le mapping de valeurs (ex: statuts)
  const supabaseValue = await convertValueToSupabase(supabaseColumn, rawValue)

  // Mettre à jour le client
  const updateData: Record<string, any> = {
    [supabaseColumn]: supabaseValue,
    monday_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error } = await adminClient
    .from('clients')
    .update(updateData)
    .eq('id', client.id)

  if (error) {
    console.error('Error updating client from Monday:', error)
    await logSyncError(adminClient, mondayItemId, 'change_column_value', error.message)
    return
  }

  console.log(`Updated client ${client.id}: ${supabaseColumn} = ${supabaseValue}`)
  await logSyncSuccess(adminClient, mondayItemId, 'change_column_value', {
    clientId: client.id,
    column: supabaseColumn,
    value: supabaseValue
  })
}

/**
 * Gère le changement de nom d'un item
 */
async function handleNameChange(adminClient: any, event: any) {
  const mondayItemId = event.pulseId
  const newName = event.value?.name || event.pulseName

  const { error } = await adminClient
    .from('clients')
    .update({
      raison_sociale: newName,
      monday_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('monday_item_id', mondayItemId)

  if (error) {
    console.error('Error updating client name from Monday:', error)
    await logSyncError(adminClient, mondayItemId, 'change_name', error.message)
    return
  }

  console.log(`Updated client name for Monday item ${mondayItemId}: ${newName}`)
  await logSyncSuccess(adminClient, mondayItemId, 'change_name', { newName })
}

/**
 * Gère la suppression d'un item (marque comme inactif dans Supabase)
 */
async function handleDeleteItem(adminClient: any, event: any) {
  const mondayItemId = event.pulseId

  // On ne supprime pas vraiment, on marque comme supprimé
  const { error } = await adminClient
    .from('clients')
    .update({
      monday_sync_status: 'deleted',
      monday_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('monday_item_id', mondayItemId)

  if (error) {
    console.error('Error marking client as deleted:', error)
    await logSyncError(adminClient, mondayItemId, 'delete_item', error.message)
    return
  }

  console.log(`Marked client as deleted for Monday item ${mondayItemId}`)
  await logSyncSuccess(adminClient, mondayItemId, 'delete_item', {})
}

/**
 * Extrait la valeur d'une colonne Monday selon son type
 */
function extractColumnValue(columnId: string, value: any): any {
  if (!value) return null

  // Status column
  if (value.label?.text) {
    return value.label.text
  }

  // Text/Email/Phone columns
  if (typeof value.text === 'string') {
    return value.text
  }

  // Name column
  if (typeof value.name === 'string') {
    return value.name
  }

  // Numbers column
  if (typeof value.value === 'number') {
    return value.value
  }

  // Date column
  if (value.date) {
    return value.date
  }

  // Dropdown column
  if (value.ids && Array.isArray(value.ids)) {
    // Retourne la première valeur si c'est un dropdown simple
    return value.text || null
  }

  // Fallback: essayer de parser le JSON
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed.text || parsed.value || parsed
    } catch {
      return value
    }
  }

  return value.text || value.value || null
}

/**
 * Log une erreur de sync
 */
async function logSyncError(adminClient: any, mondayItemId: number, action: string, errorMessage: string) {
  await adminClient.from('sync_monday_log').insert({
    action: `webhook_${action}`,
    monday_item_id: mondayItemId,
    direction: 'monday_to_supabase',
    statut: 'error',
    message_erreur: errorMessage,
  })
}

/**
 * Log un succès de sync
 */
async function logSyncSuccess(adminClient: any, mondayItemId: number, action: string, data: any) {
  await adminClient.from('sync_monday_log').insert({
    action: `webhook_${action}`,
    monday_item_id: mondayItemId,
    direction: 'monday_to_supabase',
    statut: 'success',
    donnees_apres: data,
  })
}

// GET pour vérifier que l'endpoint est actif
export async function GET() {
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/webhooks/monday',
    description: 'Monday.com webhook receiver - Monday is the source of truth',
  })
}
