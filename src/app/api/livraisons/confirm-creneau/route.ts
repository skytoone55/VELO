import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/livraisons/confirm-creneau?token=TOKEN
 * Route publique (pas d'auth) — lien email client.
 * Marque la livraison confirmée par le client.
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
      .select('id')
      .eq('token_livraison', token)
      .single()

    if (livraisonError || !livraison) {
      return NextResponse.json({ error: 'Livraison introuvable' }, { status: 404 })
    }

    // Mise à jour de la livraison : confirmation client
    const { error: livraisonUpdateError } = await adminClient
      .from('livraisons')
      .update({
        confirmation_statut: 'confirme',
        confirmation_date: new Date().toISOString(),
      })
      .eq('id', livraison.id)

    if (livraisonUpdateError) {
      console.error('[confirm-creneau] Erreur mise à jour livraison:', livraisonUpdateError)
      throw livraisonUpdateError
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[confirm-creneau] Erreur serveur:', error)
    return NextResponse.json(
      { error: error?.message || error?.details || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
