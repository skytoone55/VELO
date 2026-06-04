import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { extractText, getDocumentProxy } from 'unpdf'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * POST /api/admin/paiements/import-facture
 *
 * Import d'une facture (annexe d'appel à facture générée par le système) d'un
 * commercial ou d'un livreur. On extrait les références Retina (PDF texte ou Excel),
 * on les recoupe avec la base, et on marque les clients correspondants comme
 * payés côté commercial OU livreur (paiements indépendants : une réf a les deux).
 *
 * Form-data : file (pdf/xlsx) + type ('commercial' | 'livreur')
 * Accès : super_admin uniquement.
 *
 * Sécurité : on ne fait jamais confiance à l'extraction seule — chaque réf est
 * recoupée avec la base. Une réf mal lue ne matche aucun client → ressort en
 * "introuvable" (jamais de paiement erroné). Gate ENEMAT identique à /bulk.
 */

const TYPES = ['commercial', 'livreur'] as const
type FactureType = typeof TYPES[number]

const PAYE_FIELD: Record<FactureType, 'commercial_paye' | 'livreur_paye'> = {
  commercial: 'commercial_paye',
  livreur: 'livreur_paye',
}

const ELIGIBLE_STATUTS = new Set(['depose_enemat', 'apf_enemat', 'paye_enemat'])

/** Réf Retina = 8 caractères hexadécimaux (ex: 131b0982). */
const REF_RETINA_RE = /\b[0-9a-f]{8}\b/gi

/**
 * Extrait les réf Retina d'un PDF texte.
 * Le client/livreur envoie souvent un PDF multi-pages = SA facture + l'annexe
 * (la liste) qu'on lui a fournie. On ne lit donc QUE la/les page(s) de l'annexe,
 * repérée(s) par l'en-tête « Réf Retina » (présent uniquement sur le tableau).
 * La page facture est ignorée → pas de faux positif venant du n° de facture, etc.
 * Fallback : si aucune page « annexe » détectée, on lit tout (ancien format).
 */
async function extractRefsFromPdf(buffer: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(buffer)
  const { text } = await extractText(pdf, { mergePages: false })
  const pages: string[] = Array.isArray(text) ? text.map(String) : [String(text)]

  // Page d'annexe = contient le mot "retina" (en-tête de colonne "Réf Retina")
  const annexePages = pages.filter(p => /retina/i.test(p))
  const target = annexePages.length > 0 ? annexePages : pages

  const refs: string[] = []
  for (const p of target) {
    const matches = p.toLowerCase().match(REF_RETINA_RE)
    if (matches) refs.push(...matches)
  }
  return refs
}

/** Extrait les réf Retina d'un Excel (colonne dont l'entête contient "retina", sinon colonne B). */
function extractRefsFromXlsx(buffer: Buffer): string[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })
  if (rows.length === 0) return []

  // Trouver la colonne "Réf Retina" via l'entête (ligne 1), sinon colonne B (index 1)
  const header = (rows[0] as unknown[]).map(h => String(h ?? '').toLowerCase())
  let col = header.findIndex(h => h.includes('retina') || h.includes('réf') || h.includes('ref'))
  if (col === -1) col = 1

  const refs: string[] = []
  for (const r of rows.slice(1)) {
    const arr = Array.isArray(r) ? r : [r]
    const val = String(arr[col] ?? '').trim().toLowerCase()
    if (/^[0-9a-f]{8}$/.test(val)) refs.push(val)
  }
  return refs
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin'])
    if (isAuthError(auth)) return auth

    const formData = await request.formData()
    const file = formData.get('file')
    const type = String(formData.get('type') || '') as FactureType

    if (!TYPES.includes(type)) {
      return NextResponse.json({ error: `Type invalide (commercial|livreur)` }, { status: 400 })
    }
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })
    }

    const blob = file as File
    const name = (blob.name || '').toLowerCase()
    const arrayBuf = await blob.arrayBuffer()

    // Extraction des réf Retina selon le format
    let refsRaw: string[] = []
    try {
      if (name.endsWith('.pdf')) {
        refsRaw = await extractRefsFromPdf(new Uint8Array(arrayBuf))
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        refsRaw = extractRefsFromXlsx(Buffer.from(arrayBuf))
      } else {
        return NextResponse.json({ error: 'Format non supporté (PDF ou Excel attendu)' }, { status: 400 })
      }
    } catch (e) {
      console.error('Erreur extraction facture:', e)
      return NextResponse.json({ error: 'Impossible de lire le fichier (PDF texte ou Excel attendu)' }, { status: 400 })
    }

    const refs = [...new Set(refsRaw.map(r => r.trim().toLowerCase()).filter(Boolean))]
    if (refs.length === 0) {
      return NextResponse.json({ error: 'Aucune référence Retina trouvée dans le fichier' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const paidField = PAYE_FIELD[type]

    // Récupérer les clients correspondants
    const { data: matched, error: fetchError } = await supabase
      .from('clients')
      .select(`id, raison_sociale, reference_retina, velo_valide, statut_enemat, ${paidField}`)
      .in('reference_retina', refs)

    if (fetchError) {
      console.error('Erreur import-facture (fetch):', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const matchedClients = (matched || []) as Array<Record<string, unknown>>
    const matchedRefs = new Set(matchedClients.map(c => c.reference_retina as string))
    const notFound = refs.filter(r => !matchedRefs.has(r))

    // BLOCAGE STRICT anti double-paiement : on ne peut PAS payer 2× le même dossier
    // (côté livreur ou commercial). Si UN seul client de la facture est déjà payé
    // pour ce côté → on ABANDONNE tout l'import (aucune modification) et on signale
    // les dossiers en problème (popup rouge côté front).
    const dejaPayes = matchedClients
      .filter(c => c[paidField] === true)
      .map(c => ({
        reference_retina: c.reference_retina as string,
        raison_sociale: (c.raison_sociale as string) || '—',
      }))
    if (dejaPayes.length > 0) {
      return NextResponse.json({
        blocked: true,
        type,
        error: `Import refusé : ${dejaPayes.length} dossier(s) déjà payé(s) côté ${type}. Aucune modification effectuée.`,
        deja_payes: dejaPayes,
      }, { status: 409 })
    }

    // Gate ENEMAT (identique à /bulk) — les non éligibles sont signalés, pas payés.
    const notEligible: string[] = []
    const toPayIds: string[] = []
    let velosToPay = 0
    for (const c of matchedClients) {
      if (!ELIGIBLE_STATUTS.has(c.statut_enemat as string)) {
        notEligible.push(c.reference_retina as string)
        continue
      }
      toPayIds.push(c.id as string)
      velosToPay += (c.velo_valide as number) || 0
    }

    const now = new Date().toISOString()
    if (toPayIds.length > 0) {
      const { error: updateError } = await supabase
        .from('clients')
        .update({ [paidField]: true, [`${paidField}_le`]: now, updated_at: now })
        .in('id', toPayIds)
      if (updateError) {
        console.error('Erreur import-facture (update):', updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      type,
      total_refs: refs.length,
      paid: toPayIds.length,
      velos_payes: velosToPay,
      not_eligible: notEligible.length,
      not_found: notFound.length,
      details: {
        not_eligible: notEligible,
        not_found: notFound,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur POST /api/admin/paiements/import-facture:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
