import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateValidationCode, hashValidationCode } from '@/lib/utils'
import { sendCodeValidationEmail, sendFormulaireLinkEmail } from '@/lib/email/gmail'
import { syncClientToMonday } from '@/lib/monday/sync'
import { isMondayConfigured } from '@/lib/monday/config'

type BulkAction = 'send_code' | 'send_form' | 'change_status'

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

    if (!profile || !['admin_general', 'admin_regional', 'agent_regional'].includes(profile.role)) {
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

    // Vérifier les permissions territoriales pour admin_regional
    if (profile.role === 'admin_regional') {
      const unauthorizedClients = clients.filter(c => c.departement !== profile.territoire)
      if (unauthorizedClients.length > 0) {
        return NextResponse.json({
          error: `Non autorisé pour ${unauthorizedClients.length} client(s) hors de votre territoire`
        }, { status: 403 })
      }
    }

    let response: BulkResponse

    switch (action) {
      case 'send_code':
        response = await handleBulkSendCode(clients, adminClient)
        break
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

async function handleBulkSendCode(
  clients: any[],
  adminClient: ReturnType<typeof createAdminClient>
): Promise<BulkResponse> {
  const results: BulkResult[] = []

  for (const client of clients) {
    try {
      // Générer un nouveau code
      const newCode = generateValidationCode()
      const newCodeHash = hashValidationCode(newCode)

      // Mettre à jour le client
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
        .eq('id', client.id)

      if (updateError) {
        results.push({ clientId: client.id, success: false, error: updateError.message })
        continue
      }

      // Envoyer l'email
      const clientName = client.contact_prenom && client.contact_nom
        ? `${client.contact_prenom} ${client.contact_nom}`
        : client.raison_sociale

      await sendCodeValidationEmail(client.email, clientName, newCode)
      results.push({ clientId: client.id, success: true })
    } catch (error: any) {
      results.push({ clientId: client.id, success: false, error: error.message })
    }
  }

  return {
    action: 'send_code',
    total: clients.length,
    success: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  }
}

async function handleBulkSendForm(
  clients: any[],
  adminClient: ReturnType<typeof createAdminClient>
): Promise<BulkResponse> {
  const results: BulkResult[] = []
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'

  for (const client of clients) {
    try {
      // Générer un token unique
      const token = `${client.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`
      const formulaireUrl = `${baseUrl}/formulaire?token=${token}`

      // Mettre à jour le client
      const { error: updateError } = await adminClient
        .from('clients')
        .update({
          token_formulaire: token,
          statut_formulaire: 'formulaire_envoye',
          date_envoi_formulaire: new Date().toISOString(),
        })
        .eq('id', client.id)

      if (updateError) {
        results.push({ clientId: client.id, success: false, error: updateError.message })
        continue
      }

      // Envoyer l'email
      const clientName = client.contact_prenom
        ? `${client.contact_prenom} ${client.contact_nom || ''}`
        : client.raison_sociale || 'Client'

      await sendFormulaireLinkEmail(client.email, clientName, formulaireUrl)

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

async function handleBulkChangeStatus(
  clients: any[],
  adminClient: ReturnType<typeof createAdminClient>,
  newStatut: string
): Promise<BulkResponse> {
  const results: BulkResult[] = []
  const validStatuts = ['en_attente', 'formulaire_envoye', 'formulaire_complete', 'valide']

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
      // Mettre à jour le statut
      const { error: updateError } = await adminClient
        .from('clients')
        .update({
          statut_formulaire: newStatut,
          updated_at: new Date().toISOString(),
        })
        .eq('id', client.id)

      if (updateError) {
        results.push({ clientId: client.id, success: false, error: updateError.message })
        continue
      }

      // Synchroniser vers Monday si configuré
      if (client.monday_item_id && isMondayConfigured()) {
        try {
          await syncClientToMonday(
            { ...client, statut_formulaire: newStatut },
            ['statut_formulaire']
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
