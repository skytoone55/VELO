import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/webhooks/retrait
 *
 * ⚠️  ECOVOLT UNIQUEMENT — Ce endpoint n'est utilise que par le tenant Ecovolt.
 * PPE a son propre module de livraison interne (/admin/livraisons/deliver).
 * Ne JAMAIS etendre ce webhook a PPE sans validation explicite.
 *
 * Callback entrant depuis l'app ecovolt-retrait (module de livraison externe
 * gere par l'associe). Recoit les donnees de livraison apres validation
 * par l'agent terrain, met a jour (ou cree) la livraison et le client
 * dans Supabase Ecovolt.
 *
 * Chaque appel est enregistre dans la table webhook_logs pour suivi.
 *
 * Fichiers (PDF + CI) : recus en base64, stockes dans Supabase Storage.
 * Cle de liaison : reference_retina (ENEMAT) — identifiant unique du client.
 * Fallback : monday_item_id.
 *
 * Securite : secret partage via header X-Callback-Secret.
 */

const STORAGE_BUCKET = 'livraisons-documents'

async function uploadBase64ToStorage(
  supabase: ReturnType<typeof createAdminClient>,
  base64Data: string,
  folder: string,
  filename: string
): Promise<string | null> {
  try {
    let mimeType = 'application/pdf'
    let cleanBase64 = base64Data

    if (base64Data.startsWith('data:')) {
      const match = base64Data.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        mimeType = match[1]
        cleanBase64 = match[2]
      }
    }

    const buffer = Buffer.from(cleanBase64, 'base64')
    const path = `${folder}/${filename}`

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: true,
      })

    if (error) {
      console.error(`Erreur upload ${path}:`, error)
      return null
    }

    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path)

    return urlData.publicUrl
  } catch (err) {
    console.error(`Erreur upload base64 ${filename}:`, err)
    return null
  }
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  let logId: string | null = null

  try {
    // 1. Valider le secret
    const secret = request.headers.get('x-callback-secret')
    const expectedSecret = process.env.ECOVOLT_RETRAIT_WEBHOOK_SECRET
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parser le body
    const body = await request.json()
    const {
      reference_retina,
      monday_item_id,
      fnuci_codes,
      bike_count,
      completed_at,
      pdf_base64,
      id_photo_base64,
    } = body

    // 3. Creer le log webhook immediatement (status=pending)
    const rawPayload = { ...body }
    // Ne pas stocker les base64 dans le log (trop volumineux)
    delete rawPayload.pdf_base64
    delete rawPayload.id_photo_base64

    const { data: logRow } = await supabase
      .from('webhook_logs')
      .insert({
        source: 'ecovolt_retrait',
        reference_retina: reference_retina || null,
        monday_item_id: monday_item_id || null,
        status: 'pending',
        fnuci_codes: fnuci_codes || null,
        bike_count: bike_count || null,
        has_pdf: !!pdf_base64,
        has_id_photo: !!id_photo_base64,
        completed_at: completed_at || null,
        raw_payload: rawPayload,
      })
      .select('id')
      .single()

    logId = logRow?.id || null

    if (!reference_retina && !monday_item_id) {
      await updateLog(supabase, logId, 'error', 'reference_retina ou monday_item_id requis')
      return NextResponse.json(
        { error: 'reference_retina ou monday_item_id requis' },
        { status: 400 }
      )
    }

    // 4. Trouver le client
    const clientFields = 'id, raison_sociale, depot_retrait_id, depot_logistique_id, adresse_societe_ligne1, adresse_societe_cp, adresse_societe_ville, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville'

    let client: { id: string; raison_sociale: string | null; depot_retrait_id: string | null; depot_logistique_id: string | null; adresse_societe_ligne1: string | null; adresse_societe_cp: string | null; adresse_societe_ville: string | null; adresse_livraison_ligne1: string | null; adresse_livraison_cp: string | null; adresse_livraison_ville: string | null } | null = null

    if (reference_retina) {
      const { data } = await supabase
        .from('clients')
        .select(clientFields)
        .eq('reference_retina', String(reference_retina))
        .single()
      client = data
    }

    if (!client && monday_item_id) {
      const { data } = await supabase
        .from('clients')
        .select(clientFields)
        .eq('monday_item_id', String(monday_item_id))
        .single()
      client = data
    }

    if (!client) {
      await updateLog(supabase, logId, 'error', `Client introuvable (ref=${reference_retina}, monday=${monday_item_id})`)
      return NextResponse.json(
        { error: 'Client introuvable', reference_retina, monday_item_id },
        { status: 404 }
      )
    }

    // Rattacher le client au log
    if (logId) {
      await supabase.from('webhook_logs').update({ client_id: client.id }).eq('id', logId)
    }

    // 5. Trouver ou CREER la livraison
    let livraison: { id: string; statut: string } | null = null
    let livraisonCreated = false

    const { data: existingLiv } = await supabase
      .from('livraisons')
      .select('id, statut')
      .eq('client_id', client.id)
      .neq('statut', 'livree')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existingLiv) {
      livraison = existingLiv
    } else {
      const { data: alreadyDone } = await supabase
        .from('livraisons')
        .select('id')
        .eq('client_id', client.id)
        .eq('statut', 'livree')
        .limit(1)
        .single()

      if (alreadyDone) {
        await updateLog(supabase, logId, 'duplicate', 'Client deja livre', alreadyDone.id)
        return NextResponse.json({
          success: true,
          already_completed: true,
          livraison_id: alreadyDone.id,
          client_id: client.id,
        })
      }

      // Pas de livraison → auto-creation
      const { data: newLiv, error: createErr } = await supabase
        .from('livraisons')
        .insert({
          client_id: client.id,
          depot_id: client.depot_logistique_id || client.depot_retrait_id,
          mode_livraison: client.adresse_livraison_ligne1 ? 'domicile' : 'retrait',
          adresse_livraison_ligne1: client.adresse_livraison_ligne1 || client.adresse_societe_ligne1,
          adresse_livraison_cp: client.adresse_livraison_cp || client.adresse_societe_cp,
          adresse_livraison_ville: client.adresse_livraison_ville || client.adresse_societe_ville,
          statut: 'a_livrer',
          source_livraison: 'ecovolt_retrait',
        })
        .select('id, statut')
        .single()

      if (createErr || !newLiv) {
        await updateLog(supabase, logId, 'error', `Erreur creation livraison: ${createErr?.message}`)
        return NextResponse.json({ error: 'Erreur creation livraison' }, { status: 500 })
      }

      livraison = newLiv
      livraisonCreated = true
    }

    const now = completed_at || new Date().toISOString()
    const clientRef = reference_retina || monday_item_id || client.id

    // 6. Stocker les fichiers base64
    let pdfUrl: string | null = null
    let idPhotoUrl: string | null = null

    if (pdf_base64) {
      pdfUrl = await uploadBase64ToStorage(
        supabase, pdf_base64,
        `retrait/${clientRef}`,
        `attestation-livraison.pdf`
      )
    }

    if (id_photo_base64) {
      const ext = id_photo_base64.startsWith('data:image/png') ? 'png' : 'jpg'
      idPhotoUrl = await uploadBase64ToStorage(
        supabase, id_photo_base64,
        `retrait/${clientRef}`,
        `carte-identite.${ext}`
      )
    }

    // 7. Mettre a jour la livraison → livree
    const livUpdate: Record<string, unknown> = {
      statut: 'livree',
      date_livraison: now,
      date_livraison_effective: now,
      source_livraison: 'ecovolt_retrait',
    }
    if (pdfUrl) livUpdate.attestation_pdf_url = pdfUrl

    const { error: livError } = await supabase
      .from('livraisons')
      .update(livUpdate)
      .eq('id', livraison.id)

    if (livError) {
      await updateLog(supabase, logId, 'error', `Erreur update livraison: ${livError.message}`, livraison.id)
      return NextResponse.json({ error: 'Erreur update livraison' }, { status: 500 })
    }

    // 8. Mettre a jour le client → livre
    const clientUpdate: Record<string, unknown> = {
      statut_commercial: 'livre',
      date_statut: now,
      updated_at: now,
    }
    if (fnuci_codes && Array.isArray(fnuci_codes) && fnuci_codes.length > 0) {
      clientUpdate.fnuci_ids = fnuci_codes
    }
    if (bike_count) clientUpdate.velo_valide = bike_count
    if (idPhotoUrl) clientUpdate.piece_identite_url = idPhotoUrl

    await supabase.from('clients').update(clientUpdate).eq('id', client.id)

    // 8b. Creer/mettre a jour les records FNUCI individuels (comme PPE)
    if (fnuci_codes && Array.isArray(fnuci_codes) && fnuci_codes.length > 0) {
      for (const code of fnuci_codes) {
        const ref = String(code).trim().toUpperCase()
        if (!ref) continue

        // Chercher si le code existe deja dans la table fnuci
        const { data: existing } = await supabase
          .from('fnuci')
          .select('id')
          .eq('reference', ref)
          .limit(1)
          .single()

        if (existing) {
          // Mettre a jour le record existant → attribue + lien client/livraison
          await supabase.from('fnuci').update({
            statut: 'attribue',
            client_id: client.id,
            livraison_id: livraison.id,
            attribue_at: now,
          }).eq('id', existing.id)
        } else {
          // Creer un nouveau record FNUCI
          await supabase.from('fnuci').insert({
            numero: 0, // sera mis a jour lors du prochain sync Monday
            reference: ref,
            statut: 'attribue',
            client_id: client.id,
            livraison_id: livraison.id,
            attribue_at: now,
          })
        }
      }
    }

    // 9. Log succes
    await updateLog(supabase, logId, 'success', null, livraison.id)

    console.log(
      `[webhook/retrait] ${client.raison_sociale} (${clientRef}) → livraison ${livraison.id} livree.`,
      { fnuci_codes, bike_count, pdf: !!pdfUrl, photo: !!idPhotoUrl, created: livraisonCreated }
    )

    return NextResponse.json({
      success: true,
      livraison_id: livraison.id,
      client_id: client.id,
      created_livraison: livraisonCreated,
      files: { pdf: !!pdfUrl, id_photo: !!idPhotoUrl },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur interne'
    await updateLog(supabase, logId, 'error', msg)
    console.error('Erreur webhook retrait:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}

async function updateLog(
  supabase: ReturnType<typeof createAdminClient>,
  logId: string | null,
  status: string,
  errorMessage: string | null,
  livraisonId?: string,
) {
  if (!logId) return
  const update: Record<string, unknown> = { status }
  if (errorMessage) update.error_message = errorMessage
  if (livraisonId) update.livraison_id = livraisonId
  try { await supabase.from('webhook_logs').update(update).eq('id', logId) } catch { /* ignore */ }
}
