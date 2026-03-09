import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface LivraisonWithClient {
  id: string
  client_id: string
  depot_id: string | null
  mode_livraison: string
  statut: string | null
  creneau_date: string | null
  creneau_heure_debut: string | null
  creneau_heure_fin: string | null
  adresse_livraison_ligne1: string | null
  adresse_livraison_ligne2: string | null
  adresse_livraison_cp: string | null
  adresse_livraison_ville: string | null
  complement_adresse: string | null
}

interface ClientData {
  id: string
  raison_sociale: string
  contact_prenom: string | null
  contact_nom: string | null
  email_beneficiaire: string | null
  velo_devis: number
}

interface DepotCreneau {
  heure_debut: string
  heure_fin: string
  capacite_velos: number
}

interface DepotData {
  id: string
  nom: string
  type: string
  adresse: string
  code_postal: string
  ville: string
  jours_ouverture: string[] | null
  capacite_velos_jour: number | null
  creneau_duree_minutes: number | null
  creneaux: DepotCreneau[] | null
}

/**
 * GET /api/formulaire-livraison/validate-token
 *
 * Valide le token et retourne les informations de livraison + client + depot.
 * Endpoint public (pas d'auth), le token EST l'authentification.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token || token.length < 32) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Chercher la livraison par token
    const { data: livraison, error: livraisonError } = await adminClient
      .from('livraisons')
      .select('id, client_id, depot_id, mode_livraison, statut, creneau_date, creneau_heure_debut, creneau_heure_fin, adresse_livraison_ligne1, adresse_livraison_ligne2, adresse_livraison_cp, adresse_livraison_ville, complement_adresse')
      .eq('token_livraison', token)
      .single()

    if (livraisonError || !livraison) {
      return NextResponse.json({ error: 'Lien invalide ou expire' }, { status: 404 })
    }

    const typedLivraison = livraison as LivraisonWithClient

    // Verifier si le creneau est deja choisi
    if (typedLivraison.creneau_date) {
      return NextResponse.json({
        error: 'Un creneau a deja ete choisi pour cette livraison',
        alreadySubmitted: true,
        creneau: {
          date: typedLivraison.creneau_date,
          heure_debut: typedLivraison.creneau_heure_debut,
          heure_fin: typedLivraison.creneau_heure_fin,
        },
      }, { status: 400 })
    }

    // Recuperer le client
    const { data: client, error: clientError } = await adminClient
      .from('clients')
      .select('id, raison_sociale, contact_prenom, contact_nom, email_beneficiaire, velo_devis')
      .eq('id', typedLivraison.client_id)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Donnees client introuvables' }, { status: 404 })
    }

    const typedClient = client as ClientData

    // Recuperer le depot si present
    let depot: DepotData | null = null
    if (typedLivraison.depot_id) {
      const { data: depotData } = await adminClient
        .from('depots')
        .select('id, nom, type, adresse, code_postal, ville, jours_ouverture, capacite_velos_jour, creneau_duree_minutes, creneaux')
        .eq('id', typedLivraison.depot_id)
        .single()

      if (depotData) {
        depot = depotData as DepotData
      }
    }

    return NextResponse.json({
      livraison: {
        id: typedLivraison.id,
        mode_livraison: typedLivraison.mode_livraison,
        adresse_livraison: typedLivraison.adresse_livraison_ligne1 ? {
          ligne1: typedLivraison.adresse_livraison_ligne1,
          ligne2: typedLivraison.adresse_livraison_ligne2,
          cp: typedLivraison.adresse_livraison_cp,
          ville: typedLivraison.adresse_livraison_ville,
          complement: typedLivraison.complement_adresse,
        } : null,
      },
      client: {
        nom: typedClient.contact_prenom && typedClient.contact_nom
          ? `${typedClient.contact_prenom} ${typedClient.contact_nom}`
          : typedClient.raison_sociale,
        raison_sociale: typedClient.raison_sociale,
        velo_devis: typedClient.velo_devis,
      },
      depot: depot ? {
        id: depot.id,
        nom: depot.nom,
        type: depot.type,
        adresse: depot.adresse,
        code_postal: depot.code_postal,
        ville: depot.ville,
        jours_ouverture: depot.jours_ouverture,
        capacite_velos_jour: depot.capacite_velos_jour,
        creneau_duree_minutes: depot.creneau_duree_minutes,
        creneaux: depot.creneaux,
      } : null,
    })
  } catch (error: unknown) {
    console.error('Erreur API validate-token livraison:', error)
    const errMsg = error instanceof Error ? error.message : 'Erreur serveur'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
