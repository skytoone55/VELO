import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

type BoolPaymentField =
  | 'commercial_apf_envoye'
  | 'commercial_paye'
  | 'livreur_apf_envoye'
  | 'livreur_paye'

interface BulkUpdatesBody {
  commercial_apf_envoye?: boolean
  commercial_paye?: boolean
  livreur_apf_envoye?: boolean
  livreur_paye?: boolean
  paiement_livreur_id?: string | null
  commercial_code?: string | null
  // enemat_paye est REFUSE ici : le statut ENEMAT est gere par le module ENEMAT.
  enemat_paye?: never
}

const BOOL_FIELDS: BoolPaymentField[] = [
  'commercial_apf_envoye',
  'commercial_paye',
  'livreur_apf_envoye',
  'livreur_paye',
]

/**
 * PATCH /api/admin/paiements/bulk
 * Mise a jour en masse des champs paiement sur un lot de clients.
 *
 * Body : { client_ids: string[], updates: BulkUpdatesBody }
 * - Les booleens true  → set aussi le timestamp `*_le = now()`
 * - Les booleens false → set aussi `*_le = null`
 *
 * Validation : tous les client_ids doivent etre LIVRES (statut_commercial = 'livre').
 *   Le paiement ne depend PAS d'ENEMAT : un livreur/commercial peut etre paye des que
 *   la livraison est faite, meme avant le depot ENEMAT.
 * Refuse : tout body contenant `enemat_paye` (gere par le module ENEMAT).
 * Acces : super_admin uniquement.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin'])
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const { client_ids, updates } = body as {
      client_ids: string[]
      updates: Record<string, any>
    }

    if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
      return NextResponse.json({ error: 'client_ids requis (tableau non vide)' }, { status: 400 })
    }
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'updates requis' }, { status: 400 })
    }

    // Garde-fou : ENEMAT n'est pas modifiable ici
    if ('enemat_paye' in updates || 'enemat_paye_le' in updates) {
      return NextResponse.json(
        { error: 'le statut ENEMAT est géré dans le module ENEMAT, pas modifiable ici' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Verifier que tous les clients sont bien LIVRES (le paiement ne depend pas d'ENEMAT)
    const { data: existing, error: fetchError } = await supabase
      .from('clients')
      .select('id, statut_commercial, commercial_apf_envoye, commercial_paye, livreur_apf_envoye, livreur_paye')
      .in('id', client_ids)

    if (fetchError) {
      console.error('Erreur PATCH /api/admin/paiements/bulk (fetch):', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Filtre 1 : le client doit etre LIVRE (paiement independant d'ENEMAT — un livreur
    // peut etre paye des que la livraison est faite, meme avant le depot ENEMAT).
    let eligibleRows = (existing || []).filter((c: any) => c.statut_commercial === 'livre')

    // Filtre 2 : verrou anti-doublon — si on met a true un flag deja a true, on ignore ce client
    // (evite les "marquer paye" en double ou "APF envoye" en double)
    const skippedAlreadyDone: string[] = []
    eligibleRows = eligibleRows.filter((c: any) => {
      for (const field of BOOL_FIELDS) {
        if (field in updates && updates[field] === true && c[field] === true) {
          skippedAlreadyDone.push(c.id)
          return false
        }
      }
      return true
    })

    const eligibleIds = eligibleRows.map((c: any) => c.id as string)

    if (eligibleIds.length === 0) {
      return NextResponse.json({
        error: skippedAlreadyDone.length > 0
          ? `Aucun client eligible : ${skippedAlreadyDone.length} deja traite(s) pour cette action.`
          : 'Aucun client eligible (client non livre)',
        updated: 0,
        alreadyDone: skippedAlreadyDone.length,
      }, { status: 400 })
    }

    const now = new Date().toISOString()
    const payload: Record<string, any> = { updated_at: now }

    // Booleens + timestamps jumeaux
    for (const field of BOOL_FIELDS) {
      if (field in updates && typeof updates[field] === 'boolean') {
        const val = updates[field] as boolean
        payload[field] = val
        payload[`${field}_le`] = val ? now : null
      }
    }

    // Assignations (paiement_livreur_id, commercial_code)
    if ('paiement_livreur_id' in updates) {
      payload.paiement_livreur_id = updates.paiement_livreur_id || null
    }
    if ('commercial_code' in updates) {
      payload.commercial_code = updates.commercial_code || null
    }

    // Au moins un champ mutable doit etre fourni (hors updated_at)
    if (Object.keys(payload).length <= 1) {
      return NextResponse.json({ error: 'Aucun champ a mettre a jour' }, { status: 400 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('clients')
      .update(payload)
      .in('id', eligibleIds)
      .select('id')

    if (updateError) {
      console.error('Erreur PATCH /api/admin/paiements/bulk (update):', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      updated: (updated || []).length,
      rejected: client_ids.length - eligibleIds.length,
      alreadyDone: skippedAlreadyDone.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur PATCH /api/admin/paiements/bulk:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
