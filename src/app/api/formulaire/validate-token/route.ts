import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json(
        { error: 'Token manquant', valid: false },
        { status: 400 }
      )
    }

    // Utiliser le client admin pour bypasser RLS
    const adminClient = createAdminClient()

    // Chercher le client par token
    const { data: client, error: clientError } = await adminClient
      .from('clients')
      .select('*')
      .eq('token_formulaire', token)
      .single()

    if (clientError || !client) {
      return NextResponse.json(
        { error: 'Token invalide', valid: false },
        { status: 404 }
      )
    }

    // Vérifier si le formulaire n'est pas déjà complété
    if (client.statut_formulaire === 'formulaire_complete') {
      return NextResponse.json(
        { error: 'Ce formulaire a déjà été complété.', valid: false, status: 'completed' },
        { status: 400 }
      )
    }

    // Vérifier si le client n'est pas bloqué
    if (client.statut_formulaire === 'formulaire_bloque') {
      return NextResponse.json(
        { error: 'Votre accès au formulaire a été bloqué. Contactez le support.', valid: false, status: 'blocked' },
        { status: 403 }
      )
    }

    // Charger les dépôts disponibles pour l'agence du client
    const { data: depots } = await adminClient
      .from('depots')
      .select('*')
      .eq('agence', client.agence)
      .eq('actif', true)

    // Logger l'accès au formulaire
    await adminClient.from('formulaires_log').insert({
      client_id: client.id,
      etape_numero: 0,
      etape_nom: 'acces_formulaire',
      donnees_saisies: { token, timestamp: new Date().toISOString() },
    })

    // Retourner les données du client (sans infos sensibles)
    return NextResponse.json({
      valid: true,
      client: {
        id: client.id,
        raison_sociale: client.raison_sociale,
        siret: client.siret,
        email: client.email,
        telephone: client.telephone,
        contact_nom: client.contact_nom,
        contact_prenom: client.contact_prenom,
        adresse_livraison_ligne1: client.adresse_livraison_ligne1,
        adresse_livraison_ligne2: client.adresse_livraison_ligne2,
        adresse_livraison_cp: client.adresse_livraison_cp,
        adresse_livraison_ville: client.adresse_livraison_ville,
        agence: client.agence,
        velo_devis: client.velo_devis,
      },
      depots: depots || [],
    })
  } catch (error: any) {
    console.error('Erreur validation token:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', valid: false },
      { status: 500 }
    )
  }
}
