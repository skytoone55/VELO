import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/livraisons/info-creneau?token=TOKEN
 * Route publique (pas d'auth) — utilisée par la page confirm-creneau pour afficher
 * les infos du créneau (date, heure, adresse) sans exposer de données sensibles.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token || typeof token !== 'string' || token.trim() === '') {
      return NextResponse.json({ error: 'Token manquant ou invalide' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    const { data: livraison, error } = await adminClient
      .from('livraisons')
      .select(`
        id,
        creneau_date,
        creneau_heure_debut,
        creneau_heure_fin,
        mode_livraison,
        confirmation_statut,
        client:clients (
          contact_nom,
          contact_prenom,
          nom_contact,
          prenom_contact,
          raison_sociale,
          adresse_livraison_ligne1,
          adresse_livraison_cp,
          adresse_livraison_ville,
          adresse_societe_ligne1,
          adresse_societe_cp,
          adresse_societe_ville
        ),
        depot:depots (
          nom,
          adresse,
          code_postal,
          ville
        )
      `)
      .eq('token_livraison', token)
      .single()

    if (error || !livraison) {
      return NextResponse.json({ error: 'Livraison introuvable' }, { status: 404 })
    }

    const client = livraison.client as {
      contact_nom?: string | null
      contact_prenom?: string | null
      nom_contact?: string | null
      prenom_contact?: string | null
      raison_sociale?: string | null
      adresse_livraison_ligne1?: string | null
      adresse_livraison_cp?: string | null
      adresse_livraison_ville?: string | null
      adresse_societe_ligne1?: string | null
      adresse_societe_cp?: string | null
      adresse_societe_ville?: string | null
    } | null

    const depot = livraison.depot as {
      nom?: string | null
      adresse?: string | null
      code_postal?: string | null
      ville?: string | null
    } | null

    const clientName = client
      ? [
          client.prenom_contact || client.contact_prenom,
          client.nom_contact || client.contact_nom,
        ]
          .filter(Boolean)
          .join(' ') || client.raison_sociale || null
      : null

    // Build address string
    let adresse: string | null = null
    if (depot?.adresse) {
      adresse = [depot.adresse, depot.code_postal, depot.ville].filter(Boolean).join(' ')
    } else if (client?.adresse_livraison_ligne1) {
      adresse = [
        client.adresse_livraison_ligne1,
        client.adresse_livraison_cp,
        client.adresse_livraison_ville,
      ]
        .filter(Boolean)
        .join(' ')
    } else if (client?.adresse_societe_ligne1) {
      adresse = [
        client.adresse_societe_ligne1,
        client.adresse_societe_cp,
        client.adresse_societe_ville,
      ]
        .filter(Boolean)
        .join(' ')
    }

    return NextResponse.json({
      creneauDate: livraison.creneau_date,
      creneauDebut: livraison.creneau_heure_debut,
      creneauFin: livraison.creneau_heure_fin,
      modeLivraison: livraison.mode_livraison,
      confirmationStatut: livraison.confirmation_statut,
      clientName,
      depotNom: depot?.nom || null,
      adresse,
    })
  } catch (error: any) {
    console.error('[info-creneau] Erreur serveur:', error)
    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
