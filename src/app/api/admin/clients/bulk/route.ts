import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateValidationCode, hashValidationCode } from '@/lib/utils'
import { sendFormulaireLinkEmail } from '@/lib/email/gmail'
import { syncClientToMonday } from '@/lib/monday/api'
import { isMondayConfigured } from '@/lib/monday/config'
import { geocodeAddress, buildClientAddress, classifyClientZone, DepotWithCoords } from '@/lib/geo/utils'
import { getTenantConfig } from '@/lib/tenants'

type BulkAction = 'send_form' | 'change_status' | 'bypass_livraison'

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
    // Vérifier l'authentification
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Vérifier les permissions
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

    // Récupérer tous les clients concernés
    const { data: clients, error: fetchError } = await adminClient
      .from('clients')
      .select('*')
      .in('id', clientIds)

    if (fetchError || !clients) {
      return NextResponse.json({ error: 'Erreur récupération clients' }, { status: 500 })
    }

    // Vérifier les permissions territoriales pour admin regional (FR = accès total)
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
      case 'bypass_livraison':
        response = await handleBulkBypassLivraison(clients, adminClient, user.id)
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
  // Skip si déjà géocodé avec dépôt assigné
  if (client.latitude && client.longitude && (client.depot_retrait_id || client.depot_logistique_id)) return

  const address = buildClientAddress(client)
  if (!address) return

  // Géocoder si pas de coordonnées
  let lat = client.latitude ? parseFloat(client.latitude) : null
  let lng = client.longitude ? parseFloat(client.longitude) : null

  if (!lat || !lng) {
    const geo = await geocodeAddress(address.adresse, address.codePostal, address.ville)
    if (!geo) return
    lat = geo.lat
    lng = geo.lng
  }

  // Récupérer les dépôts pour classification
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
  const tenant = getTenantConfig()
  const baseUrl = tenant.url || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'

  for (const client of clients) {
    try {
      // === GARDE NAF ===
      const nafValid = ['OUI', 'ok', 'oui'].includes(client.validation_naf || '')
      if (!nafValid) {
        results.push({ clientId: client.id, success: false, error: `NAF non validé (${client.validation_naf || 'vide'})` })
        continue
      }

      // Géocoder + assigner dépôt si pas encore fait
      try { await geocodeAndAssignDepot(client, adminClient) } catch (e) { console.error('Geocoding error:', e) }

      // Générer un token unique + code validation
      const newCode = generateValidationCode()
      const newCodeHash = hashValidationCode(newCode)
      const token = `${client.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`
      const formulaireUrl = `${baseUrl}/formulaire?token=${token}`

      // Mettre à jour le client (token formulaire + code validation + statut)
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

      // Envoyer l'email au bénéficiaire (prioritaire) ou commercial (fallback)
      const clientName = client.contact_prenom
        ? `${client.contact_prenom} ${client.contact_nom || ''}`
        : client.raison_sociale || 'Client'

      const recipientEmail = client.email_beneficiaire || client.email
      if (!recipientEmail || !recipientEmail.includes('@')) {
        results.push({ clientId: client.id, success: false, error: 'Email bénéficiaire manquant' })
        continue
      }

      await sendFormulaireLinkEmail(recipientEmail, clientName, formulaireUrl, newCode)

      // Synchroniser vers Monday si configuré
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

      results.push({ clientId: client.id, success: true })
    } catch (error: any) {
      // Remettre le statut en attente si l'email échoue
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

async function handleBulkBypassLivraison(
  clients: any[],
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<BulkResponse> {
  const results: BulkResult[] = []

  for (const client of clients) {
    try {
      // Déjà bypassé / déjà en livraison → on ignore (comme l'action individuelle)
      if (client.bypass_formulaire) {
        results.push({ clientId: client.id, success: false, error: 'Bypass déjà effectué' })
        continue
      }

      const now = new Date().toISOString()

      // Pose le bypass + passage direct au statut "À livrer"
      const { error: updateClientError } = await adminClient
        .from('clients')
        .update({
          bypass_formulaire: true,
          bypass_formulaire_par: userId,
          bypass_formulaire_at: now,
          statut_commercial: 'a_livrer',
          date_statut: now,
          updated_at: now,
        })
        .eq('id', client.id)

      if (updateClientError) {
        results.push({ clientId: client.id, success: false, error: updateClientError.message })
        continue
      }

      // Crée la livraison si aucune active n'existe
      const { data: existingLivraison } = await adminClient
        .from('livraisons')
        .select('id')
        .eq('client_id', client.id)
        .not('statut', 'eq', 'annulee')
        .limit(1)
        .maybeSingle()

      if (!existingLivraison) {
        const depotId = client.depot_logistique_id || client.depot_retrait_id || null
        await adminClient
          .from('livraisons')
          .insert({
            client_id: client.id,
            statut: 'a_livrer',
            mode_livraison: client.depot_retrait_id ? 'retrait' : 'livraison',
            depot_id: depotId,
            created_at: now,
            updated_at: now,
          })
      }

      // Trace la transition
      await adminClient.from('workflow_transitions').insert({
        entity_type: 'client',
        entity_id: client.id,
        statut_avant: client.statut_commercial,
        statut_apres: 'a_livrer',
        effectue_par: userId,
        raison: `Bypass formulaire (masse) — passage direct en livraison (${client.raison_sociale})`,
      })

      results.push({ clientId: client.id, success: true })
    } catch (error: any) {
      results.push({ clientId: client.id, success: false, error: error.message })
    }
  }

  return {
    action: 'bypass_livraison',
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
  // 10 statuts process valides
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
      // Mettre à jour le statut_commercial (pas statut_formulaire)
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

      // Sync statut client \u2194 livraison
      const statutLivraisonMap: Record<string, string> = {
        en_livraison: 'en_livraison',
        a_livrer: 'a_livrer',
        livre: 'livree',
      }
      const newLivraisonStatut = statutLivraisonMap[newStatut]
      if (newLivraisonStatut) {
        await adminClient
          .from('livraisons')
          .update({
            statut: newLivraisonStatut,
            updated_at: new Date().toISOString(),
          })
          .eq('client_id', client.id)
          .not('statut', 'in', '("annulee","retractation")')
      }

      // Synchroniser vers Monday si configuré
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
