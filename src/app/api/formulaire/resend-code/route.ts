import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateValidationCode, hashValidationCode } from '@/lib/utils'
import { sendCodeValidationEmail } from '@/lib/email/gmail'

/**
 * API publique pour renvoyer le code de validation depuis le formulaire client.
 * Pas d'auth admin requise — le clientId sert d'identifiant.
 * Protection : cooldown de 2 minutes entre chaque renvoi.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clientId } = body

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID requis' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Récupérer le client
    const { data: client, error: fetchError } = await adminClient
      .from('clients')
      .select('id, email, email_beneficiaire, raison_sociale, contact_prenom, contact_nom, code_validation_envoye_at')
      .eq('id', clientId)
      .single()

    if (fetchError || !client) {
      return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })
    }

    // Cooldown : 2 minutes entre chaque renvoi
    if (client.code_validation_envoye_at) {
      const lastSent = new Date(client.code_validation_envoye_at).getTime()
      const now = Date.now()
      const cooldownMs = 2 * 60 * 1000 // 2 minutes
      if (now - lastSent < cooldownMs) {
        const remainingSec = Math.ceil((cooldownMs - (now - lastSent)) / 1000)
        return NextResponse.json({
          error: `Veuillez patienter ${remainingSec} secondes avant de renvoyer le code.`,
          cooldown: remainingSec,
        }, { status: 429 })
      }
    }

    const recipientEmail = client.email_beneficiaire || client.email
    if (!recipientEmail || !recipientEmail.includes('@')) {
      return NextResponse.json({
        error: 'Aucune adresse email associée à votre dossier. Contactez votre conseiller.',
      }, { status: 400 })
    }

    // Générer un nouveau code
    const newCode = generateValidationCode()
    const newCodeHash = hashValidationCode(newCode)

    // Mettre à jour en base (reset tentatives + blocage)
    const { error: updateError } = await adminClient
      .from('clients')
      .update({
        code_validation_hash: newCodeHash,
        code_validation_envoye_at: new Date().toISOString(),
        code_enemat_tentatives: 0,
        code_enemat_bloque: false,
        code_enemat_valide: false,
        code_enemat_saisi: null,
      })
      .eq('id', clientId)

    if (updateError) {
      console.error('Erreur mise à jour client:', updateError)
      return NextResponse.json({ error: 'Erreur lors du renvoi' }, { status: 500 })
    }

    // Envoyer l'email
    const clientName = client.contact_prenom && client.contact_nom
      ? `${client.contact_prenom} ${client.contact_nom}`
      : client.raison_sociale

    await sendCodeValidationEmail(recipientEmail, clientName, newCode)
    console.log(`[Formulaire] Code renvoyé à ${recipientEmail} pour client ${clientId}`)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Erreur API formulaire/resend-code:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
