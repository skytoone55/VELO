import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/** Convertit un numéro français (06...) en format international (+336...) */
function formatPhoneInternational(phone: string): string {
  const cleaned = phone.replace(/[\s.-]/g, '')
  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return '+33' + cleaned.slice(1)
  }
  return cleaned ? '+33' + cleaned : ''
}

/**
 * POST /api/admin/fnuci/declare
 * Déclare les vélos FNUCI auprès de Bicycode (API OBike)
 * Body: { client_ids: string[] }
 *
 * Credentials FNUCI = env vars par tenant :
 *   FNUCI_API_URL, FNUCI_USERNAME, FNUCI_PASSWORD,
 *   FNUCI_CLIENT_ID, FNUCI_CLIENT_SECRET, FNUCI_DMS_CODE
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin'])
    if (isAuthError(auth)) return auth

    const { client_ids } = await request.json()

    if (!client_ids?.length) {
      return NextResponse.json({ error: 'Aucun client sélectionné' }, { status: 400 })
    }

    // Charger les credentials FNUCI (env vars par tenant)
    const apiUrl = process.env.FNUCI_API_URL
    const username = process.env.FNUCI_USERNAME
    const password = process.env.FNUCI_PASSWORD
    const clientId = process.env.FNUCI_CLIENT_ID
    const clientSecret = process.env.FNUCI_CLIENT_SECRET
    const dmsCode = process.env.FNUCI_DMS_CODE

    if (!apiUrl || !username || !password || !clientId || !clientSecret || !dmsCode) {
      return NextResponse.json(
        { error: 'Credentials FNUCI non configurés pour ce tenant' },
        { status: 500 }
      )
    }

    const supabase = createAdminClient()

    // Récupérer les clients avec leurs FNUCI
    const { data: clients, error: fetchError } = await supabase
      .from('clients')
      .select('id, raison_sociale, telephone, email_beneficiaire, adresse_societe_ligne1, adresse_societe_cp, adresse_societe_ville, fnuci_ids, fnuci_declared')
      .in('id', client_ids)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!clients?.length) {
      return NextResponse.json({ error: 'Clients introuvables' }, { status: 404 })
    }

    // Filtrer les clients déjà déclarés ou sans FNUCI
    const toProcess = clients.filter(c =>
      !c.fnuci_declared &&
      c.fnuci_ids &&
      Array.isArray(c.fnuci_ids) &&
      c.fnuci_ids.length > 0
    )

    if (toProcess.length === 0) {
      return NextResponse.json({
        error: 'Tous les clients sélectionnés sont déjà déclarés ou n\'ont pas de codes FNUCI',
      }, { status: 400 })
    }

    // 1. Obtenir le token OAuth
    const tokenRes = await fetch(`${apiUrl}/obikeapi/dms/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DMS-Code': dmsCode,
      },
      body: JSON.stringify({
        grant_type: 'password',
        username,
        password,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      console.error('FNUCI token error:', errBody)
      return NextResponse.json(
        { error: `Erreur authentification FNUCI: ${tokenRes.status}` },
        { status: 502 }
      )
    }

    const { access_token } = await tokenRes.json()

    // 2. Déclarer chaque vélo
    const results: { clientId: string; raison_sociale: string; bikeId: string; success: boolean; error?: string }[] = []
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

    for (const client of toProcess) {
      const fnuciCodes = client.fnuci_ids as string[]

      for (const bikeId of fnuciCodes) {
        try {
          const bikeRes = await fetch(`${apiUrl}/obikeapi/dms/bikes`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${access_token}`,
              'DMS-Code': dmsCode,
            },
            body: JSON.stringify({
              bike_id: bikeId,
              operation_date: now,
              bike_status: 1,
              bike_description: {
                gear_type_id: 1,
                gear_type: 'Velo cargo',
                brand: 'CARGO LAND',
                model: 'CRG468',
                color: 'NOIR',
                is_electric: true,
                identification_channel: 'NEWBIKEPURCHASE',
              },
              bike_owner: {
                gender: 2,
                social_reason: client.raison_sociale,
                phone: formatPhoneInternational(client.telephone || ''),
                mail: client.email_beneficiaire || '',
                address: {
                  street_name: client.adresse_societe_ligne1 || '',
                  postal_code: client.adresse_societe_cp || '',
                  city: client.adresse_societe_ville || '',
                  country: 'FR',
                },
              },
            }),
          })

          if (bikeRes.ok) {
            results.push({ clientId: client.id, raison_sociale: client.raison_sociale, bikeId, success: true })
          } else {
            const errText = await bikeRes.text()
            console.error(`FNUCI declare error for ${bikeId}:`, errText)
            results.push({ clientId: client.id, raison_sociale: client.raison_sociale, bikeId, success: false, error: `HTTP ${bikeRes.status}` })
          }
        } catch (err) {
          console.error(`FNUCI declare exception for ${bikeId}:`, err)
          results.push({ clientId: client.id, raison_sociale: client.raison_sociale, bikeId, success: false, error: String(err) })
        }
      }

      // Si tous les vélos du client sont OK, marquer comme déclaré
      const clientResults = results.filter(r => r.clientId === client.id)
      const allSuccess = clientResults.every(r => r.success)

      if (allSuccess) {
        await supabase
          .from('clients')
          .update({ fnuci_declared: true, fnuci_declared_at: new Date().toISOString() })
          .eq('id', client.id)
      }
    }

    const totalSuccess = results.filter(r => r.success).length
    const totalFailed = results.filter(r => !r.success).length
    const clientsDeclared = [...new Set(results.filter(r => r.success).map(r => r.clientId))].length

    return NextResponse.json({
      success: true,
      summary: {
        bikes_declared: totalSuccess,
        bikes_failed: totalFailed,
        clients_declared: clientsDeclared,
        clients_total: toProcess.length,
      },
      details: results,
    })

  } catch (error) {
    console.error('FNUCI declare error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
