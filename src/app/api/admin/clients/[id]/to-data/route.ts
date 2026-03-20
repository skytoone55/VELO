import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * POST /api/admin/clients/[id]/to-data
 * Renvoyer un client vers data_clients
 * Body: { comment: string } (obligatoire)
 * Nettoie les livraisons et FNUCI associes
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
      return NextResponse.json({ error: 'Commentaire obligatoire pour renvoyer vers Data' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Recuperer le client
    const { data: client, error: fetchError } = await adminClient
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !client) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const userName = authResult.email || 'Admin'

    // Annuler les livraisons en cours
    const { data: livraisons } = await adminClient
      .from('livraisons')
      .select('id, statut')
      .eq('client_id', id)
      .not('statut', 'eq', 'annulee')

    let livraisonsAnnulees = 0
    if (livraisons?.length) {
      const { error: livError } = await adminClient
        .from('livraisons')
        .update({ statut: 'annulee', updated_at: now })
        .eq('client_id', id)
        .not('statut', 'eq', 'annulee')

      if (!livError) livraisonsAnnulees = livraisons.length
    }

    // Liberer les FNUCI
    let fnuciLiberes = 0
    const { data: fnucis } = await adminClient
      .from('fnuci')
      .select('id')
      .eq('client_id', id)

    if (fnucis?.length) {
      await adminClient
        .from('fnuci')
        .update({ client_id: null, livraison_id: null, statut: 'disponible', attribue_at: null, distribue_at: null })
        .eq('client_id', id)
      fnuciLiberes = fnucis.length
    }

    // Inserer dans data_clients
    const logEntry = `[Retour Data ${new Date().toLocaleDateString('fr-FR')} par ${userName}] ${comment.trim()}`
    const existingNotes = client.notes_internes ? client.notes_internes + '\n' : ''

    const { error: insertError } = await adminClient
      .from('data_clients')
      .insert({
        raison_sociale: client.raison_sociale,
        siret: client.siret,
        reference_retina: client.reference_retina,
        contact_nom: client.contact_nom,
        contact_prenom: client.contact_prenom,
        email_beneficiaire: client.email_beneficiaire,
        telephone: client.telephone,
        adresse_societe_ligne1: client.adresse_societe_ligne1,
        adresse_societe_ligne2: client.adresse_societe_ligne2,
        adresse_societe_cp: client.adresse_societe_cp,
        adresse_societe_ville: client.adresse_societe_ville,
        departement: client.departement,
        latitude: client.latitude,
        longitude: client.longitude,
        velo_devis: client.velo_devis,
        velo_valide: client.velo_valide,
        monday_board_id: client.monday_board_id,
        monday_item_id: client.monday_item_id,
        commercial_assigne: client.commercial_assigne,
        code_ape: client.code_ape,
        validation_naf: client.validation_naf,
        statut_data: 'retour_client',
        motif_retour: comment.trim(),
        retour_par: authResult.id,
        retour_at: now,
        notes_internes: existingNotes + logEntry,
      })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Supprimer de clients
    await adminClient.from('clients').delete().eq('id', id)

    return NextResponse.json({
      success: true,
      livraisonsAnnulees,
      fnuciLiberes,
      message: `${client.raison_sociale} renvoye vers Data Client`,
    })
  } catch (error: any) {
    console.error('Erreur POST /api/admin/clients/[id]/to-data:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
