import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/planning/unschedule
 * Retire un client du planning : reset livraison + client statut → a_livrer
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
    if (isAuthError(auth)) return auth

    const { livraisonId } = await request.json()

    if (!livraisonId) {
      return NextResponse.json({ error: 'livraisonId requis' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Récupérer le client_id
    const { data: livData, error: fetchErr } = await adminClient
      .from('livraisons')
      .select('client_id')
      .eq('id', livraisonId)
      .single()

    if (fetchErr || !livData) {
      return NextResponse.json({ error: 'Livraison introuvable' }, { status: 404 })
    }

    // Reset livraison
    const { error: updateLivErr } = await adminClient
      .from('livraisons')
      .update({
        creneau_date: null,
        creneau_heure_debut: null,
        creneau_heure_fin: null,
        statut: 'a_livrer',
        livreur_id: null,
      })
      .eq('id', livraisonId)

    if (updateLivErr) {
      console.error('Erreur reset livraison:', updateLivErr)
      return NextResponse.json({ error: updateLivErr.message }, { status: 500 })
    }

    // Reset client → a_livrer
    const { error: updateClientErr } = await adminClient
      .from('clients')
      .update({
        statut_commercial: 'a_livrer',
        date_statut: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', livData.client_id)

    if (updateClientErr) {
      console.error('Erreur reset client:', updateClientErr)
      return NextResponse.json({ error: updateClientErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, clientId: livData.client_id })
  } catch (error) {
    console.error('Erreur API unschedule:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
