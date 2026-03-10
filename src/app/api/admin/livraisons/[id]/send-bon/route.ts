import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBonLivraisonEmail } from '@/lib/email/gmail'

/**
 * POST /api/admin/livraisons/[id]/send-bon
 * Envoie le bon de livraison/retrait par email au client
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
    if (isAuthError(auth)) return auth

    const { id: livraisonId } = await params
    const adminClient = createAdminClient()

    // Récupérer la livraison avec le client
    const { data: livraison, error: livError } = await adminClient
      .from('livraisons')
      .select(`
        id, statut, attestation_pdf_url, mode_livraison,
        client:clients!client_id (
          id, raison_sociale, contact_nom, contact_prenom,
          email_beneficiaire, email
        )
      `)
      .eq('id', livraisonId)
      .single()

    if (livError || !livraison) {
      return NextResponse.json({ error: 'Livraison non trouvée' }, { status: 404 })
    }

    const client = livraison.client as any
    if (!client) {
      return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })
    }

    const recipientEmail = client.email_beneficiaire || client.email
    if (!recipientEmail) {
      return NextResponse.json({ error: 'Aucun email pour ce client' }, { status: 400 })
    }

    if (!livraison.attestation_pdf_url) {
      return NextResponse.json({ error: 'Aucun bon de livraison disponible' }, { status: 400 })
    }

    // Télécharger le PDF depuis le storage
    const pdfPath = livraison.attestation_pdf_url.replace(/^.*\/storage\/v1\/object\/public\//, '')
    const bucketName = pdfPath.split('/')[0]
    const filePath = pdfPath.split('/').slice(1).join('/')

    const { data: pdfData, error: dlError } = await adminClient
      .storage
      .from(bucketName)
      .download(filePath)

    if (dlError || !pdfData) {
      return NextResponse.json({ error: 'Impossible de récupérer le PDF' }, { status: 500 })
    }

    const pdfBuffer = Buffer.from(await pdfData.arrayBuffer())
    const beneficiaire = [client.contact_prenom, client.contact_nom].filter(Boolean).join(' ') || client.raison_sociale
    const modeLivraison = livraison.mode_livraison === 'retrait' ? 'retrait' : 'livraison'

    await sendBonLivraisonEmail({
      to: recipientEmail,
      beneficiaire,
      raisonSociale: client.raison_sociale,
      modeLivraison,
      pdfBuffer,
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('Erreur send-bon:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
