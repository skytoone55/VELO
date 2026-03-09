import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/livraisons/cancel-creneau?token=TOKEN
 * Route publique (pas d'auth) — lien email client.
 * Marque le client "anomalie" + la livraison "indisponible", puis redirige vers la page de confirmation.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token || typeof token !== 'string' || token.trim() === '') {
      return NextResponse.json({ error: 'Token manquant ou invalide' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Recherche la livraison par token
    const { data: livraison, error: livraisonError } = await adminClient
      .from('livraisons')
      .select('id, client_id')
      .eq('token_livraison', token)
      .single()

    if (livraisonError || !livraison) {
      return NextResponse.json({ error: 'Livraison introuvable' }, { status: 404 })
    }

    const { id: livraisonId, client_id: clientId } = livraison

    // Mise a jour du client : statut anomalie
    const { error: clientError } = await adminClient
      .from('clients')
      .update({
        statut_commercial: 'anomalie',
        statut_anomalie:
          'Le client a indiqué ne pas pouvoir être disponible au créneau de livraison prévu — un agent doit le recontacter pour replanifier',
      })
      .eq('id', clientId)

    if (clientError) {
      console.error('[cancel-creneau] Erreur mise a jour client:', clientError)
      throw clientError
    }

    // Mise a jour de la livraison : confirmation indisponible
    const { error: livraisonUpdateError } = await adminClient
      .from('livraisons')
      .update({
        confirmation_statut: 'indisponible',
        confirmation_commentaire: 'Client indisponible au créneau prévu',
      })
      .eq('id', livraisonId)

    if (livraisonUpdateError) {
      console.error('[cancel-creneau] Erreur mise a jour livraison:', livraisonUpdateError)
      throw livraisonUpdateError
    }

    return NextResponse.redirect(
      new URL('/livraisons/cancel-creneau/confirme', request.url)
    )
  } catch (error: any) {
    console.error('[cancel-creneau] Erreur serveur:', error)
    return NextResponse.json(
      { error: error?.message || error?.details || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
