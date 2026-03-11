import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateValidationCode, hashValidationCode } from '@/lib/utils'
import { sendCodeValidationEmail, sendFormulaireLinkEmail } from '@/lib/email/gmail'
import { syncClientToMonday } from '@/lib/monday/api'
import { isMondayConfigured } from '@/lib/monday/config'
import { geocodeAddress, buildClientAddress, classifyClientZone, DepotWithCoords } from '@/lib/geo/utils'

type BulkAction = 'send_form' | 'change_status'

interface BulkResult {
  clientId: string
  success: boolean
  error?: string
}

interface BulkResponse {
  action: BulkAction
  total: number
  success: number
  failed: number
  results: BulkResult[]
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users_profile')
      .select('role, territoire')
      .eq('id', user.id)
      .single()

    if (!profile || !['super_admin', 'admin', 'agent_secteur'].includes(profile.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const { action, clientIds, data } = body as {
      action: BulkAction
      clientIds: string[]
      data?: { statut?: string }
    }

    if (!action || !clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
      return NextResponse.json({ error: 'Action et clientIds requis' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    const { data: clients, error: fetchError } = await adminClient
      .from('clients')
      .select('*')
      .in('id', clientIds)

    if (fetchError || !clients) {
      return NextResponse.json({ error: 'Erreur récupération clients' }, { status: 500 })
    }

    if (profile.role === 'admin' && profile.territoire && profile.territoire !== 'FR') {
      const unauthorizedClients = clients.filter(c => c.departement !== profile.territoire)
      if (unauthorizedClients.length > 0) {
        return NextResponse.json({
          error: `Non autorisé pour ${unauthorizedClients.length} client(s) hors de votre territoire`
        }, { status: 403 })
      }
    }

    let response: BulkResponse

    switch (action) {
      case 'send_form':
        response = await handleBulkSendForm(clients, adminClient)
        break
      case 'change_status':
        if (!data?.statut) {
          return NextResponse.json({ error: 'Statut requis pour cette action' }, { status: 400 })
        }
        response = await handleBulkChangeStatus(clients, adminClient, data.statut)
        break
      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 })
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('Erreur API bulk:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function geocodeAndAssignDepot(
  client: any,
  adminClient: ReturnType<typeof createAdminClient>
): Promise<void> {
  if (client.latitude && client.longitude && (client.depot_retrait_id || client.depot_logistique_id)) return

  const address = buildClientAddress(client)
  if (!address) return

  let lat = client.latitude ? parseFloat(client.latitude) : null
  let lng = client.longitude ? parseFloat(client.longitude) : null

  if (!lat || !lng) {
    const geo = await geocodeAddress(address.adresse, address.codePostal, address.ville)
    if (!geo) return
    lat = geo.lat
    lng = geo.lng
  }

  const { data: depots } = await adminClient
    .from('depots')
    .select('id, nom, latitude, longitude, rayon_couverture_km, rayon_livraison_payant_km, prix_livraison_payante, type, agence')

  if (!depots || depots.length === 0) return

  const classification = classifyClientZone(lat, lng, depots as DepotWithCoords[])

  await adminClient
    .from('clients')
    .update({
      latitude: lat.toString(),
      longitude: lng.toString(),
      depot_retrait_id: classification.depotRetraitId,
      depot_logistique_id: classification.depotLogistiqueId,
    })
    .eq('id', client.id)
}

async function handleBulkSendForm(
  clients: any[],
  adminClient: ReturnType<typeof createAdminClient>
): Promise<BulkResponse> {
  const results: BulkResult[] = []
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || 'http://localhost:3001'

  for (const client of clients) {
    try {
      // === GARDE NAF ===
      const nafValid = ['OUI', 'ok', 'oui'].includes(client.validation_naf || '')
      if (!nafValid) {
        results.push({ clientId: client.id, success: false, error: `NAF non validé (${client.validation_naf || 'vide'})` })
        continue
      }

      // === GARDE STATUT ===
      const statutNormalized = (client.statut_commercial || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      if (!['controle_valide', 'formulaire_envoye'].includes(statutNormalized)) {
        results.push({ clientId: client.id, success: false, error: `Statut non éligible (${client.statut_commercial})` })
        continue
      }

      try { await geocodeAndAssignDepot(client, adminClient) } catch (e) { console.error('Geocoding error:', e) }

      const newCode = generateValidationCode()
      const newCodeHash = hashValidationCode(newCode)
      const token = crypto.randomUUID()
      const formulaireUrl = `${baseUrl}/formulaire?token=${token}`

      const { error: updateError } = await adminClient
        .from('clients')
        .update({
          token_formulaire: token,
          statut_commercial: 'formulaire_envoye',
          statut_formulaire: 'formulaire_envoye',
          date_envoi_formulaire: new Date().toISOString(),
          code_validation_hash: newCodeHash,
          code_validation_envoye_at: new Date().toISOString(),
          code_enemat_tentatives: 0,
          code_enemat_bloque: false,
          code_enemat_valide: false,
          code_enemat_saisi: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', client.id)

      if (updateError) {
        results.push({ clientId: client.id, success: false, error: updateError.message })
        continue
      }

      const clientName = client.contact_prenom
        ? `${client.contact_prenom} ${client.contact_nom || ''}`
        : client.raison_sociale || 'Client'

      const recipientEmail = client.email_beneficiaire || client.email
      if (!recipientEmail || !recipientEmail.includes('@')) {
        results.push({ clientId: client.id, success: false, error: 'Email bénéficiaire manquant' })
        continue
      }

      // Envoi 2 emails séparés (comme send-formulaire individuel)
      const emailErrors: string[] = []
      try {
        await sendCodeValidationEmail(recipientEmail, clientName, newCode)
      } catch (e: any) {
        emailErrors.push(`Code email: ${e.message}`)
      }

      // Délai 5s entre les 2 emails (anti rate-limit Office365)
      await new Promise(resolve => setTimeout(resolve, 5000))

      try {
        await sendFormulaireLinkEmail(recipientEmail, clientName, formulaireUrl)
      } catch (e: any) {
        emailErrors.push(`Formulaire email: ${e.message}`)
      }

      if (client.monday_item_id && isMondayConfigured()) {
        try {
          await syncClientToMonday(
            { ...client, statut_formulaire: 'formulaire_envoye' },
            ['statut_formulaire']
          )
        } catch (syncError) {
          console.error('Erreur sync Monday pour client', client.id, syncError)
        }
      }

      results.push({ clientId: client.id, success: true, ...(emailErrors.length ? { error: emailErrors.join(' | ') } : {}) })
    } catch (error: any) {
      await adminClient
        .from('clients')
        .update({ statut_formulaire: 'en_attente' })
        .eq('id', client.id)
      results.push({ clientId: client.id, success: false, error: error.message })
    }
  }

  return {
    action: 'send_form',
    total: clients.length,
    success: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  }
}

async function handleBulkChangeStatus(
  clients: any[],
  adminClient: ReturnType<typeof createAdminClient>,
  newStatut: string
): Promise<BulkResponse> {
  const results: BulkResult[] = []
  const validStatuts = [
    'controle_valide',
    'formulaire_envoye',
    'formulaire_valide',
    'a_livrer',
    'en_livraison',
    'livre',
    'probleme_livraison',
    'a_relivrer',
    'retractation',
    'anomalie',
  ]

  if (!validStatuts.includes(newStatut)) {
    return {
      action: 'change_status',
      total: clients.length,
      success: 0,
      failed: clients.length,
      results: clients.map(c => ({ clientId: c.id, success: false, error: 'Statut invalide' })),
    }
  }

  for (const client of clients) {
    try {
      const { error: updateError } = await adminClient
        .from('clients')
        .update({
          statut_commercial: newStatut,
          date_statut: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', client.id)

      if (updateError) {
        results.push({ clientId: client.id, success: false, error: updateError.message })
        continue
      }

      if (client.monday_item_id && isMondayConfigured()) {
        try {
          await syncClientToMonday(
            { ...client, statut_commercial: newStatut },
            ['statut_commercial']
          )
        } catch (syncError) {
          console.error('Erreur sync Monday pour client', client.id, syncError)
        }
      }

      results.push({ clientId: client.id, success: true })
    } catch (error: any) {
      results.push({ clientId: client.id, success: false, error: error.message })
    }
  }

  return {
    action: 'change_status',
    total: clients.length,
    success: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  }
}
