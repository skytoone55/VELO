import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { sendFormulaireLivraisonEmail } from '@/lib/email/gmail'
import { getTenantConfig } from '@/lib/tenants'

/**
 * POST /api/admin/clients/send-formulaire-livraison
 *
 * Envoie le formulaire de choix de creneau de livraison au client.
 *
 * Gardes (bloquantes) :
 * - Le client doit avoir une livraison associee
 * - Le statut commercial doit etre 'a_livrer'
 * - Le creneau ne doit pas deja etre choisi
 *
 * Actions :
 * 1. Genere un token de 64 caracteres hex
 * 2. Stocke le token dans livraisons.token_livraison
 * 3. Envoie l'email avec le lien unique
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(authResult)) return authResult

    const body = await request.json()
    const { clientId } = body

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID requis' }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const tenant = getTenantConfig()

    // Recuperer le client
    const { data: client, error: fetchError } = await adminClient
      .from('clients')
      .select('id, email, email_beneficiaire, raison_sociale, contact_prenom, contact_nom, statut_commercial')
      .eq('id', clientId)
      .single()

    if (fetchError || !client) {
      return NextResponse.json({ error: 'Client non trouve' }, { status: 404 })
    }

    // === GARDES ===

    // Verifier le statut commercial
    const normalizedStatut = (client.statut_commercial || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

    const statutsEligibles = ['a_livrer', 'en_livraison', 'retrait_planifie']
    if (!statutsEligibles.includes(normalizedStatut)) {
      return NextResponse.json({
        error: `Client non eligible : statut commercial doit etre "a_livrer", "en_livraison" ou "retrait_planifie" (actuellement : ${client.statut_commercial || 'aucun'})`,
        guard: 'statut',
      }, { status: 422 })
    }

    // Verifier l'email
    const recipientEmail = client.email_beneficiaire || client.email
    if (!recipientEmail || !recipientEmail.includes('@')) {
      return NextResponse.json({ error: 'Email du beneficiaire manquant ou invalide' }, { status: 400 })
    }

    // Recuperer la livraison du client
    const { data: livraison, error: livraisonError } = await adminClient
      .from('livraisons')
      .select('id, depot_id, mode_livraison, creneau_date, token_livraison')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (livraisonError || !livraison) {
      return NextResponse.json({
        error: 'Aucune livraison trouvee pour ce client',
        guard: 'livraison',
      }, { status: 422 })
    }

    // Si un creneau existe deja, on le reset pour permettre la relance
    if (livraison.creneau_date) {
      await adminClient
        .from('livraisons')
        .update({ creneau_date: null, creneau_heure_debut: null, creneau_heure_fin: null })
        .eq('id', livraison.id)
    }

    // Recuperer le depot pour le nom, l'adresse et les creneaux
    let depotName = 'Depot'
    let depotAddress = ''
    let depotCreneaux: { heure_debut: string; heure_fin: string }[] = []
    if (livraison.depot_id) {
      const { data: depot } = await adminClient
        .from('depots')
        .select('nom, adresse, code_postal, ville, creneaux')
        .eq('id', livraison.depot_id)
        .single()
      if (depot) {
        depotName = depot.nom
        depotAddress = [depot.adresse, depot.code_postal, depot.ville].filter(Boolean).join(', ')
        depotCreneaux = Array.isArray(depot.creneaux) ? depot.creneaux : []
      }
    }

    const clientName = client.contact_prenom && client.contact_nom
      ? `${client.contact_prenom} ${client.contact_nom}`
      : client.raison_sociale

    // 1. Generer le token
    const token = crypto.randomBytes(32).toString('hex')

    // 2. Stocker le token dans la livraison
    const { error: updateError } = await adminClient
      .from('livraisons')
      .update({
        token_livraison: token,
        updated_at: new Date().toISOString(),
      })
      .eq('id', livraison.id)

    if (updateError) {
      console.error('Erreur mise a jour livraison:', updateError)
      return NextResponse.json({ error: 'Erreur lors de la mise a jour' }, { status: 500 })
    }

    // 2b. Mettre a jour le statut commercial du client → en_livraison
    await adminClient
      .from('clients')
      .update({
        statut_commercial: 'en_livraison',
        date_statut: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', clientId)

    // 3. Construire l'URL du formulaire
    const baseUrl = tenant.url || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'
    const formulaireUrl = `${baseUrl}/formulaire-livraison?token=${token}`

    // 4. Envoyer l'email
    let emailError: string | null = null
    try {
      await sendFormulaireLivraisonEmail({
        to: recipientEmail,
        clientName,
        depotName,
        depotAddress,
        depotCreneaux,
        modeLivraison: livraison.mode_livraison,
        formulaireUrl,
        tenantName: tenant.name,
      })
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Erreur inconnue'
      emailError = errMsg
      console.error('Erreur envoi email formulaire livraison:', errMsg)
    }

    return NextResponse.json({
      success: true,
      emailError,
      formulaireUrl,
      message: emailError
        ? `Formulaire livraison envoye avec erreur email : ${emailError}`
        : `Formulaire de livraison envoye a ${recipientEmail}`,
    })
  } catch (error: unknown) {
    console.error('Erreur API send-formulaire-livraison:', error)
    const errMsg = error instanceof Error ? error.message : 'Erreur serveur'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
