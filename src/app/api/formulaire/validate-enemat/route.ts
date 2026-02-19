import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyValidationCode } from '@/lib/utils'
import { syncClientToMonday, isMondayConfigured } from '@/lib/monday/api'
import { getTenantConfig } from '@/lib/tenants'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clientId, code } = body

    if (!clientId || !code) {
      return NextResponse.json(
        { error: 'Client ID et code requis', valid: false },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // Récupérer l'état actuel du client avec le hash du code de validation
    const { data: client, error: fetchError } = await adminClient
      .from('clients')
      .select('code_enemat_tentatives, code_enemat_bloque, code_enemat_valide, code_validation_hash')
      .eq('id', clientId)
      .single()

    if (fetchError || !client) {
      return NextResponse.json(
        { error: 'Client non trouvé', valid: false },
        { status: 404 }
      )
    }

    // Vérifier si déjà bloqué
    if (client.code_enemat_bloque) {
      return NextResponse.json({
        valid: false,
        blocked: true,
        message: 'Code bloqué après 3 tentatives. Contactez-nous au 07 57 99 11 25',
      })
    }

    // Vérifier si déjà validé
    if (client.code_enemat_valide) {
      return NextResponse.json({
        valid: true,
        alreadyValidated: true,
        message: 'Code déjà validé',
      })
    }

    // Validation du code - vérifier contre le hash stocké
    // Si pas de hash en base (ancien client), on refuse
    let isValid = false
    if (client.code_validation_hash) {
      isValid = verifyValidationCode(code, client.code_validation_hash)
    }

    const tentatives = (client.code_enemat_tentatives || 0) + 1
    const nouveauBloque = !isValid && tentatives >= 3

    // Mettre à jour en base - stocker aussi le code saisi si valide
    const updateData: Record<string, any> = {
      code_enemat_tentatives: tentatives,
      code_enemat_valide: isValid,
      code_enemat_bloque: nouveauBloque,
      date_validation_code: isValid ? new Date().toISOString() : null,
    }

    // Stocker le code saisi pour référence (visible dans la fiche client)
    if (isValid) {
      updateData.code_enemat_saisi = code
    }

    const { error: updateError } = await adminClient
      .from('clients')
      .update(updateData)
      .eq('id', clientId)

    if (updateError) {
      console.error('Erreur update client:', updateError)
      return NextResponse.json(
        { error: 'Erreur lors de la validation', valid: false },
        { status: 500 }
      )
    }

    if (isValid) {
      // Sync vers Monday si configuré
      if (isMondayConfigured()) {
        try {
          // Récupérer le monday_item_id du client
          const { data: clientData } = await adminClient
            .from('clients')
            .select('monday_item_id')
            .eq('id', clientId)
            .single()

          if (clientData?.monday_item_id) {
            await syncClientToMonday(
              { monday_item_id: clientData.monday_item_id, code_enemat_saisi: code },
              ['code_enemat_saisi']
            )
          }
        } catch (syncError) {
          console.error('Erreur sync Monday code ENEMAT:', syncError)
          // Ne pas bloquer si la sync échoue
        }
      }

      return NextResponse.json({
        valid: true,
        message: 'Code validé avec succès',
      })
    }

    if (nouveauBloque) {
      // Créer alerte admin
      await adminClient.from('email_alerts').insert({
        type: 'enemat_echec',
        client_id: clientId,
        message: 'Client bloqué après 3 tentatives code ENEMAT',
        details: { tentatives: 3 },
      })

      const tenant = getTenantConfig()
      return NextResponse.json({
        valid: false,
        blocked: true,
        message: `Code invalide. Vous avez atteint la limite de tentatives. Contactez ${tenant.name} au ${tenant.phoneFormatted} ou ${tenant.email}`,
      })
    }

    return NextResponse.json({
      valid: false,
      tentativesRestantes: 3 - tentatives,
      message: `Code invalide. ${3 - tentatives} tentative(s) restante(s).`,
    })

  } catch (error: any) {
    console.error('Erreur API validate-enemat:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur', valid: false },
      { status: 500 }
    )
  }
}
