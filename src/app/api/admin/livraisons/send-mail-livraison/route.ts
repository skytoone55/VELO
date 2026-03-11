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
    .select('id, email_beneficiaire, email, contact_nom, contact_prenom, nom_contact, prenom_contact, raison_sociale')
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

  const success = await sendMailLivraisonEmail({
    to: recipientEmail,
    clientName,
    raisonSociale: client.raison_sociale,
  })

  if (!success) {
    return NextResponse.json({ error: 'Erreur envoi email' }, { status: 500 })
  }

  // Mettre a jour le statut commercial du client → en_livraison
  await adminClient
    .from('clients')
    .update({
      statut_commercial: 'en_livraison',
      date_statut: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientId)

  return NextResponse.json({ success: true })
}
