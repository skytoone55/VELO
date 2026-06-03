import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError, type AuthenticatedUser } from '@/lib/auth/require-role'

/**
 * POST /api/admin/enemat/import-status
 *
 * Import d'un fichier Excel pour passer une liste de clients DIRECTEMENT a un
 * statut ENEMAT cible (apf_enemat ou paye_enemat).
 *
 * Format du fichier (titre en ligne 1, donnees a partir de la ligne 2) :
 *   - APF  : colonne A = reference Retina, colonne B = numero de lot (par ligne)
 *   - Paye : colonne A = reference Retina ; le numero de facture (commun a tout
 *            le fichier) est fourni dans le champ form-data `numero_facture`.
 *
 * Bypass volontaire du workflow strict : un client a n'importe quel stade peut
 * sauter en APF ou en Paye. Date du statut = jour de l'import.
 *
 * Form-data : file (xlsx/xls) + statut ('apf_enemat' | 'paye_enemat')
 *             [+ numero_facture (requis pour paye_enemat)]
 * Acces : super_admin uniquement.
 */

const TARGET_STATUTS = ['apf_enemat', 'paye_enemat'] as const
type TargetStatut = typeof TARGET_STATUTS[number]

const DATE_FIELD: Record<TargetStatut, string> = {
  apf_enemat: 'date_apf_enemat',
  paye_enemat: 'date_paye_enemat',
}

const STATUT_LABEL: Record<TargetStatut, string> = {
  apf_enemat: 'APF',
  paye_enemat: 'Payé',
}

/** Normalise une valeur de cellule : trim. */
function normalizeCell(value: unknown): string {
  return String(value ?? '').trim()
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin'])
    if (isAuthError(auth)) return auth
    const currentUser = auth as AuthenticatedUser

    const formData = await request.formData()
    const file = formData.get('file')
    const statut = String(formData.get('statut') || '') as TargetStatut
    const numeroFacture = normalizeCell(formData.get('numero_facture'))

    if (!TARGET_STATUTS.includes(statut)) {
      return NextResponse.json(
        { error: `Statut cible invalide. Valeurs acceptées : ${TARGET_STATUTS.join(', ')}` },
        { status: 400 }
      )
    }
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Fichier Excel manquant' }, { status: 400 })
    }
    if (statut === 'paye_enemat' && numeroFacture.length === 0) {
      return NextResponse.json({ error: 'Numéro de facture requis pour le passage en Payé' }, { status: 400 })
    }

    // Lecture du fichier Excel
    const buffer = Buffer.from(await (file as Blob).arrayBuffer())
    let rows: unknown[][]
    try {
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) {
        return NextResponse.json({ error: 'Fichier Excel vide (aucune feuille)' }, { status: 400 })
      }
      rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })
    } catch {
      return NextResponse.json({ error: 'Fichier illisible (format Excel attendu : .xlsx ou .xls)' }, { status: 400 })
    }

    // Colonne A = ref Retina (à partir de la ligne 2). Colonne B = numéro de lot (APF).
    const refToLot = new Map<string, string>()
    const refs: string[] = []
    for (const r of rows.slice(1)) {
      const arr = Array.isArray(r) ? r : [r]
      const ref = normalizeCell(arr[0])
      if (ref.length === 0) continue
      const lot = normalizeCell(arr[1])
      if (!refToLot.has(ref)) refs.push(ref)
      refToLot.set(ref, lot) // dernière occurrence l'emporte
    }

    if (refs.length === 0) {
      return NextResponse.json(
        { error: 'Aucune référence Retina trouvée (colonne A, à partir de la ligne 2)' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()

    // Récupérer les clients correspondants
    const { data: matched, error: fetchError } = await supabase
      .from('clients')
      .select('id, reference_retina, statut_enemat, date_entree_enemat')
      .in('reference_retina', refs)

    if (fetchError) {
      console.error('Erreur POST /api/admin/enemat/import-status (fetch):', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const matchedClients = (matched || []) as {
      id: string
      reference_retina: string | null
      statut_enemat: string | null
      date_entree_enemat: string | null
    }[]
    const matchedRefs = new Set(matchedClients.map(c => c.reference_retina))
    const notFound = refs.filter(ref => !matchedRefs.has(ref))

    if (matchedClients.length === 0) {
      return NextResponse.json(
        {
          error: `Aucune référence du fichier ne correspond à un client (${refs.length} référence(s) cherchée(s)).`,
          total_refs: refs.length,
          not_found: notFound,
        },
        { status: 400 }
      )
    }

    const matchedIds = matchedClients.map(c => c.id)

    // Update principal : statut + date du statut + in_enemat + updated_at
    const updatePayload: Record<string, unknown> = {
      statut_enemat: statut,
      in_enemat: true,
      updated_at: now,
      [DATE_FIELD[statut]]: now,
    }
    if (statut === 'paye_enemat') {
      updatePayload.numero_facture_enemat = numeroFacture
    }
    const { error: updateError } = await supabase
      .from('clients')
      .update(updatePayload)
      .in('id', matchedIds)

    if (updateError) {
      console.error('Erreur POST /api/admin/enemat/import-status (update):', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // APF : poser le numéro de lot par groupe (chaque client a son lot, issu de la colonne B)
    let lotsAppliques = 0
    if (statut === 'apf_enemat') {
      const lotGroups = new Map<string, string[]>()
      for (const c of matchedClients) {
        const lot = refToLot.get(c.reference_retina || '') || ''
        if (lot.length === 0) continue
        const arr = lotGroups.get(lot) || []
        arr.push(c.id)
        lotGroups.set(lot, arr)
      }
      for (const [lot, ids] of lotGroups) {
        const { error: lotError } = await supabase
          .from('clients')
          .update({ numero_lot_enemat: lot })
          .in('id', ids)
        if (lotError) {
          console.error('Erreur POST /api/admin/enemat/import-status (lot):', lotError)
        } else {
          lotsAppliques += ids.length
        }
      }
    }

    // Poser date_entree_enemat uniquement sur ceux qui n'en ont pas encore
    const idsSansEntree = matchedClients.filter(c => !c.date_entree_enemat).map(c => c.id)
    if (idsSansEntree.length > 0) {
      const { error: entreeError } = await supabase
        .from('clients')
        .update({ date_entree_enemat: now })
        .in('id', idsSansEntree)
      if (entreeError) {
        console.error('Erreur POST /api/admin/enemat/import-status (date_entree):', entreeError)
      }
    }

    // Historique
    const noteSuffix =
      statut === 'apf_enemat'
        ? 'passage direct en APF (lot depuis Excel)'
        : `passage direct en Payé (facture ${numeroFacture})`
    const historyRows = matchedClients.map(c => ({
      client_id: c.id,
      statut_avant: c.statut_enemat,
      statut_apres: statut,
      changed_by: currentUser.id,
      changed_at: now,
      notes: `Import Excel — ${noteSuffix}`,
    }))
    const { error: histError } = await supabase.from('enemat_history').insert(historyRows)
    if (histError) {
      console.error('Erreur POST /api/admin/enemat/import-status (history):', histError)
    }

    return NextResponse.json({
      success: true,
      statut,
      statut_label: STATUT_LABEL[statut],
      total_refs: refs.length,
      updated: matchedIds.length,
      lots_appliques: lotsAppliques,
      numero_facture: statut === 'paye_enemat' ? numeroFacture : undefined,
      not_found_count: notFound.length,
      not_found: notFound,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur POST /api/admin/enemat/import-status:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
