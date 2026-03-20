import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * POST /api/admin/data-clients/[id]/hs
 * Met un data_client directement en client_hs
 * Le client est cree dans clients avec statut client_hs puis supprime de data_clients
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

    // Inserer dans clients avec statut client_hs
    const { error: insertError } = await adminClient
      .from('clients')
      .insert({
        raison_sociale: dc.raison_sociale,
        siret: dc.siret,
        reference_retina: dc.reference_retina,
        contact_nom: dc.contact_nom,
        contact_prenom: dc.contact_prenom,
        email_beneficiaire: dc.email_beneficiaire,
        telephone: dc.telephone,
        adresse_societe_ligne1: dc.adresse_societe_ligne1,
        adresse_societe_ligne2: dc.adresse_societe_ligne2,
        adresse_societe_cp: dc.adresse_societe_cp,
        adresse_societe_ville: dc.adresse_societe_ville,
        departement: dc.departement,
        latitude: dc.latitude,
        longitude: dc.longitude,
        velo_devis: dc.velo_devis,
        velo_valide: dc.velo_valide,
        monday_board_id: dc.monday_board_id,
        monday_item_id: dc.monday_item_id,
        commercial_assigne: dc.commercial_assigne,
        code_ape: dc.code_ape,
        validation_naf: dc.validation_naf,
        statut_commercial: 'client_hs',
        date_statut: now,
        notes_internes: logEntry,
      })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Supprimer de data_clients
    await adminClient.from('data_clients').delete().eq('id', dc.id)

    return NextResponse.json({
      success: true,
      message: `${dc.raison_sociale} passe en HS`,
    })
  } catch (error: any) {
    console.error('Erreur POST /api/admin/data-clients/[id]/hs:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
