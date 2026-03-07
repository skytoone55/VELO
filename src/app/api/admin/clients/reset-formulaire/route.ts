import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateValidationCode, hashValidationCode } from '@/lib/utils'
import { sendCodeValidationEmail, sendFormulaireLinkEmail } from '@/lib/email/gmail'
import { syncClientToMonday, isMondayConfigured } from '@/lib/monday/api'

export async function POST(request: NextRequest) {
  // console.log('=== API reset-formulaire called ===')
  try {
    // Vérifier l'authentification
    // console.log('Checking authentication...')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // console.log('User:', user?.id || 'No user')
    if (!user) {
      // console.log('ERROR: No user authenticated')
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Vérifier les permissions
    // console.log('Checking permissions for user:', user.id)
    const { data: profile } = await supabase
      .from('users_profile')
      .select('role')
      .eq('id', user.id)
      .single()

    // console.log('Profile:', profile)
    if (!profile || !['super_admin', 'admin', 'agent_secteur'].includes(profile.role)) {
      // console.log('ERROR: User not authorized, role:', profile?.role)
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    // console.log('Request body:', body)
    const { clientId, sendNewCode = true } = body

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID requis' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Récupérer le client
    const { data: client, error: fetchError } = await adminClient
      .from('clients')
      .select('id, email, email_beneficiaire, raison_sociale, contact_prenom, contact_nom, monday_item_id, monday_board_id')
      .eq('id', clientId)
      .single()

    if (fetchError || !client) {
      return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })
    }

    // Générer un nouveau code
    const newCode = generateValidationCode()
    const newCodeHash = hashValidationCode(newCode)

    // Réinitialiser TOUS les champs du formulaire
    const { error: updateError } = await adminClient
      .from('clients')
      .update({
        // Nouveau code de validation
        code_validation_hash: newCodeHash,
        code_validation_envoye_at: new Date().toISOString(),

        // Reset code ENEMAT
        code_enemat_tentatives: 0,
        code_enemat_bloque: false,
        code_enemat_valide: false,
        code_enemat_saisi: null,

        // Reset token (sera régénéré après)
        token_formulaire: null,

        // Reset choix livraison/retrait
        depot_retrait_id: null,
        depot_logistique_id: null,

        // Reset signature
        date_signature_devis: null,
      })
      .eq('id', clientId)

    if (updateError) {
      console.error('Erreur mise à jour client:', updateError)
      return NextResponse.json({ error: 'Erreur lors de la réinitialisation' }, { status: 500 })
    }

    // Supprimer les livraisons existantes pour ce client
    const { error: deleteLivraisonsError } = await adminClient
      .from('livraisons')
      .delete()
      .eq('client_id', clientId)

    if (deleteLivraisonsError) {
      console.error('Erreur suppression livraisons:', deleteLivraisonsError)
      // On continue même si la suppression échoue
    } else {
      // console.log(`Livraisons supprimées pour le client ${clientId}`)
    }

    // Préparer les infos pour les emails
    const clientName = client.contact_prenom && client.contact_nom
      ? `${client.contact_prenom} ${client.contact_nom}`
      : client.raison_sociale
    const recipientEmail = client.email_beneficiaire || client.email

    let codeSent = false
    let formulaireSent = false
    let formulaireUrl = ''
    const emailErrors: string[] = []

    if (recipientEmail && recipientEmail.includes('@')) {
      // 1. Envoyer l'email avec le code
      if (sendNewCode) {
        try {
          await sendCodeValidationEmail(recipientEmail, clientName, newCode)
          // console.log(`Nouveau code de validation envoyé à ${recipientEmail}`)
          codeSent = true
        } catch (emailError: any) {
          console.error('Erreur envoi email code:', emailError)
          emailErrors.push(`Code: ${emailError.message || 'Erreur inconnue'}`)
        }
      }

      // 2. Générer le token et envoyer le lien du formulaire
      const token = `${clientId}-${Date.now()}-${Math.random().toString(36).substring(7)}`

      // Mettre à jour le client avec le token et les statuts
      await adminClient
        .from('clients')
        .update({
          token_formulaire: token,
          statut_commercial: 'formulaire_envoye',
          date_envoi_formulaire: new Date().toISOString(),
        })
        .eq('id', clientId)

      // Construire l'URL du formulaire
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
        || 'http://localhost:3001'
      formulaireUrl = `${baseUrl}/formulaire?token=${token}`

      // Envoyer l'email du formulaire
      try {
        await sendFormulaireLinkEmail(recipientEmail, clientName, formulaireUrl)
        // console.log(`Lien formulaire envoyé à ${recipientEmail}`)
        formulaireSent = true
      } catch (emailError: any) {
        console.error('Erreur envoi email formulaire:', emailError)
        emailErrors.push(`Formulaire: ${emailError.message || 'Erreur inconnue'}`)
      }
    } else {
      emailErrors.push('Email invalide ou manquant')
    }

    // 3. Sync vers Monday - mettre le statut "FORMULAIRE ENVOYÉ"
    if (client.monday_item_id && isMondayConfigured()) {
      try {
        await syncClientToMonday(
          { monday_item_id: client.monday_item_id, monday_board_id: client.monday_board_id, statut_commercial: 'formulaire_envoye' },
          ['statut_commercial']
        )
        // console.log(`Statut FORMULAIRE ENVOYÉ sync vers Monday pour ${client.raison_sociale}`)
      } catch (syncError) {
        console.error('Erreur sync Monday:', syncError)
      }
    }

    return NextResponse.json({
      success: true,
      message: emailErrors.length > 0
        ? `Client réinitialisé, mais erreur d'envoi email: ${emailErrors.join(', ')}`
        : `Client ${client.raison_sociale} réinitialisé avec succès`,
      codeSent,
      formulaireSent,
      formulaireUrl,
      emailErrors,
    })
  } catch (error: unknown) {
    console.error('Erreur API reset-formulaire:', error)
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
