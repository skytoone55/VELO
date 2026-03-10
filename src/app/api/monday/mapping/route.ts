import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { invalidateMappingsCache } from '@/lib/monday/dynamic-mapping'
import { INTERFACE_FIELDS, INTERFACE_SECTIONS } from '@/lib/monday/interface-fields'
import { MONDAY_CONFIG } from '@/lib/monday/config'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * API pour g\u00e9rer le mapping des champs Monday
 * GET /api/monday/mapping?boardId=xxx - R\u00e9cup\u00e9rer tous les mappings (non-mapp\u00e9s + mapp\u00e9s)
 * POST /api/monday/mapping - Cr\u00e9er/Mettre \u00e0 jour un mapping (ou marquer "supabase_only")
 * DELETE /api/monday/mapping - Supprimer un mapping
 *
 * En multi-board, boardId est obligatoire pour GET/POST/DELETE
 * En single-board, les mappings ont board_id = NULL
 */

export async function GET(request: NextRequest) {
  const auth = await requireRole(['super_admin', 'admin'])
  if (isAuthError(auth)) return auth

  const adminClient = createAdminClient()

  try {
    const { searchParams } = new URL(request.url)
    const boardId = searchParams.get('boardId')

    // Construire la requ\u00eate avec filtre par board_id
    let query = adminClient
      .from('monday_field_mapping')
      .select('*')
      .order('interface_section', { ascending: true })

    if (boardId) {
      query = query.eq('board_id', boardId)
    } else if (!MONDAY_CONFIG.isMultiBoard) {
      // Single-board: charger les mappings sans board_id
      query = query.is('board_id', null)
    }
    // En multi-board sans boardId sp\u00e9cifi\u00e9, on charge tout (pour la vue d'ensemble)

    const { data: mappings, error } = await query

    if (error) throw error

    // Combiner avec la d\u00e9finition des champs interface
    // Statut: 'unmapped' = pas encore configur\u00e9, 'monday' = li\u00e9 \u00e0 Monday, 'supabase_only' = pas de sync Monday
    const result = INTERFACE_FIELDS.map(field => {
      const mapping = mappings?.find(m => m.interface_field === field.field)
      const hasMapping = !!mapping
      const isMondayMapped = hasMapping && !!mapping.monday_column_id
      const isSupabaseOnly = hasMapping && !mapping.monday_column_id

      return {
        ...field,
        monday_column_id: mapping?.monday_column_id || null,
        monday_column_title: mapping?.monday_column_title || null,
        monday_column_type: mapping?.monday_column_type || null,
        value_mapping: mapping?.value_mapping || {},
        board_id: mapping?.board_id || null,
        is_synced: isMondayMapped,
        mapping_status: isMondayMapped ? 'monday' : isSupabaseOnly ? 'supabase_only' : 'unmapped',
      }
    })

    return NextResponse.json({
      fields: result,
      sections: INTERFACE_SECTIONS,
      boardId: boardId || null,
      isMultiBoard: MONDAY_CONFIG.isMultiBoard,
    })

  } catch (error: any) {
    console.error('Erreur r\u00e9cup\u00e9ration mapping:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de r\u00e9cup\u00e9ration' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(['super_admin', 'admin'])
  if (isAuthError(auth)) return auth

  const adminClient = createAdminClient()

  try {
    const body = await request.json()
    const { interface_field, monday_column_id, monday_column_title, monday_column_type, value_mapping, supabase_only, boardId } = body

    if (!interface_field) {
      return NextResponse.json(
        { error: 'interface_field est requis' },
        { status: 400 }
      )
    }

    // En multi-board, boardId est recommand\u00e9
    if (MONDAY_CONFIG.isMultiBoard && !boardId) {
      console.warn('POST mapping en multi-board sans boardId - les mappings seront globaux')
    }

    // Trouver la d\u00e9finition du champ
    const fieldDef = INTERFACE_FIELDS.find(f => f.field === interface_field)
    if (!fieldDef) {
      return NextResponse.json(
        { error: 'Champ interface inconnu' },
        { status: 400 }
      )
    }

    // En multi-board, on ne peut pas utiliser onConflict avec l'index composite
    // car Supabase/PostgREST ne supporte pas COALESCE dans onConflict.
    // On fait donc un SELECT + INSERT/UPDATE manuellement.
    const mappingData = {
      interface_field,
      interface_label: fieldDef.label,
      interface_type: fieldDef.type,
      interface_section: fieldDef.section,
      monday_column_id: supabase_only ? null : (monday_column_id || null),
      monday_column_title: supabase_only ? null : (monday_column_title || null),
      monday_column_type: supabase_only ? null : (monday_column_type || null),
      value_mapping: value_mapping || {},
      is_required: fieldDef.required || false,
      is_synced: supabase_only ? false : !!monday_column_id,
      board_id: boardId || null,
      updated_at: new Date().toISOString(),
    }

    // Chercher si un mapping existe d\u00e9j\u00e0 pour ce champ + board
    let existingQuery = adminClient
      .from('monday_field_mapping')
      .select('id')
      .eq('interface_field', interface_field)

    if (boardId) {
      existingQuery = existingQuery.eq('board_id', boardId)
    } else {
      existingQuery = existingQuery.is('board_id', null)
    }

    const { data: existing } = await existingQuery.maybeSingle()

    let data
    let error

    if (existing) {
      // UPDATE
      const result = await adminClient
        .from('monday_field_mapping')
        .update(mappingData)
        .eq('id', existing.id)
        .select()
        .single()
      data = result.data
      error = result.error
    } else {
      // INSERT
      const result = await adminClient
        .from('monday_field_mapping')
        .insert(mappingData)
        .select()
        .single()
      data = result.data
      error = result.error
    }

    if (error) throw error

    // Invalider le cache des mappings pour que la sync utilise les nouvelles valeurs
    invalidateMappingsCache()

    return NextResponse.json({
      success: true,
      mapping: data,
    })

  } catch (error: any) {
    console.error('Erreur mise \u00e0 jour mapping:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de mise \u00e0 jour' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(['super_admin', 'admin'])
  if (isAuthError(auth)) return auth

  const adminClient = createAdminClient()

  try {
    const { searchParams } = new URL(request.url)
    const interface_field = searchParams.get('interface_field')
    const boardId = searchParams.get('boardId')

    if (!interface_field) {
      return NextResponse.json(
        { error: 'interface_field est requis' },
        { status: 400 }
      )
    }

    let query = adminClient
      .from('monday_field_mapping')
      .delete()
      .eq('interface_field', interface_field)

    // Filtrer par board_id (ou NULL en single-board)
    if (boardId) {
      query = query.eq('board_id', boardId)
    } else {
      query = query.is('board_id', null)
    }

    const { error } = await query

    if (error) throw error

    // Invalider le cache des mappings
    invalidateMappingsCache()

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Erreur suppression mapping:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de suppression' },
      { status: 500 }
    )
  }
}
