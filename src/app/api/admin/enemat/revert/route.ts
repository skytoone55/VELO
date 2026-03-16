import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError, type AuthenticatedUser } from '@/lib/auth/require-role'

/**
 * POST /api/admin/enemat/revert
 * Renvoie des clients en contrôle CQ (sans les retirer d'ENEMAT ni de Livraisons).
 * Reset toutes les cases CQ + commentaire obligatoire.
 * Body : { client_ids: string[], commentaire: string }
 * Acces : super_admin uniquement.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin'])
    if (isAuthError(auth)) return auth
    const currentUser = auth as AuthenticatedUser

    const body = await request.json()
    const { client_ids, commentaire } = body as { client_ids: string[]; commentaire: string }

    if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
      return NextResponse.json({ error: 'client_ids requis (tableau non vide)' }, { status: 400 })
    }

    if (!commentaire || commentaire.trim().length === 0) {
      return NextResponse.json({ error: 'Un commentaire est obligatoire pour le renvoi en contrôle' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()

    // Reset TOUTES les cases CQ + commentaire sur les livraisons de ces clients
    const { data: updatedLivraisons, error: livError } = await supabase
      .from('livraisons')
      .update({
        cq_valide: false,
        cq_valide_at: null,
        cq_valide_par: null,
        cq_en_cours: false,
        cq_piece_identite: false,
        cq_photo_enemat: false,
        cq_signature_installateur: false,
        cq_signature_client: false,
        cq_fnuci: false,
        cq_velo: false,
        cq_commentaire: commentaire.trim(),
        reactivated_at: now,
        updated_at: now,
      })
      .in('client_id', client_ids)
      .eq('statut', 'livree')
      .select('id, client_id')

    if (livError) {
      console.error('Erreur POST /api/admin/enemat/revert (livraisons):', livError)
      return NextResponse.json({ error: livError.message }, { status: 500 })
    }

    const affectedClientIds = [...new Set((updatedLivraisons || []).map((l: { client_id: string }) => l.client_id))]

    // Historique ENEMAT
    if (affectedClientIds.length > 0) {
      const historyRows = affectedClientIds.map((clientId: string) => ({
        client_id: clientId,
        statut_avant: 'cq_valide',
        statut_apres: 'renvoi_controle',
        changed_by: currentUser.id,
        changed_at: now,
        notes: commentaire.trim(),
      }))

      await supabase.from('enemat_history').insert(historyRows)
    }

    return NextResponse.json({
      success: true,
      count: affectedClientIds.length,
      client_ids: affectedClientIds,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur POST /api/admin/enemat/revert:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
