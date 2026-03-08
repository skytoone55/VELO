import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantConfig } from '@/lib/tenants'
import crypto from 'crypto'
import { sendEmail } from '@/lib/email/gmail'

/**
 * POST /api/admin/clients/request-documents
 *
 * Body: { clientId: string, documents: string[] }
 * documents = ['urssaf', 'dsn', 'benevoles']
 *
 * Génère un token, enregistre la demande, envoie un email au client.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { clientId, documents } = await request.json()

    if (!clientId || !documents?.length) {
      return NextResponse.json({ error: 'clientId et documents requis' }, { status: 400 })
    }

    const validDocs = ['urssaf', 'dsn', 'benevoles']
    const filteredDocs = documents.filter((d: string) => validDocs.includes(d))
    if (!filteredDocs.length) {
      return NextResponse.json({ error: 'Aucun document valide sélectionné' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Récupérer le client
    const { data: client, error: clientError } = await adminClient
      .from('clients')
      .select('id, raison_sociale, email_beneficiaire, email, documents_demandes')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    const clientEmail = client.email_beneficiaire || client.email
    if (!clientEmail) {
      return NextResponse.json({ error: 'Aucun email pour ce client' }, { status: 400 })
    }

    // Générer token unique
    const token = crypto.randomBytes(32).toString('hex')

    // Construire le JSONB documents_demandes
    const now = new Date().toISOString()
    const demandes: Record<string, { status: string; demande_date: string }> = {}
    for (const doc of filteredDocs) {
      demandes[doc] = { status: 'pending', demande_date: now }
    }

    // Fusionner avec les demandes existantes
    const existingDemandes = (client.documents_demandes as Record<string, unknown>) || {}
    const mergedDemandes = { ...existingDemandes, ...demandes }

    // Mettre à jour le client
    const { error: updateError } = await adminClient
      .from('clients')
      .update({
        token_documents: token,
        documents_demandes: mergedDemandes,
      })
      .eq('id', clientId)

    if (updateError) throw updateError

    // Construire le lien formulaire
    const tenant = getTenantConfig()
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${tenant.id === 'ecovolt' ? 'velo-ecovolt' : 'velo-ppe'}.vercel.app`
    const formLink = `${baseUrl}/documents?token=${token}`

    // Labels des documents
    const docLabels: Record<string, string> = {
      urssaf: 'Attestation URSSAF \u00e0 jour de moins de 3 mois',
      dsn: 'Attestation DSN au format EDI',
      benevoles: 'Attestation de d\u00e9claration de B\u00e9n\u00e9voles',
    }

    const docListHtml = filteredDocs
      .map((d: string) => `<li>${docLabels[d] || d}</li>`)
      .join('')

    // Envoyer l'email
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${tenant.branding.colors.primary || '#333'};">Demande de documents</h2>
        <p>Bonjour,</p>
        <p>Dans le cadre de votre dossier vélo cargo, nous avons besoin des documents suivants :</p>
        <ul style="background: #f5f5f5; padding: 20px 40px; border-radius: 8px;">
          ${docListHtml}
        </ul>
        <p>Cliquez sur le bouton ci-dessous pour téléverser vos documents :</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${formLink}" style="background: ${tenant.branding.colors.primary || '#22c55e'}; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Envoyer mes documents
          </a>
        </div>
        <p style="color: #888; font-size: 12px;">Ce lien est personnel et sécurisé.</p>
      </div>
    `

    // Envoi email direct via gmail.ts
    try {
      await sendEmail({
        to: clientEmail,
        subject: `${tenant.name} \u2014 Demande de documents`,
        html: emailHtml,
      })
    } catch (emailErr) {
      console.error('[request-documents] Erreur envoi email:', emailErr)
    }

    return NextResponse.json({
      success: true,
      token,
      formLink,
      documents: filteredDocs,
      email: clientEmail,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
