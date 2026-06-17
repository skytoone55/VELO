import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * POST /api/admin/clients/[id]/to-data
 * Renvoyer un client vers data_clients
 * Body: { comment: string (obligatoire), statut_data?: 'HS' | 'retour_client' | 'en_attente' }
 * Si statut_data est fourni, il prime ; sinon fallback sur le mapping derive du statut_commercial.
 * Nettoie les livraisons et FNUCI associes
 */
const ALLOWED_STATUT_DATA = ['HS', 'retour_client', 'en_attente'] as const

// Multi-tenant : certaines tables auxiliaires existent sur une base (Ecovolt) mais
// pas sur l'autre (PPE) — ex. webhook_logs. PostgREST renvoie alors PGRST205
// ("Could not find the table 'public.X' in the schema cache"). Dans ce cas la table
// n'a tout simplement rien a nettoyer : on ignore l'erreur au lieu de bloquer la bascule.
const isMissingTableError = (e: { code?: string; message?: string } | null | undefined): boolean =>
  !!e && (e.code === 'PGRST205' || /Could not find the table|schema cache/i.test(e.message || ''))

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(['super_admin', 'admin'])
    if (isAuthError(authResult)) return authResult

    const { id } = await params
    const { comment, statut_data: statutDataInput } = await request.json()

    if (!comment?.trim()) {
      return NextResponse.json({ error: 'Commentaire obligatoire pour renvoyer vers Data' }, { status: 400 })
    }

    if (statutDataInput !== undefined && !ALLOWED_STATUT_DATA.includes(statutDataInput)) {
      return NextResponse.json(
        { error: `statut_data invalide (valeurs autorisees : ${ALLOWED_STATUT_DATA.join(', ')})` },
        { status: 400 }
      )
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
    const effectiveStatut = statutDataInput ?? (client.statut_commercial === 'client_hs' ? 'HS' : 'retour_client')
    const logLabel = effectiveStatut === 'HS' ? 'HS' : 'Retour Data'
    const logEntry = `[${logLabel} ${new Date().toLocaleDateString('fr-FR')} par ${userName}] ${comment.trim()}`
    const existingNotes = client.notes_internes ? client.notes_internes + '\n' : ''

    const { data: insertedDataClient, error: insertError } = await adminClient
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
        // Report du statut : statut_data explicite prime (ex. bouton "Client HS" envoie 'HS').
        // Sinon fallback : un client HS reste HS dans Data Client (definitivement mort),
        // les autres arrivent en retour_client (susceptibles de revenir).
        statut_data: effectiveStatut,
        motif_retour: comment.trim(),
        retour_par: authResult.id,
        retour_at: now,
        notes_internes: existingNotes + logEntry,
      })
      .select('id')
      .single()

    if (insertError || !insertedDataClient) {
      return NextResponse.json({ error: insertError?.message || 'Echec insertion data_clients' }, { status: 500 })
    }

    // Helper de rollback : retire la ligne data_clients qu'on vient d'inserer
    // pour ne jamais laisser le client en double si la suppression echoue ensuite.
    const rollbackDataClient = async () => {
      await adminClient.from('data_clients').delete().eq('id', insertedDataClient.id)
    }

    // Nettoyer les FK RESTRICTIVES (NO ACTION) qui bloqueraient le DELETE du client.
    // Les FK CASCADE (livraisons, clients_hors_zone, distances_cache, formulaires_log,
    // user_societes) et SET NULL (fnuci, deja libere ci-dessus) se gerent automatiquement.
    //
    // - webhook_logs : logs transients -> suppression OK
    // - codes_enemat / email_alerts / sync_monday_log : nullable -> on detache (client_id=null)
    // - enemat_history : historique a CONSERVER -> on detache (client_id=null), colonne rendue
    //   nullable par migration pour permettre le detachement sans perdre l'historique.
    const { error: webhookDelError } = await adminClient
      .from('webhook_logs')
      .delete()
      .eq('client_id', id)
    // Table absente sur cette base (ex. PPE) -> rien a nettoyer, on continue.
    if (webhookDelError && !isMissingTableError(webhookDelError)) {
      await rollbackDataClient()
      return NextResponse.json(
        { error: `Echec nettoyage webhook_logs : ${webhookDelError.message}` },
        { status: 500 }
      )
    }

    const detachTables = ['enemat_history', 'codes_enemat', 'email_alerts', 'sync_monday_log'] as const
    for (const table of detachTables) {
      const { error: detachError } = await adminClient
        .from(table)
        .update({ client_id: null })
        .eq('client_id', id)
      // Table absente sur cette base -> rien a detacher, on continue.
      if (detachError && !isMissingTableError(detachError)) {
        await rollbackDataClient()
        return NextResponse.json(
          { error: `Echec detachement ${table} : ${detachError.message}` },
          { status: 500 }
        )
      }
    }

    // Supprimer de clients et VERIFIER que la suppression a reussi.
    const { error: deleteError } = await adminClient
      .from('clients')
      .delete()
      .eq('id', id)
    if (deleteError) {
      await rollbackDataClient()
      return NextResponse.json(
        { error: `Echec suppression du client : ${deleteError.message}` },
        { status: 500 }
      )
    }

    // Garde-fou : confirmer que le client n'existe plus (FK restrictive residuelle imprevue).
    const { data: stillThere } = await adminClient
      .from('clients')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (stillThere) {
      await rollbackDataClient()
      return NextResponse.json(
        { error: 'Le client n\'a pas pu etre supprime (reference bloquante residuelle). Aucun doublon cree.' },
        { status: 500 }
      )
    }

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
