import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMailPlanningEmail } from '@/lib/email/gmail'

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
  if (isAuthError(authResult)) return authResult

  const { livraisonIds } = await request.json()

  if (!livraisonIds || !Array.isArray(livraisonIds) || livraisonIds.length === 0) {
    return NextResponse.json({ error: 'livraisonIds requis (tableau)' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  let sent = 0
  let errors = 0
  const errorDetails: string[] = []

  for (const livraisonId of livraisonIds) {
    try {
      // Fetch livraison avec client joint
      const { data: livraison } = await adminClient
        .from('livraisons')
        .select(`
          id, creneau_date, creneau_heure_debut, creneau_heure_fin,
          clients!inner(
            id, email_beneficiaire, email, raison_sociale,
            contact_nom, contact_prenom
          )
        `)
        .eq('id', livraisonId)
        .single()

      if (!livraison) {
        errors++
        errorDetails.push(`Livraison ${livraisonId} non trouvée`)
        continue
      }

      const client = Array.isArray(livraison.clients)
        ? livraison.clients[0]
        : livraison.clients

      if (!client) {
        errors++
        errorDetails.push(`Client non trouvé pour livraison ${livraisonId}`)
        continue
      }

      const recipientEmail = client.email_beneficiaire || client.email
      if (!recipientEmail) {
        errors++
        errorDetails.push(`Pas d'email pour ${client.raison_sociale}`)
        continue
      }

      // Formater la date en français
      const dateLivraison = (() => {
        const dateStr = livraison.creneau_date
        if (!dateStr) return 'Date à confirmer'
        try {
          return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        } catch {
          return dateStr
        }
      })()

      // Formater le créneau :
      // - "Journée entière" en base (00:00-23:59) -> affiché 08:00-19:00 pour le client
      // - créneau précis -> tel quel (HH:MM)
      // - rien -> fallback large 08:00-20:00
      const trimSec = (h: string) => h.replace(/:\d\d$/, '')
      const isJourneeEntiere = (debut: string, fin: string) =>
        (debut === '00:00:00' || debut === '00:00')
        && (fin === '23:59:00' || fin === '23:59')
      const creneauHoraire = livraison.creneau_heure_debut && livraison.creneau_heure_fin
        ? (isJourneeEntiere(livraison.creneau_heure_debut, livraison.creneau_heure_fin)
            ? '08:00 - 19:00'
            : `${trimSec(livraison.creneau_heure_debut)} - ${trimSec(livraison.creneau_heure_fin)}`)
        : '08:00 - 20:00'

      // Nom du réceptionnaire
      const nomReceptionnaire = [
        client.contact_prenom,
        client.contact_nom,
      ].filter(Boolean).join(' ') || client.raison_sociale

      const success = await sendMailPlanningEmail({
        to: recipientEmail,
        clientName: nomReceptionnaire,
        raisonSociale: client.raison_sociale,
        dateLivraison,
        creneauHoraire,
        nomReceptionnaire,
      })

      if (success) {
        sent++
      } else {
        errors++
        errorDetails.push(`Echec envoi pour ${client.raison_sociale}`)
      }
    } catch (err) {
      errors++
      errorDetails.push(`Erreur livraison ${livraisonId}: ${err instanceof Error ? err.message : 'Erreur inconnue'}`)
    }
  }

  return NextResponse.json({ sent, errors, errorDetails: errorDetails.slice(0, 10) })
}
