import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError, type AuthenticatedUser } from '@/lib/auth/require-role'
import { DELIVERY_STATUS } from '@/lib/constants'

// ---------------------------------------------------------------------------
// Valid livraison statut transitions
// ---------------------------------------------------------------------------

const LIVRAISON_TRANSITIONS: Record<string, string[]> = {
  en_attente: ['programmee', 'en_cours', 'annulee'],
  programmee: ['en_cours', 'annulee'],
  en_cours: ['livree', 'probleme', 'annulee'],
  livree: [],
  annulee: [],
  probleme: ['en_cours', 'annulee'],
}

// Mapping: livraison statut \u2192 client statut_commercial
const LIVRAISON_TO_CLIENT_STATUT: Record<string, string> = {
  en_cours: 'en_livraison',
  livree: 'livre',
  probleme: 'probleme_livraison',
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/livraisons/[id]/status
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth: livreur, agent_secteur, admin, super_admin
    const authResult = await requireRole([
      'super_admin',
      'admin',
      'agent_secteur',
      'livreur',
    ])
    if (isAuthError(authResult)) return authResult
    const currentUser = authResult as AuthenticatedUser

    const { id } = await params
    const body = await request.json()
    const { statut, note } = body as { statut?: string; note?: string }

    if (!statut) {
      return NextResponse.json(
        { error: 'Le champ "statut" est requis' },
        { status: 400 }
      )
    }

    // Validate statut is a known value
    const validStatuts = Object.keys(LIVRAISON_TRANSITIONS)
    if (!validStatuts.includes(statut)) {
      return NextResponse.json(
        { error: `Statut invalide : "${statut}". Valeurs accept\u00e9es : ${validStatuts.join(', ')}` },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // 1. Fetch current livraison
    const { data: livraison, error: fetchError } = await adminClient
      .from('livraisons')
      .select('id, statut, client_id, livreur_id, depot_id')
      .eq('id', id)
      .single()

    if (fetchError || !livraison) {
      return NextResponse.json(
        { error: 'Livraison non trouv\u00e9e' },
        { status: 404 }
      )
    }

    // Role-based access check
    if (currentUser.role === 'livreur' && livraison.livreur_id !== currentUser.id) {
      return NextResponse.json({ error: 'Acc\u00e8s refus\u00e9' }, { status: 403 })
    }
    if (currentUser.role === 'agent_secteur' && currentUser.depot_ids?.length && !currentUser.depot_ids.includes(livraison.depot_id)) {
      return NextResponse.json({ error: 'Acc\u00e8s refus\u00e9' }, { status: 403 })
    }

    // 2. Validate transition
    const currentStatut = livraison.statut ?? 'en_attente'
    const allowedTransitions = LIVRAISON_TRANSITIONS[currentStatut] ?? []

    if (!allowedTransitions.includes(statut)) {
      return NextResponse.json(
        {
          error: `Transition non autoris\u00e9e : "${currentStatut}" \u2192 "${statut}". Transitions possibles : ${allowedTransitions.join(', ') || 'aucune'}`,
        },
        { status: 400 }
      )
    }

    // 3. Update livraison statut
    const updateData: Record<string, unknown> = {
      statut,
      updated_at: new Date().toISOString(),
    }

    // Add effective delivery date when marked as delivered
    if (statut === 'livree') {
      updateData.date_livraison_effective = new Date().toISOString()
    }

    // Add note if problem
    if (statut === 'probleme' && note) {
      updateData.notes_internes = note
    }

    const { data: updatedLivraison, error: updateError } = await adminClient
      .from('livraisons')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Erreur mise \u00e0 jour livraison:', updateError)
      return NextResponse.json(
        { error: 'Erreur lors de la mise \u00e0 jour de la livraison' },
        { status: 500 }
      )
    }

    // 4. Update client statut_commercial if mapping exists
    const clientStatut = LIVRAISON_TO_CLIENT_STATUT[statut]
    if (clientStatut && livraison.client_id) {
      const clientUpdate: Record<string, unknown> = {
        statut_commercial: clientStatut,
        date_statut: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // Save problem note on client
      if (statut === 'probleme' && note) {
        clientUpdate.statut_anomalie = note
      }

      const { error: clientError } = await adminClient
        .from('clients')
        .update(clientUpdate)
        .eq('id', livraison.client_id)

      if (clientError) {
        console.error('Erreur mise \u00e0 jour client:', clientError)
        // Non-blocking: livraison already updated, log but don't fail
      }
    }

    return NextResponse.json({
      success: true,
      livraison: updatedLivraison,
      client_statut_updated: clientStatut ?? null,
    })
  } catch (error) {
    console.error('Erreur PATCH /api/admin/livraisons/[id]/status:', error)
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    )
  }
}
