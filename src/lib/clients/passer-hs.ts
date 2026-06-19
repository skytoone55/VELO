import { createAdminClient } from '@/lib/supabase/admin'
import { transfererClientVersData } from '@/lib/clients/transferer-vers-data'

export interface PasserHSResult {
  livraisons_annulees: number
  fnuci_liberes: number
}

/**
 * Passe un client en "Client HS" : libere les FNUCI, annule/supprime ses livraisons
 * (elles partent en CASCADE -> sortent des plannings) et TRANSFERE le client vers
 * data_clients avec statut_data='HS' (deplacement, pas copie). Le client disparait
 * donc de la table `clients` : on ne le retrouve plus que dans Data Client (HS).
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
  const result = await transfererClientVersData(adminClient, clientId, {
    statutData: 'HS',
    comment,
    actorName,
    logLabel: prefixe,
  })

  return {
    livraisons_annulees: result.livraisonsAnnulees,
    fnuci_liberes: result.fnuciLiberes,
  }
}
