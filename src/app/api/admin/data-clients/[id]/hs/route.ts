import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * POST /api/admin/data-clients/[id]/hs
 * Marque un data_client comme HS.
 * Doctrine : un client HS RESTE dans data_clients (statut_data='HS'). Il ne revient PAS
 * dans l'espace actif `clients`. On met donc simplement a jour la ligne data_clients
 * existante (UPDATE), au lieu de recreer un client dans `clients`.
 * Body: { comment: string } (obligatoire)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(['super_admin', 'admin'])
    if (isAuthError(authResult)) return authResult

    const { id } = await params
    const { comment } = await request.json()

    if (!comment?.trim()) {
      return NextResponse.json({ error: 'Commentaire obligatoire pour passer en HS' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Recuperer le data_client
    const { data: dc, error: fetchError } = await adminClient
      .from('data_clients')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !dc) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const userName = authResult.email || 'Admin'
    const logEntry = `[HS ${new Date().toLocaleDateString('fr-FR')} par ${userName}] ${comment.trim()}`
    const existingNotes = dc.notes_internes ? dc.notes_internes + '\n' : ''

    // Doctrine : un HS reste dans data_clients. On met simplement a jour le statut_data
    // de la ligne existante, sans recreer de client dans l'espace actif `clients`.
    const { error: updateError } = await adminClient
      .from('data_clients')
      .update({
        statut_data: 'HS',
        motif_retour: comment.trim(),
        retour_par: authResult.id,
        retour_at: now,
        notes_internes: existingNotes + logEntry,
      })
      .eq('id', dc.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `${dc.raison_sociale} passe en HS`,
    })
  } catch (error: any) {
    console.error('Erreur POST /api/admin/data-clients/[id]/hs:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
