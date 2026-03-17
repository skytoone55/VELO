import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/tournee/confirm
 * Route PUBLIQUE (pas d'auth) — utilisée par le client via le lien email
 * Confirme ou refuse une livraison programmée via token
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, action, commentaire } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token requis' }, { status: 400 })
    }

    if (!action || !['confirmer', 'refuser'].includes(action)) {
      return NextResponse.json({ error: 'Action invalide (confirmer ou refuser)' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Trouver la livraison par token
    const { data: livraison, error: fetchError } = await supabase
      .from('livraisons')
      .select('id, statut, confirmation_statut, client_id, creneau_date, creneau_heure_debut, creneau_heure_fin')
      .eq('token_livraison', token)
      .single()

    if (fetchError || !livraison) {
      return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 })
    }

    // Vérifier que la confirmation est encore possible
    if (livraison.confirmation_statut && livraison.confirmation_statut !== 'en_attente') {
      return NextResponse.json({
        error: 'Cette livraison a déjà été ' + (livraison.confirmation_statut === 'confirmee' ? 'confirmée' : 'refusée'),
        already_confirmed: true,
        statut: livraison.confirmation_statut,
      }, { status: 400 })
    }

    const now = new Date().toISOString()
    const newStatut = action === 'confirmer' ? 'confirmee' : 'refusee'

    // Mettre à jour la livraison
    const { error: updateError } = await supabase
      .from('livraisons')
      .update({
        confirmation_statut: newStatut,
        confirmation_commentaire: action === 'refuser' ? (commentaire || null) : null,
        confirmation_date: now,
        updated_at: now,
      })
      .eq('id', livraison.id)

    if (updateError) {
      console.error('Erreur confirmation livraison:', updateError)
      return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 })
    }

    // Si refus, mettre le client en a_relivrer
    if (action === 'refuser' && livraison.client_id) {
      await supabase
        .from('clients')
        .update({
          statut_commercial: 'a_relivrer',
          date_statut: now,
          updated_at: now,
        })
        .eq('id', livraison.client_id)

      // Sync statut client ↔ livraison
      await supabase
        .from('livraisons')
        .update({
          statut: 'a_livrer',
          updated_at: now,
        })
        .eq('id', livraison.id)
    }

    // Log workflow transition
    await supabase.from('workflow_transitions').insert({
      entity_type: 'livraison',
      entity_id: livraison.id,
      statut_avant: 'en_attente',
      statut_apres: newStatut,
      effectue_par: null,
      raison: action === 'confirmer'
        ? 'Client a confirmé la livraison'
        : `Client a refusé la livraison${commentaire ? ': ' + commentaire : ''}`,
    })

    return NextResponse.json({
      success: true,
      statut: newStatut,
      message: action === 'confirmer'
        ? 'Votre livraison est confirmée !'
        : 'Votre refus a été enregistré. Nous vous recontacterons.',
    })
  } catch (error: unknown) {
    console.error('Erreur POST /api/tournee/confirm:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}

/**
 * GET /api/tournee/confirm?token=xxx
 * Récupère les infos de la livraison pour affichage
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Token requis' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: livraison, error } = await supabase
      .from('livraisons')
      .select('id, statut, confirmation_statut, creneau_date, creneau_heure_debut, creneau_heure_fin, client_id')
      .eq('token_livraison', token)
      .single()

    if (error || !livraison) {
      return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 })
    }

    // Récupérer le nom du client
    let clientName = ''
    if (livraison.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('raison_sociale, contact_prenom, contact_nom')
        .eq('id', livraison.client_id)
        .single()
      if (client) {
        clientName = [client.contact_prenom, client.contact_nom].filter(Boolean).join(' ') || client.raison_sociale
      }
    }

    return NextResponse.json({
      clientName,
      date: livraison.creneau_date,
      creneauDebut: livraison.creneau_heure_debut,
      creneauFin: livraison.creneau_heure_fin,
      confirmationStatut: livraison.confirmation_statut,
    })
  } catch (error: unknown) {
    console.error('Erreur GET /api/tournee/confirm:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
