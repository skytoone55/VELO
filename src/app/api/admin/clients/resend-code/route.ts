import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateValidationCode, hashValidationCode } from '@/lib/utils'
import { sendCodeValidationEmail } from '@/lib/email/gmail'
import { syncClientToMonday, isMondayConfigured } from '@/lib/monday/api'

export async function POST(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Vérifier les permissions
    const { data: profile } = await supabase
      .from('users_profile')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin_general', 'admin_regional', 'agent_regional'].includes(profile.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const { clientId } = body

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

    // Mettre à jour le client avec le nouveau code
    const { error: updateError } = await adminClient
      .from('clients')
      .update({
        code_validation_hash: newCodeHash,
        code_validation_envoye_at: new Date().toISOString(),
        // Réinitialiser les tentatives et le blocage
        code_enemat_tentatives: 0,
        code_enemat_bloque: false,
        code_enemat_valide: false,
        code_enemat_saisi: null,
      })
      .eq('id', clientId)

    if (updateError) {
      console.error('Erreur mise à jour client:', updateError)
      return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 })
    }

    // Envoyer l'email avec le nouveau code au bénéficiaire (prioritaire) ou commercial (fallback)
    const clientName = client.contact_prenom && client.contact_nom
      ? `${client.contact_prenom} ${client.contact_nom}`
      : client.raison_sociale

    const recipientEmail = client.email_beneficiaire || client.email
    if (!recipientEmail || !recipientEmail.includes('@')) {
      return NextResponse.json({
        error: 'Email du bénéficiaire manquant ou invalide'
      }, { status: 400 })
    }

    try {
      await sendCodeValidationEmail(recipientEmail, clientName, newCode)
      console.log(`Nouveau code de validation envoyé à ${recipientEmail}`)
    } catch (emailError) {
      console.error('Erreur envoi email:', emailError)
      return NextResponse.json({ error: 'Erreur lors de l\'envoi de l\'email' }, { status: 500 })
    }

    // Sync vers Monday - mettre le statut "CODE ENVOYÉ"
    if (client.monday_item_id && isMondayConfigured()) {
      try {
        await syncClientToMonday(
          { monday_item_id: client.monday_item_id, monday_board_id: client.monday_board_id, statut_commercial: 'code_envoye' },
          ['statut_commercial']
        )
        console.log(`Statut CODE ENVOYÉ sync vers Monday pour ${client.raison_sociale}`)
      } catch (syncError) {
        console.error('Erreur sync Monday:', syncError)
        // Ne pas bloquer si la sync échoue
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Erreur API resend-code:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
