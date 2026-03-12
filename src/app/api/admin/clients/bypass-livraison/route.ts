import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const auth = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
  if (isAuthError(auth)) return auth

  const body = await request.json()
  const { clientId } = body as { clientId: string }

  if (!clientId) {
    return NextResponse.json({ error: 'clientId requis' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  // Fetch client
  const { data: client, error: fetchError } = await adminClient
    .from('clients')
    .select('id, statut_commercial, raison_sociale, bypass_formulaire, depot_retrait_id, depot_logistique_id')
    .eq('id', clientId)
    .single()

  if (fetchError || !client) {
    return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
  }

  if (client.bypass_formulaire) {
    return NextResponse.json({ error: 'Bypass déjà effectué pour ce client' }, { status: 400 })
  }

  // Set bypass on client
  const { error: updateClientError } = await adminClient
    .from('clients')
    .update({
      bypass_formulaire: true,
      bypass_formulaire_par: auth.id,
      bypass_formulaire_at: now,
      statut_commercial: 'a_livrer',
      date_statut: now,
      updated_at: now,
    })
    .eq('id', clientId)

  if (updateClientError) {
    console.error('Erreur bypass client:', updateClientError)
    return NextResponse.json({ error: updateClientError.message }, { status: 500 })
  }

  // Check if a livraison already exists
  const { data: existingLivraison } = await adminClient
    .from('livraisons')
    .select('id')
    .eq('client_id', clientId)
    .not('statut', 'eq', 'annulee')
    .limit(1)
    .maybeSingle()

  // Create livraison if none exists
  if (!existingLivraison) {
    const depotId = client.depot_logistique_id || client.depot_retrait_id || null
    const { error: createLivError } = await adminClient
      .from('livraisons')
      .insert({
        client_id: clientId,
        statut: 'a_livrer',
        mode_livraison: client.depot_retrait_id ? 'retrait' : 'livraison',
        depot_id: depotId,
        created_at: now,
        updated_at: now,
      })

    if (createLivError) {
      console.error('Erreur creation livraison bypass:', createLivError)
      // Non-blocking: client is already updated
    }
  }

  // Workflow transitions
  await adminClient.from('workflow_transitions').insert({
    entity_type: 'client',
    entity_id: clientId,
    statut_avant: client.statut_commercial,
    statut_apres: 'a_livrer',
    effectue_par: auth.id,
    raison: `Bypass formulaire — passage direct en livraison (${client.raison_sociale})`,
  })

  return NextResponse.json({
    success: true,
    clientId,
    previousStatut: client.statut_commercial,
    newStatut: 'a_livrer',
  })
}
