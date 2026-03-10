import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError, type AuthenticatedUser } from '@/lib/auth/require-role'

interface DeliveryChecklist {
  fonctionnement: boolean
  cable_recharge: boolean
  photos_cee: boolean
}

interface DeliverBody {
  fnuci_codes: string[]
  checklist: DeliveryChecklist
  signature_base64: string
  photo_identite_base64?: string
  attestation_pdf_base64?: string
  notes?: string
}

/**
 * POST /api/admin/livraisons/[id]/deliver
 * Confirme la livraison : valide FNUCI, met a jour statuts, enregistre signature
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
    if (isAuthError(auth)) return auth
    const currentUser = auth as AuthenticatedUser

    const { id: livraisonId } = await params
    const body: DeliverBody = await request.json()
    const { fnuci_codes, checklist, signature_base64, photo_identite_base64, attestation_pdf_base64, notes } = body

    // --- Validations de base ---
    if (!fnuci_codes || !Array.isArray(fnuci_codes) || fnuci_codes.length === 0) {
      return NextResponse.json(
        { error: 'Au moins un code FNUCI est requis' },
        { status: 400 }
      )
    }

    if (!checklist || !checklist.fonctionnement || !checklist.cable_recharge ||
        !checklist.photos_cee) {
      return NextResponse.json(
        { error: 'Tous les \u00e9l\u00e9ments de la checklist doivent \u00eatre valid\u00e9s' },
        { status: 400 }
      )
    }

    if (!signature_base64) {
      return NextResponse.json(
        { error: 'La signature du b\u00e9n\u00e9ficiaire est requise' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // --- 1. R\u00e9cup\u00e9rer la livraison avec donn\u00e9es client ---
    const { data: livraison, error: livraisonError } = await supabase
      .from('livraisons')
      .select('*')
      .eq('id', livraisonId)
      .single()

    if (livraisonError || !livraison) {
      return NextResponse.json(
        { error: 'Livraison introuvable' },
        { status: 404 }
      )
    }

    if (livraison.statut === 'livree') {
      return NextResponse.json(
        { error: 'Cette livraison a d\u00e9j\u00e0 \u00e9t\u00e9 effectu\u00e9e' },
        { status: 400 }
      )
    }

    // Role-based access check
    if (currentUser.role === 'livreur' && livraison.livreur_id !== currentUser.id) {
      return NextResponse.json(
        { error: 'Acc\u00e8s refus\u00e9' },
        { status: 403 }
      )
    }
    if (currentUser.role === 'agent_secteur' && currentUser.depot_ids?.length && !currentUser.depot_ids.includes(livraison.depot_id)) {
      return NextResponse.json(
        { error: 'Acc\u00e8s refus\u00e9' },
        { status: 403 }
      )
    }

    // R\u00e9cup\u00e9rer le client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', livraison.client_id)
      .single()

    if (clientError || !client) {
      return NextResponse.json(
        { error: 'Client associ\u00e9 introuvable' },
        { status: 404 }
      )
    }

    // --- 2. Valider le nombre de v\u00e9los ---
    const expectedBikes = client.velo_valide || client.velo_devis || 1
    if (fnuci_codes.length !== expectedBikes) {
      return NextResponse.json(
        { error: `Nombre de codes FNUCI incorrect. Attendu : ${expectedBikes}, re\u00e7u : ${fnuci_codes.length}` },
        { status: 400 }
      )
    }

    // --- 3. V\u00e9rifier les doublons dans la liste ---
    const uniqueCodes = new Set(fnuci_codes.map(c => c.toUpperCase()))
    if (uniqueCodes.size !== fnuci_codes.length) {
      return NextResponse.json(
        { error: 'Des codes FNUCI sont en double dans la liste' },
        { status: 400 }
      )
    }

    // --- 4. Valider chaque code FNUCI ---
    const normalizedCodes = fnuci_codes.map(c => c.trim().toUpperCase())
    const { data: fnuciRecords, error: fnuciError } = await supabase
      .from('fnuci')
      .select('*')
      .in('reference', normalizedCodes)

    if (fnuciError) {
      console.error('Erreur FNUCI:', fnuciError)
      return NextResponse.json(
        { error: 'Erreur lors de la v\u00e9rification des codes FNUCI' },
        { status: 500 }
      )
    }

    if (!fnuciRecords || fnuciRecords.length !== normalizedCodes.length) {
      const foundCodes = new Set((fnuciRecords || []).map(r => r.reference))
      const missing = normalizedCodes.filter(c => !foundCodes.has(c))
      return NextResponse.json(
        { error: `Codes FNUCI introuvables : ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    // V\u00e9rifier qu'aucun n'est d\u00e9j\u00e0 attribu\u00e9 \u00e0 un autre client
    const alreadyAttribue = fnuciRecords.filter(
      r => r.statut === 'attribue' && r.client_id !== client.id
    )
    if (alreadyAttribue.length > 0) {
      return NextResponse.json(
        { error: `Codes d\u00e9j\u00e0 attribu\u00e9s : ${alreadyAttribue.map(r => r.reference).join(', ')}` },
        { status: 400 }
      )
    }

    const bloque = fnuciRecords.filter(r => r.statut === 'bloque')
    if (bloque.length > 0) {
      return NextResponse.json(
        { error: `Codes bloqu\u00e9s : ${bloque.map(r => r.reference).join(', ')}` },
        { status: 400 }
      )
    }

    // --- 5. Marquer chaque FNUCI comme attribu\u00e9 ---
    const now = new Date().toISOString()
    for (const fnuci of fnuciRecords) {
      const { error: updateError } = await supabase
        .from('fnuci')
        .update({
          statut: 'attribue',
          client_id: client.id,
          livraison_id: livraisonId,
          attribue_at: now,
        })
        .eq('id', fnuci.id)

      if (updateError) {
        console.error(`Erreur mise \u00e0 jour FNUCI ${fnuci.reference}:`, updateError)
        return NextResponse.json(
          { error: `Erreur lors de l'attribution du code ${fnuci.reference}` },
          { status: 500 }
        )
      }
    }

    // --- 6a. Stocker le PDF dans Supabase storage ---
    let attestationPdfUrl: string | null = null
    if (attestation_pdf_base64) {
      try {
        // Le base64 est au format data:application/pdf;base64,XXXX
        const base64Data = attestation_pdf_base64.split(',')[1] || attestation_pdf_base64
        const pdfBuffer = Buffer.from(base64Data, 'base64')
        const fileName = `attestations/${client.id}/${livraisonId}.pdf`

        const { error: uploadError } = await supabase
          .storage
          .from('documents')
          .upload(fileName, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: true,
          })

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName)
          attestationPdfUrl = urlData.publicUrl
        } else {
          console.error('Erreur upload PDF:', uploadError)
        }
      } catch (pdfErr) {
        console.error('Erreur traitement PDF:', pdfErr)
      }
    }

    // --- 6b. Mettre \u00e0 jour la livraison ---
    const { error: updateLivraisonError } = await supabase
      .from('livraisons')
      .update({
        statut: 'livree',
        date_livraison: now,
        date_livraison_effective: now,
        signature_client: signature_base64,
        photos_livraison: photo_identite_base64 ? { photo_identite: photo_identite_base64 } : undefined,
        notes_internes: notes || null,
        ...(attestationPdfUrl ? { attestation_pdf_url: attestationPdfUrl } : {}),
        updated_at: now,
      })
      .eq('id', livraisonId)

    if (updateLivraisonError) {
      console.error('Erreur mise \u00e0 jour livraison:', updateLivraisonError)
      return NextResponse.json(
        { error: 'Erreur lors de la mise \u00e0 jour de la livraison' },
        { status: 500 }
      )
    }

    // --- 7. Mettre \u00e0 jour le client ---
    const { error: updateClientError } = await supabase
      .from('clients')
      .update({
        statut_commercial: 'livre',
        date_statut: now,
        fnuci_ids: normalizedCodes,
        updated_at: now,
      })
      .eq('id', client.id)

    if (updateClientError) {
      console.error('Erreur mise \u00e0 jour client:', updateClientError)
      return NextResponse.json(
        { error: 'Erreur lors de la mise \u00e0 jour du client' },
        { status: 500 }
      )
    }

    // --- 8. Logger la transition workflow ---
    await supabase.from('workflow_transitions').insert({
      entity_type: 'client',
      entity_id: client.id,
      statut_avant: client.statut_commercial,
      statut_apres: 'livre',
      effectue_par: auth.id,
      raison: `Livraison effectu\u00e9e - ${normalizedCodes.length} v\u00e9lo(s) - FNUCI: ${normalizedCodes.join(', ')}`,
    })

    await supabase.from('workflow_transitions').insert({
      entity_type: 'livraison',
      entity_id: livraisonId,
      statut_avant: livraison.statut,
      statut_apres: 'livree',
      effectue_par: auth.id,
      raison: 'Livraison confirm\u00e9e par le livreur',
    })

    // --- 9. Log audit ---
    await supabase.from('audit_log').insert({
      user_id: auth.id,
      action: 'livraison_confirmee',
      entity_type: 'livraison',
      entity_id: livraisonId,
      details: {
        client_id: client.id,
        fnuci_codes: normalizedCodes,
        checklist,
        notes: notes || null,
      },
    })

    // --- R\u00e9ponse succ\u00e8s ---
    return NextResponse.json({
      success: true,
      message: 'Livraison confirm\u00e9e avec succ\u00e8s',
      data: {
        livraison_id: livraisonId,
        client_id: client.id,
        client_nom: client.raison_sociale,
        contact: `${client.contact_prenom || ''} ${client.contact_nom || ''}`.trim(),
        fnuci_codes: normalizedCodes,
        nb_velos: normalizedCodes.length,
        date_livraison: now,
        adresse: [
          client.adresse_societe_ligne1,
          client.adresse_societe_cp,
          client.adresse_societe_ville,
        ].filter(Boolean).join(', '),
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur POST /api/admin/livraisons/[id]/deliver:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
