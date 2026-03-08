import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'Token requis' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    const { data: client, error } = await adminClient
      .from('clients')
      .select('id, raison_sociale, documents_demandes, attestation_urssaf_url, attestation_dsn_url, declaration_benevoles_url')
      .eq('token_documents', token)
      .single()

    if (error || !client) {
      return NextResponse.json({ error: 'Token invalide ou expiré' }, { status: 404 })
    }

    const demandes = (client.documents_demandes as Record<string, { status: string }>) || {}
    const pendingDocs = Object.entries(demandes)
      .filter(([, v]) => v.status === 'pending')
      .map(([k]) => k)

    if (!pendingDocs.length) {
      return NextResponse.json({ error: 'Tous les documents ont déjà été reçus' }, { status: 400 })
    }

    return NextResponse.json({
      clientId: client.id,
      raisonSociale: client.raison_sociale,
      documentsRequis: pendingDocs,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
