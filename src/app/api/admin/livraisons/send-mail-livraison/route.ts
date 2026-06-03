import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMailLivraisonEmail } from '@/lib/email/gmail'

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
  if (isAuthError(authResult)) return authResult

  const { clientId } = await request.json()

  if (!clientId) {
    return NextResponse.json({ error: 'clientId requis' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: client } = await adminClient
    .from('clients')
    .select('id, email_beneficiaire, email, contact_nom, contact_prenom, nom_contact, prenom_contact, raison_sociale, reference_retina, adresse_livraison_ligne1, adresse_livraison_ligne2, adresse_livraison_cp, adresse_livraison_ville, adresse_societe_ligne1, adresse_societe_ligne2, adresse_societe_cp, adresse_societe_ville')
    .eq('id', clientId)
    .single()

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

  // Adresse de livraison (prioritaire) sinon adresse societe — celle du dossier.
  const hasLivraison = client.adresse_livraison_ligne1 || client.adresse_livraison_ville
  const adresse = [
    hasLivraison ? client.adresse_livraison_ligne1 : client.adresse_societe_ligne1,
    hasLivraison ? client.adresse_livraison_ligne2 : client.adresse_societe_ligne2,
    [
      hasLivraison ? client.adresse_livraison_cp : client.adresse_societe_cp,
      hasLivraison ? client.adresse_livraison_ville : client.adresse_societe_ville,
    ].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ') || null

  const success = await sendMailLivraisonEmail({
    to: recipientEmail,
    clientName,
    raisonSociale: client.raison_sociale,
    referenceRetina: client.reference_retina,
    adresse,
  })

  if (!success) {
    return NextResponse.json({ error: 'Erreur envoi email' }, { status: 500 })
  }

  // NB : le Mail livraison est une simple annonce d'arrivée — il ne doit PAS
  // changer le statut du client ni de la livraison. (Avant, il forçait
  // 'en_livraison', ce qui sortait les clients du workflow tournée.)

  return NextResponse.json({ success: true })
}
