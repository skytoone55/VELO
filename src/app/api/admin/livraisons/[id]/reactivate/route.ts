import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * POST /api/admin/livraisons/[id]/reactivate
 * Réactive un dossier livré+CQ validé pour re-contrôle (SAV)
 * Rôles : super_admin, admin uniquement
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(['super_admin', 'admin'])
    if (isAuthError(auth)) return auth

    const { id } = await params
    const body = await request.json()
    const comment = body.comment?.trim()

    if (!comment) {
      return NextResponse.json(
        { error: 'Un commentaire est obligatoire pour la réactivation SAV' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Vérifier que la livraison est bien livree + cq_valide
    const { data: livraison, error: fetchErr } = await supabase
      .from('livraisons')
      .select('id, statut, cq_valide, client_id')
      .eq('id', id)
      .single()

    if (fetchErr || !livraison) {
      return NextResponse.json({ error: 'Livraison introuvable' }, { status: 404 })
    }

    if (livraison.statut !== 'livree' || !livraison.cq_valide) {
      return NextResponse.json(
        { error: 'Seules les livraisons livrées avec CQ validé peuvent être réactivées' },
        { status: 400 }
      )
    }

    // Reset CQ + marquer réactivation
    const { error: updateErr } = await supabase
      .from('livraisons')
      .update({
        cq_piece_identite: false,
        cq_photo_enemat: false,
        cq_signature_installateur: false,
        cq_signature_client: false,
        cq_fnuci: false,
        cq_velo: false,
        cq_valide: false,
        cq_en_cours: false,
        cq_pris_par: null,
        cq_pris_at: null,
        cq_commentaire: comment,
        cq_alerte_envoyee: false,
        date_livraison_effective: new Date().toISOString(),
        reactivated_by: auth.id,
        reactivated_at: new Date().toISOString(),
        reactivation_comment: comment,
      })
      .eq('id', id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Audit trail via workflow_transitions
    await supabase.from('workflow_transitions').insert({
      livraison_id: id,
      client_id: livraison.client_id,
      from_status: 'cq_valide',
      to_status: 'cq_reactivated',
      triggered_by: auth.id,
      notes: `Réactivation SAV : ${comment}`,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erreur serveur' }, { status: 500 })
  }
}
