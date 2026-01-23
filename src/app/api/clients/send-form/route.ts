import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendFormulaireLinkEmail } from '@/lib/email/gmail'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { clientId } = await request.json()

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID requis' }, { status: 400 })
    }

    // Récupérer les infos du client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })
    }

    // Générer un token unique pour le formulaire
    const token = `${clientId}-${Date.now()}-${Math.random().toString(36).substring(7)}`

    // Mettre à jour le client avec le token
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        token_formulaire: token,
        statut_formulaire: 'formulaire_envoye',
        date_envoi_formulaire: new Date().toISOString(),
      })
      .eq('id', clientId)

    if (updateError) {
      console.error('Erreur update client:', updateError)
      return NextResponse.json({ error: 'Erreur mise à jour client' }, { status: 500 })
    }

    // Construire le lien du formulaire
    // NEXT_PUBLIC_APP_URL doit être défini dans Vercel: https://velo-fawn.vercel.app
    // VERCEL_URL est défini automatiquement par Vercel mais sans https://
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || 'http://localhost:3001'
    const formulaireUrl = `${baseUrl}/formulaire?token=${token}`

    // Nom du client pour l'email
    const clientName = client.contact_prenom
      ? `${client.contact_prenom} ${client.contact_nom || ''}`
      : client.raison_sociale || 'Client'

    // Email du bénéficiaire (prioritaire) ou email commercial (fallback)
    const recipientEmail = client.email_beneficiaire || client.email

    // Validation de l'email
    if (!recipientEmail || !recipientEmail.includes('@')) {
      return NextResponse.json({
        error: 'Email du bénéficiaire manquant ou invalide. Veuillez renseigner l\'email dans Monday.'
      }, { status: 400 })
    }

    // Envoyer l'email via Gmail OAuth2
    try {
      const emailResult = await sendFormulaireLinkEmail(
        recipientEmail,
        clientName,
        formulaireUrl
      )

      return NextResponse.json({
        success: true,
        message: 'Email envoyé avec succès',
        emailId: emailResult.messageId,
        formulaireUrl,
      })
    } catch (emailError: any) {
      console.error('Erreur envoi email Gmail:', emailError)
      // Remettre le statut en attente si l'email échoue
      await supabase
        .from('clients')
        .update({ statut_formulaire: 'en_attente' })
        .eq('id', clientId)
      return NextResponse.json({
        error: 'Erreur envoi email: ' + (emailError.message || 'Erreur inconnue')
      }, { status: 500 })
    }

  } catch (error: any) {
    console.error('Erreur API send-form:', error)
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 })
  }
}
