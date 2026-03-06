import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { generateValidationCode, hashValidationCode } from '@/lib/utils'
import { sendCodeValidationEmail, sendFormulaireLinkEmail } from '@/lib/email/gmail'
import { syncClientToMonday, isMondayConfigured } from '@/lib/monday/api'

/**
 * POST /api/admin/clients/send-formulaire
 *
 * Envoie le code de validation + le lien du formulaire en une seule action.
 *
 * Gardes (bloquantes) :
 * - validation_naf doit être 'OUI'
 * - statut_commercial doit être 'controle_valide'
 *
 * Actions :
 * 1. Génère un code de validation + hash
 * 2. Génère un token formulaire
 * 3. Envoie l'email du code
 * 4. Envoie l'email du formulaire
 * 5. Met à jour statut_commercial → 'formulaire_envoye' (Supabase + Monday)
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(['admin_general', 'admin_regional', 'agent_regional'])
    if (isAuthError(authResult)) return authResult

    const body = await request.json()
    const { clientId } = body

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID requis' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Récupérer le client avec les champs nécessaires
    const { data: client, error: fetchError } = await adminClient
      .from('clients')
      .select('id, email, email_beneficiaire, raison_sociale, contact_prenom, contact_nom, monday_item_id, monday_board_id, validation_naf, statut_commercial')
      .eq('id', clientId)
      .single()

    if (fetchError || !client) {
      return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })
    }

    // === GARDES ===
    if (client.validation_naf !== 'OUI') {
      return NextResponse.json({
        error: 'Client non éligible : code NAF non validé (NAF doit être OUI)',
        guard: 'naf',
      }, { status: 422 })
    }

    // Normaliser le statut (PPE peut stocker les labels Monday bruts avec accents)
    const normalizedStatut = (client.statut_commercial || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Retirer les accents
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    const isControleValide = normalizedStatut === 'controle_valide' || normalizedStatut === 'control_valide'

    if (!isControleValide) {
      return NextResponse.json({
        error: `Client non éligible : statut commercial doit être "Contrôle validé" (actuellement : ${client.statut_commercial || 'aucun'})`,
        guard: 'statut',
      }, { status: 422 })
    }

    // Vérifier l'email
    const recipientEmail = client.email_beneficiaire || client.email
    if (!recipientEmail || !recipientEmail.includes('@')) {
      return NextResponse.json({ error: 'Email du bénéficiaire manquant ou invalide' }, { status: 400 })
    }

    const clientName = client.contact_prenom && client.contact_nom
      ? `${client.contact_prenom} ${client.contact_nom}`
      : client.raison_sociale

    // 1. Générer le code de validation
    const newCode = generateValidationCode()
    const newCodeHash = hashValidationCode(newCode)

    // 2. Générer le token formulaire
    const token = crypto.randomUUID()

    // 3. Mettre à jour le client en une seule requête
    const { error: updateError } = await adminClient
      .from('clients')
      .update({
        code_validation_hash: newCodeHash,
        code_validation_envoye_at: new Date().toISOString(),
        code_enemat_tentatives: 0,
        code_enemat_bloque: false,
        code_enemat_valide: false,
        code_enemat_saisi: null,
        token_formulaire: token,
        statut_commercial: 'formulaire_envoye',
        date_envoi_formulaire: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', clientId)

    if (updateError) {
      console.error('Erreur mise à jour client:', updateError)
      return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 })
    }

    // 4. Envoyer l'email du code
    const emailErrors: string[] = []
    try {
      await sendCodeValidationEmail(recipientEmail, clientName, newCode)
    } catch (err: any) {
      emailErrors.push(`Code: ${err.message || 'Erreur inconnue'}`)
    }

    // 5. Envoyer l'email du formulaire
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || 'http://localhost:3001'
    const formulaireUrl = `${baseUrl}/formulaire?token=${token}`

    try {
      await sendFormulaireLinkEmail(recipientEmail, clientName, formulaireUrl)
    } catch (err: any) {
      emailErrors.push(`Formulaire: ${err.message || 'Erreur inconnue'}`)
    }

    // 6. Sync vers Monday
    if (client.monday_item_id && isMondayConfigured()) {
      try {
        await syncClientToMonday(
          {
            monday_item_id: client.monday_item_id,
            monday_board_id: client.monday_board_id,
            statut_commercial: 'formulaire_envoye',
          },
          ['statut_commercial']
        )
      } catch (syncError) {
        console.error('Erreur sync Monday:', syncError)
      }
    }

    return NextResponse.json({
      success: true,
      emailErrors,
      formulaireUrl,
      message: emailErrors.length > 0
        ? `Formulaire envoyé avec erreurs email : ${emailErrors.join(', ')}`
        : `Code + formulaire envoyés à ${recipientEmail}`,
    })
  } catch (error: any) {
    console.error('Erreur API send-formulaire:', error)
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 })
  }
}
