import { createAdminClient } from '@/lib/supabase/admin'

export interface TransfertVersDataResult {
  livraisonsAnnulees: number
  fnuciLiberes: number
  dataClientId: string
}

export type StatutData = 'HS' | 'retour_client' | 'en_attente'

// Multi-tenant : certaines tables auxiliaires existent sur une base (Ecovolt) mais
// pas sur l'autre (PPE) — ex. webhook_logs. PostgREST renvoie alors PGRST205
// ("Could not find the table 'public.X' in the schema cache"). Dans ce cas la table
// n'a tout simplement rien a nettoyer : on ignore l'erreur au lieu de bloquer.
const isMissingTableError = (e: { code?: string; message?: string } | null | undefined): boolean =>
  !!e && (e.code === 'PGRST205' || /Could not find the table|schema cache/i.test(e.message || ''))

/**
 * Transfere REELLEMENT un client de `clients` vers `data_clients` (deplacement, pas copie) :
 * libere les FNUCI, insere la fiche dans data_clients, detache les FK restrictives, puis
 * SUPPRIME le client de `clients` (les livraisons partent en CASCADE -> sortent des plannings).
 * Rollback de la ligne data_clients si la suppression echoue (jamais de doublon).
 *
 * Source unique du transfert, partagee par :
 *  - POST /api/admin/clients/[id]/to-data            (bouton "Renvoyer vers Data")
 *  - passerClientHS()  -> bouton "Client HS" fiche + "Retractation" planning
 *
 * Ne fait PAS de controle de role : l'appelant est responsable de l'auth.
 */
export async function transfererClientVersData(
  adminClient: ReturnType<typeof createAdminClient>,
  clientId: string,
  opts: {
    statutData: StatutData
    comment: string
    actorName: string
    retourPar?: string | null
    /** Override du libelle de log (ex. "RÉTRACTATION"). Defaut derive du statut. */
    logLabel?: string
  }
): Promise<TransfertVersDataResult> {
  const { statutData, comment, actorName, retourPar = null } = opts
  const commentClean = comment.trim()

  // Recuperer le client
  const { data: client, error: fetchError } = await adminClient
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (fetchError || !client) {
    throw new Error('Client non trouve')
  }

  const now = new Date().toISOString()

  // Compter les livraisons actives (avant suppression CASCADE) pour le retour
  const { data: activeLivraisons } = await adminClient
    .from('livraisons')
    .select('id')
    .eq('client_id', clientId)
    .not('statut', 'eq', 'annulee')
  const livraisonsAnnulees = activeLivraisons?.length || 0

  // Liberer les FNUCI (table registre)
  let fnuciLiberes = 0
  const { data: fnucis } = await adminClient
    .from('fnuci')
    .select('id')
    .eq('client_id', clientId)
  if (fnucis?.length) {
    await adminClient
      .from('fnuci')
      .update({ client_id: null, livraison_id: null, statut: 'disponible', attribue_at: null, distribue_at: null })
      .eq('client_id', clientId)
    fnuciLiberes = fnucis.length
  }

  // Inserer dans data_clients
  const logLabel = opts.logLabel ?? (statutData === 'HS' ? 'HS' : 'Retour Data')
  const logEntry = `[${logLabel} ${new Date().toLocaleDateString('fr-FR')} par ${actorName}] ${commentClean}`
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
      statut_data: statutData,
      motif_retour: commentClean,
      retour_par: retourPar,
      retour_at: now,
      notes_internes: existingNotes + logEntry,
    })
    .select('id')
    .single()

  if (insertError || !insertedDataClient) {
    throw new Error(insertError?.message || 'Echec insertion data_clients')
  }

  // Rollback : retire la ligne data_clients si la suite echoue (jamais de doublon).
  const rollbackDataClient = async () => {
    await adminClient.from('data_clients').delete().eq('id', insertedDataClient.id)
  }

  // Nettoyer les FK RESTRICTIVES (NO ACTION) qui bloqueraient le DELETE.
  // Les FK CASCADE (livraisons, clients_hors_zone, distances_cache, formulaires_log,
  // user_societes) et SET NULL (fnuci, deja libere) se gerent automatiquement.
  const { error: webhookDelError } = await adminClient
    .from('webhook_logs')
    .delete()
    .eq('client_id', clientId)
  if (webhookDelError && !isMissingTableError(webhookDelError)) {
    await rollbackDataClient()
    throw new Error(`Echec nettoyage webhook_logs : ${webhookDelError.message}`)
  }

  const detachTables = ['enemat_history', 'codes_enemat', 'email_alerts', 'sync_monday_log'] as const
  for (const table of detachTables) {
    const { error: detachError } = await adminClient
      .from(table)
      .update({ client_id: null })
      .eq('client_id', clientId)
    if (detachError && !isMissingTableError(detachError)) {
      await rollbackDataClient()
      throw new Error(`Echec detachement ${table} : ${detachError.message}`)
    }
  }

  // Supprimer de clients et VERIFIER la suppression.
  const { error: deleteError } = await adminClient
    .from('clients')
    .delete()
    .eq('id', clientId)
  if (deleteError) {
    await rollbackDataClient()
    throw new Error(`Echec suppression du client : ${deleteError.message}`)
  }

  const { data: stillThere } = await adminClient
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle()
  if (stillThere) {
    await rollbackDataClient()
    throw new Error("Le client n'a pas pu etre supprime (reference bloquante residuelle). Aucun doublon cree.")
  }

  return {
    livraisonsAnnulees,
    fnuciLiberes,
    dataClientId: insertedDataClient.id,
  }
}
