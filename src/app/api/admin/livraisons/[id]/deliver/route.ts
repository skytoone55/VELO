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
  attestation_pdf_url?: string
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
    const { fnuci_codes, checklist, signature_base64, photo_identite_base64, attestation_pdf_base64, attestation_pdf_url: clientPdfUrl, notes } = body

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
        { error: 'Tous les éléments de la checklist doivent être validés' },
        { status: 400 }
      )
    }

    if (!signature_base64) {
      return NextResponse.json(
        { error: 'La signature du bénéficiaire est requise' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // --- 1. Récupérer la livraison avec données client ---
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
        { error: 'Cette livraison a déjà été effectuée' },
        { status: 400 }
      )
    }

    // Role-based access check
    if (currentUser.role === 'livreur' && livraison.livreur_id !== currentUser.id) {
      return NextResponse.json(
        { error: 'Accès refusé' },
        { status: 403 }
      )
    }
    if (currentUser.role === 'agent_secteur' && currentUser.depot_ids?.length && !currentUser.depot_ids.includes(livraison.depot_id)) {
      return NextResponse.json(
        { error: 'Accès refusé' },
        { status: 403 }
      )
    }

    // Récupérer le client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', livraison.client_id)
      .single()

    if (clientError || !client) {
      return NextResponse.json(
        { error: 'Client associé introuvable' },
        { status: 404 }
      )
    }

    // --- 2. Valider le nombre de vélos ---
    const expectedBikes = client.velo_valide || client.velo_devis || 1
    if (fnuci_codes.length !== expectedBikes) {
      return NextResponse.json(
        { error: `Nombre de codes FNUCI incorrect. Attendu : ${expectedBikes}, reçu : ${fnuci_codes.length}` },
        { status: 400 }
      )
    }

    // --- 3. Vérifier les doublons dans la liste ---
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
        { error: 'Erreur lors de la vérification des codes FNUCI' },
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

    // Vérifier qu'aucun n'est déjà attribué à un autre client
    const alreadyAttribue = fnuciRecords.filter(
      r => r.statut === 'attribue' && r.client_id !== client.id
    )
    if (alreadyAttribue.length > 0) {
      return NextResponse.json(
        { error: `Codes déjà attribués : ${alreadyAttribue.map(r => r.reference).join(', ')}` },
        { status: 400 }
      )
    }

    const bloque = fnuciRecords.filter(r => r.statut === 'bloque')
    if (bloque.length > 0) {
      return NextResponse.json(
        { error: `Codes bloqués : ${bloque.map(r => r.reference).join(', ')}` },
        { status: 400 }
      )
    }

    // --- 5. Marquer chaque FNUCI comme attribué ---
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
        console.error(`Erreur mise à jour FNUCI ${fnuci.reference}:`, updateError)
        return NextResponse.json(
          { error: `Erreur lors de l'attribution du code ${fnuci.reference}` },
          { status: 500 }
        )
      }
    }

    // --- 6a. Stocker le PDF dans Supabase storage ---
    // Si le frontend a déjà uploadé le PDF, utiliser son URL directement
    let attestationPdfUrl: string | null = clientPdfUrl || null
    if (!attestationPdfUrl && attestation_pdf_base64) {
      try {
        // Le base64 est au format data:application/pdf;base64,XXXX
        const base64Data = attestation_pdf_base64.split(',')[1] || attestation_pdf_base64
        const pdfBuffer = Buffer.from(base64Data, 'base64')
        const refRetina = client.reference_retina || livraisonId
        const fileName = `attestations/${client.id}/${refRetina}-BL.pdf`

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

    // --- 6b. Mettre à jour la livraison ---
    const { error: updateLivraisonError } = await supabase
      .from('livraisons')
      .update({
        statut: 'livree',
        livreur_id: currentUser.id,
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
      console.error('Erreur mise à jour livraison:', updateLivraisonError)
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour de la livraison' },
        { status: 500 }
      )
    }

    // --- 7. Mettre à jour le client ---
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
      console.error('Erreur mise à jour client:', updateClientError)
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour du client' },
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
      raison: `Livraison effectuée - ${normalizedCodes.length} vélo(s) - FNUCI: ${normalizedCodes.join(', ')}`,
    })

    await supabase.from('workflow_transitions').insert({
      entity_type: 'livraison',
      entity_id: livraisonId,
      statut_avant: livraison.statut,
      statut_apres: 'livree',
      effectue_par: auth.id,
      raison: 'Livraison confirmée par le livreur',
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

    // --- Réponse succès ---
    return NextResponse.json({
      success: true,
      message: 'Livraison confirmée avec succès',
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
