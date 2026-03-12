import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncClientToMonday, getChangedFields } from '@/lib/monday/api'
import { isMondayConfigured } from '@/lib/monday/config'

// GET - Récupérer un client par ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Vérifier l'authentification
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Récupérer le profil pour vérifier les permissions
    const { data: profile } = await supabase
      .from('users_profile')
      .select('role, territoire, depot_ids')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role === 'client') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    // Utiliser le client admin pour bypasser RLS
    const adminClient = createAdminClient()

    const { data: client, error } = await adminClient
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    // Vérifier le territoire pour admin regional (FR = accès total)
    if (profile.role === 'admin' && profile.territoire && profile.territoire !== 'FR' && profile.territoire !== client.departement) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    // Vérifier l'accès dépôt pour agent_secteur
    if (profile.role === 'agent_secteur') {
      const clientDepots = [client.depot_retrait_id, client.depot_logistique_id].filter(Boolean)
      const hasAccess = clientDepots.some((d: string) => profile.depot_ids?.includes(d))
      if (!hasAccess) {
        return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
      }
    }

    // Récupérer aussi les livraisons associées
    const { data: livraisons } = await adminClient
      .from('livraisons')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false })

    // Récupérer les dépôts associés au client
    let depotRetrait = null
    let depotLogistique = null
    let distanceKm = null

    if (client.depot_retrait_id) {
      const { data: depot } = await adminClient
        .from('depots')
        .select('*')
        .eq('id', client.depot_retrait_id)
        .single()
      depotRetrait = depot
    }

    if (client.depot_logistique_id) {
      const { data: depot } = await adminClient
        .from('depots')
        .select('*')
        .eq('id', client.depot_logistique_id)
        .single()
      depotLogistique = depot
    }

    // Récupérer la distance depuis le cache si disponible
    const depotId = client.depot_retrait_id || client.depot_logistique_id
    if (depotId) {
      const { data: distanceCache } = await adminClient
        .from('distances_cache')
        .select('distance_km')
        .eq('client_id', id)
        .eq('depot_id', depotId)
        .single()
      if (distanceCache) {
        distanceKm = distanceCache.distance_km
      }
    }

    // Enrichir les livraisons avec les noms livreur + contrôleur
    const userIdsToResolve = new Set<string>()
    for (const liv of (livraisons || [])) {
      if ((liv as any).livreur_id) userIdsToResolve.add((liv as any).livreur_id)
      if ((liv as any).cq_valide_par) userIdsToResolve.add((liv as any).cq_valide_par)
    }

    let userNamesMap: Record<string, { nom: string; prenom: string }> = {}
    if (userIdsToResolve.size > 0) {
      const { data: profiles } = await adminClient
        .from('users_profile')
        .select('id, nom, prenom')
        .in('id', [...userIdsToResolve])
      if (profiles) {
        userNamesMap = Object.fromEntries(profiles.map(p => [p.id, { nom: p.nom, prenom: p.prenom }]))
      }
    }

    const enrichedLivraisons = (livraisons || []).map((liv: any) => ({
      ...liv,
      livreur_nom: liv.livreur_id && userNamesMap[liv.livreur_id]
        ? `${userNamesMap[liv.livreur_id].prenom} ${userNamesMap[liv.livreur_id].nom}`
        : null,
      controleur_nom: liv.cq_valide_par && userNamesMap[liv.cq_valide_par]
        ? `${userNamesMap[liv.cq_valide_par].prenom} ${userNamesMap[liv.cq_valide_par].nom}`
        : null,
    }))

    return NextResponse.json({
      client,
      livraisons: enrichedLivraisons,
      depotRetrait,
      depotLogistique,
      distanceKm,
    })
  } catch (error: any) {
    console.error('Erreur API:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT - Modifier un client
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Vérifier l'authentification
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Récupérer le profil pour vérifier les permissions
    const { data: profile } = await supabase
      .from('users_profile')
      .select('role, territoire, depot_ids')
      .eq('id', user.id)
      .single()

    if (!profile || !['super_admin', 'admin', 'agent_secteur'].includes(profile.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()

    // Utiliser le client admin pour bypasser RLS
    const adminClient = createAdminClient()

    // Vérifier que le client existe et récupérer toutes ses données pour la sync
    const { data: existingClient, error: fetchError } = await adminClient
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existingClient) {
      return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })
    }

    // Vérifier le territoire pour admin regional (FR = accès total)
    if (profile.role === 'admin' && profile.territoire && profile.territoire !== 'FR' && profile.territoire !== existingClient.departement) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    // Vérifier l'accès dépôt pour agent_secteur
    if (profile.role === 'agent_secteur') {
      const clientDepots = [existingClient.depot_retrait_id, existingClient.depot_logistique_id].filter(Boolean)
      const hasAccess = clientDepots.some((d: string) => profile.depot_ids?.includes(d))
      if (!hasAccess) {
        return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
      }
    }

    // Liste de tous les champs modifiables (synchronisés vers Monday)
    const allowedFields = [
      // Identification
      'raison_sociale',
      'siret',
      'reference_dossier',
      'numero_devis',
      // Contact
      'email',
      'email_beneficiaire',
      'telephone',
      'contact_nom',
      'contact_prenom',
      'contact_fonction',
      // Adresse siège
      'adresse_societe_ligne1',
      'adresse_societe_ligne2',
      'adresse_societe_cp',
      'adresse_societe_ville',
      // Adresse livraison
      'adresse_livraison_ligne1',
      'adresse_livraison_ligne2',
      'adresse_livraison_cp',
      'adresse_livraison_ville',
      // Entreprise
      'format_juridique',
      'code_ape',
      'nb_salaries',
      'departement',
      // Vélos & Devis
      'velo_devis',
      'velo_valide',
      'devis_pdf_url',
      'date_signature_devis',
      // Statuts
      'statut_formulaire',
      'statut_commercial',
      'statut_retina',
      'statut_mail',
      'statut_anomalie',
      'statut_doublon',
      'date_statut',
      // Validation
      'code_enemat_saisi',
      'code_enemat_valide',
      'date_validation_code',
      'validation_naf',
      // Notes
      'notes_internes',
      // Préférences
      'preferences_livraison',
      // Documents
      'attestation_urssaf_url',
      'attestation_dsn_url',
      'declaration_benevoles_url',
    ]

    // Préparer les données de mise à jour dynamiquement
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Mettre à jour le client
    const { data: updatedClient, error } = await adminClient
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Erreur mise à jour client:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Synchronisation bidirectionnelle vers Monday
    let mondaySync = { success: false, skipped: true, error: null as string | null }
    if (updatedClient.monday_item_id && isMondayConfigured()) {
      try {
        // Déterminer les champs modifiés pour ne synchroniser que ceux-là
        const changedFields = await getChangedFields(existingClient, updateData)

        // DEBUG: Log les champs modifiés
        console.log('API PUT - changedFields:', changedFields)
        console.log('API PUT - updateData:', JSON.stringify(updateData))

        if (changedFields.length > 0) {
          const syncResult = await syncClientToMonday(updatedClient, changedFields)
          mondaySync = {
            success: syncResult.success,
            skipped: false,
            error: syncResult.error || null,
          }

          // Logger la synchronisation
          await adminClient.from('sync_monday_log').insert({
            action: 'api_update',
            direction: 'supabase_to_monday',
            client_id: updatedClient.id,
            monday_item_id: updatedClient.monday_item_id,
            statut: syncResult.success ? 'success' : 'error',
            donnees_avant: existingClient,
            donnees_apres: updateData,
            message_erreur: syncResult.error,
          })
        }
      } catch (syncError: any) {
        console.error('Erreur sync Monday:', syncError)
        mondaySync.error = syncError.message
      }
    }

    return NextResponse.json({
      client: updatedClient,
      mondaySync,
    })
  } catch (error: any) {
    console.error('Erreur API:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Supprimer un client et toutes ses données associées
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Vérifier l'authentification
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Récupérer le profil pour vérifier les permissions
    const { data: profile } = await supabase
      .from('users_profile')
      .select('role, territoire')
      .eq('id', user.id)
      .single()

    // Seul super_admin peut supprimer
    if (!profile || profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Seul un super admin peut supprimer des clients' }, { status: 403 })
    }

    // Utiliser le client admin pour bypasser RLS
    const adminClient = createAdminClient()

    // Supprimer toutes les données liées au client (dans l'ordre des dépendances)

    // 1. Supprimer les livraisons du client
    await adminClient
      .from('livraisons')
      .delete()
      .eq('client_id', id)

    // 2. Supprimer les distances en cache
    await adminClient
      .from('distances_cache')
      .delete()
      .eq('client_id', id)

    // 3. Supprimer les entrées clients_hors_zone
    await adminClient
      .from('clients_hors_zone')
      .delete()
      .eq('client_id', id)

    // 4. Supprimer les alertes email liées
    await adminClient
      .from('email_alerts')
      .delete()
      .eq('client_id', id)

    // 5. Supprimer les logs du formulaire
    await adminClient
      .from('formulaires_log')
      .delete()
      .eq('client_id', id)

    // 6. Supprimer les transitions de workflow
    await adminClient
      .from('workflow_transitions')
      .delete()
      .eq('entity_id', id)
      .eq('entity_type', 'client')

    // 7. Supprimer les associations user_societes
    await adminClient
      .from('user_societes')
      .delete()
      .eq('client_id', id)

    // 8. Supprimer les logs de sync Monday
    await adminClient
      .from('sync_monday_log')
      .delete()
      .eq('client_id', id)

    // 9. Supprimer les logs d'audit
    await adminClient
      .from('audit_log')
      .delete()
      .eq('entity_id', id)
      .eq('entity_type', 'client')

    // 10. Finalement, supprimer le client
    const { error } = await adminClient
      .from('clients')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Erreur suppression client:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Client et toutes ses données supprimés' })
  } catch (error: any) {
    console.error('Erreur API:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
