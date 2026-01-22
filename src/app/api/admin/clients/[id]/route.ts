import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncClientToMonday, getChangedFields } from '@/lib/monday/sync'
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
      .select('role, territoire')
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

    // Vérifier le territoire pour admin_regional
    if (profile.role === 'admin_regional' && profile.territoire !== client.departement) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    // Récupérer aussi les livraisons associées
    const { data: livraisons } = await adminClient
      .from('livraisons')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false })

    return NextResponse.json({ client, livraisons: livraisons || [] })
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
      .select('role, territoire')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin_general', 'admin_regional', 'agent_regional'].includes(profile.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const {
      raison_sociale,
      siret,
      email,
      telephone,
      contact_nom,
      contact_prenom,
      adresse_societe_ligne1,
      adresse_societe_cp,
      adresse_societe_ville,
      departement,
      velo_devis,
      statut_formulaire,
    } = body

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

    // Vérifier le territoire pour admin_regional
    if (profile.role === 'admin_regional' && profile.territoire !== existingClient.departement) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    // Préparer les données de mise à jour
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (raison_sociale !== undefined) updateData.raison_sociale = raison_sociale
    if (siret !== undefined) updateData.siret = siret
    if (email !== undefined) updateData.email = email
    if (telephone !== undefined) updateData.telephone = telephone
    if (contact_nom !== undefined) updateData.contact_nom = contact_nom
    if (contact_prenom !== undefined) updateData.contact_prenom = contact_prenom
    if (adresse_societe_ligne1 !== undefined) updateData.adresse_societe_ligne1 = adresse_societe_ligne1
    if (adresse_societe_cp !== undefined) updateData.adresse_societe_cp = adresse_societe_cp
    if (adresse_societe_ville !== undefined) updateData.adresse_societe_ville = adresse_societe_ville
    if (departement !== undefined) updateData.departement = departement
    if (velo_devis !== undefined) updateData.velo_devis = velo_devis
    if (statut_formulaire !== undefined) updateData.statut_formulaire = statut_formulaire

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
        const changedFields = getChangedFields(existingClient, updateData)

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

    // Seul admin_general peut supprimer
    if (!profile || profile.role !== 'admin_general') {
      return NextResponse.json({ error: 'Seul un admin général peut supprimer des clients' }, { status: 403 })
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
