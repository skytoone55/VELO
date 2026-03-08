import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const token = formData.get('token') as string
    const docType = formData.get('docType') as string
    const file = formData.get('file') as File

    if (!token || !docType || !file) {
      return NextResponse.json({ error: 'token, docType et file requis' }, { status: 400 })
    }

    const validTypes = ['urssaf', 'dsn', 'benevoles']
    if (!validTypes.includes(docType)) {
      return NextResponse.json({ error: 'Type de document invalide' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    const { data: client, error: clientError } = await adminClient
      .from('clients')
      .select('id, documents_demandes')
      .eq('token_documents', token)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 404 })
    }

    const ext = file.name.split('.').pop() || 'pdf'
    const storagePath = `${client.id}/${docType}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await adminClient
      .storage
      .from('client-documents')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) throw uploadError

    const { data: signedData } = await adminClient
      .storage
      .from('client-documents')
      .createSignedUrl(storagePath, 365 * 24 * 60 * 60)

    const fileUrl = signedData?.signedUrl || storagePath

    const columnMap: Record<string, string> = {
      urssaf: 'attestation_urssaf_url',
      dsn: 'attestation_dsn_url',
      benevoles: 'declaration_benevoles_url',
    }

    const demandes = (client.documents_demandes as Record<string, Record<string, string>>) || {}
    if (demandes[docType]) {
      demandes[docType].status = 'received'
      demandes[docType].recu_date = new Date().toISOString()
    }

    const updatePayload: Record<string, unknown> = {
      [columnMap[docType]]: fileUrl,
      documents_demandes: demandes,
    }

    const { error: updateError } = await adminClient
      .from('clients')
      .update(updatePayload)
      .eq('id', client.id)

    if (updateError) throw updateError

    return NextResponse.json({ success: true, docType, url: fileUrl })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
