import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface SubmitBody {
  token: string
  creneau_date: string
  creneau_heure_debut: string
  creneau_heure_fin: string
  confirmPersonne: boolean
  confirmIdentite: boolean
}

/**
 * POST /api/formulaire-livraison/submit
 *
 * Le client soumet son choix de creneau de livraison.
 * Endpoint public (pas d'auth), le token EST l'authentification.
 *
 * Actions :
 * 1. Valide le token et verifie que le creneau n'est pas deja choisi
 * 2. Met a jour la livraison avec le creneau choisi
 * 3. Passe le statut de la livraison a 'programmee'
 */
export async function POST(request: NextRequest) {
  try {
    const body: SubmitBody = await request.json()

    const { token, creneau_date, creneau_heure_debut, creneau_heure_fin, confirmPersonne, confirmIdentite } = body

    // Validations
    if (!token || token.length < 32) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 400 })
    }

    if (!creneau_date) {
      return NextResponse.json({ error: 'Date de creneau requise' }, { status: 400 })
    }

    if (!confirmPersonne || !confirmIdentite) {
      return NextResponse.json({ error: 'Les deux confirmations sont obligatoires' }, { status: 400 })
    }

    // Valider le format de la date (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(creneau_date)) {
      return NextResponse.json({ error: 'Format de date invalide (attendu YYYY-MM-DD)' }, { status: 400 })
    }

    // Valider le format des heures (HH:MM) si presentes
    const timeRegex = /^\d{2}:\d{2}$/
    if (creneau_heure_debut && !timeRegex.test(creneau_heure_debut)) {
      return NextResponse.json({ error: 'Format heure debut invalide (attendu HH:MM)' }, { status: 400 })
    }
    if (creneau_heure_fin && !timeRegex.test(creneau_heure_fin)) {
      return NextResponse.json({ error: 'Format heure fin invalide (attendu HH:MM)' }, { status: 400 })
    }

    // Verifier que la date est dans le futur
    const selectedDate = new Date(creneau_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (selectedDate < today) {
      return NextResponse.json({ error: 'La date selectionnee doit etre dans le futur' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Chercher la livraison par token (+ depot_retrait_id du client pour le planning)
    const { data: livraison, error: livraisonError } = await adminClient
      .from('livraisons')
      .select('id, client_id, creneau_date, statut, depot_id, client:clients!inner(depot_retrait_id)')
      .eq('token_livraison', token)
      .single()

    if (livraisonError || !livraison) {
      return NextResponse.json({ error: 'Lien invalide ou expire' }, { status: 404 })
    }

    // Verifier que le creneau n'est pas deja choisi
    if (livraison.creneau_date) {
      return NextResponse.json({
        error: 'Un creneau a deja ete choisi pour cette livraison',
        alreadySubmitted: true,
      }, { status: 400 })
    }

    // Mettre a jour la livraison avec le creneau choisi + depot_id pour le planning
    const depotId = livraison.depot_id || (livraison.client as any)?.depot_retrait_id || null
    const { error: updateError } = await adminClient
      .from('livraisons')
      .update({
        creneau_date,
        creneau_heure_debut: creneau_heure_debut || null,
        creneau_heure_fin: creneau_heure_fin || null,
        statut: 'retrait_planifie',
        depot_id: depotId,
        date_programmation: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', livraison.id)

    if (updateError) {
      console.error('Erreur mise a jour livraison:', updateError)
      return NextResponse.json({ error: 'Erreur lors de la mise a jour' }, { status: 500 })
    }

    // Le statut reste 'a_livrer' — c'est le livreur qui passera 'en_livraison' puis 'livre'
    // On ne change que le statut de la livraison (programmee) pas du client
    if (livraison.client_id) {
      const { error: clientUpdateError } = await adminClient
        .from('clients')
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq('id', livraison.client_id)

      if (clientUpdateError) {
        console.error('Erreur mise a jour statut client:', clientUpdateError)
        // Non bloquant — la livraison est quand meme programmee
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Creneau de livraison enregistre avec succes',
      creneau: {
        date: creneau_date,
        heure_debut: creneau_heure_debut,
        heure_fin: creneau_heure_fin,
      },
    })
  } catch (error: unknown) {
    console.error('Erreur API submit formulaire livraison:', error)
    const errMsg = error instanceof Error ? error.message : 'Erreur serveur'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
