import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendConfirmationCreneauEmail } from '@/lib/email/gmail'

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
  if (isAuthError(authResult)) return authResult

  const { livraisonId } = await request.json()

  if (!livraisonId) {
    return NextResponse.json({ error: 'livraisonId requis' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Fetch livraison + client + depot
  const { data: livraison } = await adminClient
    .from('livraisons')
    .select(`
      id,
      creneau_date,
      creneau_heure_debut,
      creneau_heure_fin,
      mode_livraison,
      token_livraison,
      client:clients (
        id,
        email_beneficiaire,
        email,
        contact_nom,
        contact_prenom,
        nom_contact,
        prenom_contact,
        raison_sociale,
        depot_retrait_id
      ),
      depot:depots (
        id,
        nom,
        adresse,
        code_postal,
        ville
      )
    `)
    .eq('id', livraisonId)
    .single()

  if (!livraison) {
    return NextResponse.json({ error: 'Livraison non trouvée' }, { status: 404 })
  }

  if (!livraison.creneau_date) {
    return NextResponse.json({ error: 'Aucun créneau planifié pour cette livraison' }, { status: 400 })
  }

  const client = livraison.client as unknown as {
    id: string
    email_beneficiaire: string | null
    email: string | null
    contact_nom: string | null
    contact_prenom: string | null
    nom_contact: string | null
    prenom_contact: string | null
    raison_sociale: string
    depot_retrait_id: string | null
  } | null

  if (!client) {
    return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })
  }

  const recipientEmail = client.email_beneficiaire || client.email
  if (!recipientEmail) {
    return NextResponse.json({ error: 'Aucun email pour ce client' }, { status: 400 })
  }

  const clientName = [
    client.prenom_contact || client.contact_prenom,
    client.nom_contact || client.contact_nom,
  ].filter(Boolean).join(' ') || client.raison_sociale

  // Determine if it's a retrait (pickup at depot)
  const isRetrait = !!(client.depot_retrait_id || livraison.mode_livraison === 'retrait' || livraison.mode_livraison === 'point_relais')

  const depot = livraison.depot as unknown as {
    id: string
    nom: string
    adresse: string | null
    code_postal: string | null
    ville: string | null
  } | null

  // Build confirm URL using token (reuse or generate a placeholder if missing)
  const token = livraison.token_livraison || ''
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const confirmUrl = `${baseUrl}/tournee/confirmation?token=${token}`

  try {
    await sendConfirmationCreneauEmail({
      to: recipientEmail,
      clientName,
      date: livraison.creneau_date,
      creneauDebut: livraison.creneau_heure_debut || '09:00',
      creneauFin: livraison.creneau_heure_fin || '18:00',
      confirmUrl,
      isRetrait,
      depotName: depot?.nom,
      depotAddress: depot?.adresse
        ? `${depot.adresse}${depot.code_postal ? ', ' + depot.code_postal : ''}${depot.ville ? ' ' + depot.ville : ''}`
        : undefined,
      token,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erreur sendConfirmationCreneauEmail:', error)
    return NextResponse.json({ error: 'Erreur envoi email' }, { status: 500 })
  }
}
