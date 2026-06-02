import { createAdminClient } from '@/lib/supabase/admin'

export interface PasserHSResult {
  livraisons_annulees: number
  fnuci_liberes: number
}

/**
 * Passe un client en "Client HS" : annule ses livraisons actives + reset CQ,
 * libere les FNUCI, journalise le motif dans notes_internes.
 *
 * Logique partagee entre :
 *  - POST /api/admin/clients/[id]/hs        (bouton fiche client, admin only)
 *  - POST /api/admin/planning/livraison-action (bouton "Retractation" livreur)
 *
 * Ne fait PAS de controle de role : l'appelant est responsable de l'auth.
 */
export async function passerClientHS(
  adminClient: ReturnType<typeof createAdminClient>,
  clientId: string,
  comment: string,
  actorName: string,
  prefixe = 'HS'
): Promise<PasserHSResult> {
  const { data: client, error: clientError } = await adminClient
    .from('clients')
    .select('id, raison_sociale, statut_commercial, fnuci_ids, notes_internes')
    .eq('id', clientId)
    .single()

  if (clientError || !client) {
    throw new Error('Client non trouve')
  }

  const now = new Date().toISOString()
  const logEntry = `[${prefixe} ${new Date().toLocaleDateString('fr-FR')} par ${actorName}] ${comment.trim()}`
  const existingNotes = client.notes_internes ? client.notes_internes + '\n' : ''

  // 1. Annuler les livraisons actives + reset CQ
  const { data: activeLivraisons } = await adminClient
    .from('livraisons')
    .select('id, statut')
    .eq('client_id', clientId)
    .not('statut', 'in', '("annulee","retractation")')

  if (activeLivraisons && activeLivraisons.length > 0) {
    const livraisonIds = activeLivraisons.map(l => l.id)
    await adminClient
      .from('livraisons')
      .update({
        statut: 'annulee',
        cq_valide: false,
        cq_en_cours: false,
        cq_piece_identite: false,
        cq_photo_enemat: false,
        cq_signature_installateur: false,
        cq_signature_client: false,
        cq_fnuci: false,
        cq_velo: false,
        cq_valide_par: null,
        cq_valide_at: null,
        cq_pris_par: null,
        cq_pris_at: null,
        cq_commentaire: null,
        updated_at: now,
      })
      .in('id', livraisonIds)
  }

  // 2. Liberer les FNUCI
  const hasFnuci = client.fnuci_ids && Array.isArray(client.fnuci_ids) && client.fnuci_ids.length > 0

  // 3. Mettre a jour le client
  await adminClient
    .from('clients')
    .update({
      statut_commercial: 'client_hs',
      date_statut: now,
      notes_internes: existingNotes + logEntry,
      ...(hasFnuci ? {
        fnuci_ids: [],
        fnuci_declared: false,
        fnuci_declared_at: null,
      } : {}),
      updated_at: now,
    })
    .eq('id', clientId)

  return {
    livraisons_annulees: activeLivraisons?.length || 0,
    fnuci_liberes: hasFnuci ? client.fnuci_ids.length : 0,
  }
}
