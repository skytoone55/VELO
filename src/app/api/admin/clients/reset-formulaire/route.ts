import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateValidationCode, hashValidationCode } from '@/lib/utils'
import { sendCodeValidationEmail, sendFormulaireLinkEmail } from '@/lib/email/gmail'
import { syncClientToMonday, isMondayConfigured } from '@/lib/monday/api'

export async function POST(request: NextRequest) {
  // console.log('=== API reset-formulaire called ===')
  try {
    // V\u00e9rifier l'authentification
    // console.log('Checking authentication...')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // console.log('User:', user?.id || 'No user')
    if (!user) {
      // console.log('ERROR: No user authenticated')
      return NextResponse.json({ error: 'Non autoris\u00e9' }, { status: 401 })
    }

    // V\u00e9rifier les permissions
    // console.log('Checking permissions for user:', user.id)
    const { data: profile } = await supabase
      .from('users_profile')
      .select('role')
      .eq('id', user.id)
      .single()

    // console.log('Profile:', profile)
    if (!profile || !['super_admin', 'admin', 'agent_secteur'].includes(profile.role)) {
      // console.log('ERROR: User not authorized, role:', profile?.role)
      return NextResponse.json({ error: 'Non autoris\u00e9' }, { status: 403 })
    }

    const body = await request.json()
    // console.log('Request body:', body)
    const { clientId, sendNewCode = true } = body

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID requis' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // R\u00e9cup\u00e9rer le client
    const { data: client, error: fetchError } = await adminClient
      .from('clients')
      .select('id, email, email_beneficiaire, raison_sociale, contact_prenom, contact_nom, monday_item_id, monday_board_id, validation_naf')
      .eq('id', clientId)
      .single()

    if (fetchError || !client) {
      return NextResponse.json({ error: 'Client non trouv\u00e9' }, { status: 404 })
    }

    // === GARDE NAF ===
    const nafValid = ['OUI', 'ok', 'oui'].includes(client.validation_naf || '')
    if (!nafValid) {
      return NextResponse.json({
        error: 'Client non \u00e9ligible : code NAF non valid\u00e9. Impossible d\'envoyer le formulaire.',
        guard: 'naf',
      }, { status: 422 })
    }

    // G\u00e9n\u00e9rer un nouveau code
    const newCode = generateValidationCode()
    const newCodeHash = hashValidationCode(newCode)

    // R\u00e9initialiser TOUS les champs du formulaire
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

        // Reset token (sera r\u00e9g\u00e9n\u00e9r\u00e9 apr\u00e8s)
        token_formulaire: null,

        // Reset statut formulaire (sinon "d\u00e9j\u00e0 compl\u00e9t\u00e9")
        statut_formulaire: null,

        // Reset choix livraison/retrait
        depot_retrait_id: null,
        depot_logistique_id: null,

        // Reset signature
        date_signature_devis: null,
      })
      .eq('id', clientId)

    if (updateError) {
      console.error('Erreur mise \u00e0 jour client:', updateError)
      return NextResponse.json({ error: 'Erreur lors de la r\u00e9initialisation' }, { status: 500 })
    }

    // Supprimer les livraisons existantes pour ce client
    const { error: deleteLivraisonsError } = await adminClient
      .from('livraisons')
      .delete()
      .eq('client_id', clientId)

    if (deleteLivraisonsError) {
      console.error('Erreur suppression livraisons:', deleteLivraisonsError)
      // On continue m\u00eame si la suppression \u00e9choue
    } else {
      // console.log(`Livraisons supprim\u00e9es pour le client ${clientId}`)
    }

    // Pr\u00e9parer les infos pour les emails
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
          // console.log(`Nouveau code de validation envoy\u00e9 \u00e0 ${recipientEmail}`)
          codeSent = true
        } catch (emailError: any) {
          console.error('Erreur envoi email code:', emailError)
          emailErrors.push(`Code: ${emailError.message || 'Erreur inconnue'}`)
        }
      }

      // 2. G\u00e9n\u00e9rer le token et envoyer le lien du formulaire
      const token = `${clientId}-${Date.now()}-${Math.random().toString(36).substring(7)}`

      // Mettre \u00e0 jour le client avec le token et les statuts
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
        // console.log(`Lien formulaire envoy\u00e9 \u00e0 ${recipientEmail}`)
        formulaireSent = true
      } catch (emailError: any) {
        console.error('Erreur envoi email formulaire:', emailError)
        emailErrors.push(`Formulaire: ${emailError.message || 'Erreur inconnue'}`)
      }
    } else {
      emailErrors.push('Email invalide ou manquant')
    }

    // 3. Sync vers Monday - mettre le statut "FORMULAIRE ENVOY\u00c9"
    if (client.monday_item_id && isMondayConfigured()) {
      try {
        await syncClientToMonday(
          { monday_item_id: client.monday_item_id, monday_board_id: client.monday_board_id, statut_commercial: 'formulaire_envoye' },
          ['statut_commercial']
        )
        // console.log(`Statut FORMULAIRE ENVOY\u00c9 sync vers Monday pour ${client.raison_sociale}`)
      } catch (syncError) {
        console.error('Erreur sync Monday:', syncError)
      }
    }

    return NextResponse.json({
      success: true,
      message: emailErrors.length > 0
        ? `Client r\u00e9initialis\u00e9, mais erreur d'envoi email: ${emailErrors.join(', ')}`
        : `Client ${client.raison_sociale} r\u00e9initialis\u00e9 avec succ\u00e8s`,
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
