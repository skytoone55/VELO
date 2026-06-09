import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

type ExportMode = 'commercial' | 'livreur' | 'depot'

interface ExportBody {
  tenant?: string
  // Nouveaux champs pluriels (multi-select)
  depot_ids?: string[]
  livreur_ids?: string[]
  commercial_codes?: string[]
  // Retrocompat singulier
  depot_id?: string
  paiement_livreur_id?: string
  commercial_code?: string
  // Nouveau filtre ENEMAT (statut complet) — prioritaire sur enemat_paye legacy
  statut_enemat?: 'depose_enemat' | 'apf_enemat' | 'paye_enemat'
  enemat_paye?: boolean
  commercial_paye?: boolean
  livreur_paye?: boolean
  commercial_apf_envoye?: boolean
  livreur_apf_envoye?: boolean
  search?: string
  lot?: string
  facture?: string
  zone?: string
  // Filtre Controle qualite : 'oui' (CQ valide) | 'non' (le reste)
  controle?: 'oui' | 'non'
  export_mode: ExportMode
}

/**
 * POST /api/admin/paiements/export
 * Genere un fichier XLSX des clients LIVRES (paiement independant d'ENEMAT), selon filtres + mode d'export.
 *
 * Body : mêmes filtres que GET /api/admin/paiements + export_mode.
 * Acces : super_admin uniquement.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin'])
    if (isAuthError(auth)) return auth

    const body = (await request.json()) as ExportBody

    if (!body.export_mode || !['commercial', 'livreur', 'depot'].includes(body.export_mode)) {
      return NextResponse.json({ error: 'export_mode invalide (commercial|livreur|depot)' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // CQ valide (table livraisons) -> set pour la colonne "Controle valide" + le filtre 'controle'
    const { data: cqRows } = await supabase.from('livraisons').select('client_id').eq('cq_valide', true)
    const cqOkIds = [...new Set((cqRows || []).map((r: any) => r.client_id).filter(Boolean))] as string[]
    const cqOkSet = new Set(cqOkIds)

    let query = supabase
      .from('clients')
      .select(
        `id, raison_sociale, reference_retina, telephone, email,
         adresse_societe_ligne1, adresse_societe_cp, adresse_societe_ville, departement,
         commercial_assigne, commercial_code, monday_board_id,
         depot_retrait_id, depot_logistique_id, paiement_livreur_id,
         statut_enemat, date_depot_enemat, date_apf_enemat, date_paye_enemat,
         numero_lot_enemat, numero_facture_enemat,
         commercial_apf_envoye, commercial_apf_envoye_le,
         commercial_paye, commercial_paye_le,
         livreur_apf_envoye, livreur_apf_envoye_le,
         livreur_paye, livreur_paye_le,
         paiement_notes, velo_valide,
         depot_retrait:depot_retrait_id (id, nom),
         depot_logistique:depot_logistique_id (id, nom),
         commercial:commercial_code (code, nom, parent_code),
         livreur:paiement_livreur_id (id, nom, prenom, email)`
      )
      .eq('statut_commercial', 'livre')
      .order('date_depot_enemat', { ascending: false, nullsFirst: false })

    // Resolution des filtres multi-select (pluriel prioritaire, sinon fallback singulier)
    const depotIds = Array.isArray(body.depot_ids) && body.depot_ids.length > 0
      ? body.depot_ids
      : (body.depot_id ? [body.depot_id] : [])
    const livreurIds = Array.isArray(body.livreur_ids) && body.livreur_ids.length > 0
      ? body.livreur_ids
      : (body.paiement_livreur_id ? [body.paiement_livreur_id] : [])
    const commercialCodes = Array.isArray(body.commercial_codes) && body.commercial_codes.length > 0
      ? body.commercial_codes
      : (body.commercial_code ? [body.commercial_code] : [])

    if (depotIds.length === 1) {
      query = query.or(`depot_retrait_id.eq.${depotIds[0]},depot_logistique_id.eq.${depotIds[0]}`)
    } else if (depotIds.length > 1) {
      const orParts = depotIds.flatMap((id: string) => [
        `depot_retrait_id.eq.${id}`,
        `depot_logistique_id.eq.${id}`,
      ])
      query = query.or(orParts.join(','))
    }
    if (livreurIds.length === 1) query = query.eq('paiement_livreur_id', livreurIds[0])
    else if (livreurIds.length > 1) query = query.in('paiement_livreur_id', livreurIds)
    if (commercialCodes.length === 1) query = query.eq('commercial_code', commercialCodes[0])
    else if (commercialCodes.length > 1) query = query.in('commercial_code', commercialCodes)
    // Filtre ENEMAT : statut_enemat (4 valeurs) prioritaire, fallback enemat_paye legacy
    const ENEMAT_VALEURS_PAIEMENTS = ['depose_enemat', 'apf_enemat', 'paye_enemat']
    if (body.statut_enemat && ENEMAT_VALEURS_PAIEMENTS.includes(body.statut_enemat)) {
      query = query.eq('statut_enemat', body.statut_enemat)
    } else if (typeof body.enemat_paye === 'boolean') {
      if (body.enemat_paye) query = query.eq('statut_enemat', 'paye_enemat')
      else query = query.neq('statut_enemat', 'paye_enemat')
    }
    if (typeof body.commercial_paye === 'boolean') query = query.eq('commercial_paye', body.commercial_paye)
    if (typeof body.livreur_paye === 'boolean') query = query.eq('livreur_paye', body.livreur_paye)
    if (typeof body.commercial_apf_envoye === 'boolean') query = query.eq('commercial_apf_envoye', body.commercial_apf_envoye)
    if (typeof body.livreur_apf_envoye === 'boolean') query = query.eq('livreur_apf_envoye', body.livreur_apf_envoye)
    if (body.search) {
      const safe = body.search.replace(/[%,]/g, ' ').trim()
      if (safe) {
        query = query.or(`raison_sociale.ilike.%${safe}%,reference_retina.ilike.%${safe}%`)
      }
    }
    if (body.lot === '__none__') query = query.is('numero_lot_enemat', null)
    else if (body.lot === '__any__') query = query.not('numero_lot_enemat', 'is', null)
    else if (body.lot) query = query.ilike('numero_lot_enemat', `%${body.lot}%`)
    if (body.facture === '__none__') query = query.is('numero_facture_enemat', null)
    else if (body.facture === '__any__') query = query.not('numero_facture_enemat', 'is', null)
    else if (body.facture) query = query.ilike('numero_facture_enemat', `%${body.facture}%`)

    if (body.zone && body.zone !== 'all') {
      const zones = body.zone.split(',').filter(Boolean)
      if (zones.length === 1) query = query.eq('type_de_zone', zones[0])
      else if (zones.length > 1) query = query.in('type_de_zone', zones)
    }
    if (body.controle === 'oui') {
      query = cqOkIds.length > 0
        ? query.in('id', cqOkIds)
        : query.eq('id', '00000000-0000-0000-0000-000000000000')
    } else if (body.controle === 'non' && cqOkIds.length > 0) {
      query = query.not('id', 'in', `(${cqOkIds.join(',')})`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Erreur POST /api/admin/paiements/export:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (data || []) as any[]

    const depotName = (r: any) => (r.depot_retrait?.nom ?? r.depot_logistique?.nom ?? r.depot?.nom ?? '')
    const commercialName = (r: any) =>
      r.commercial?.nom || r.commercial_assigne || r.commercial_code || ''
    const livreurName = (r: any) =>
      r.livreur ? [r.livreur.prenom, r.livreur.nom].filter(Boolean).join(' ') : ''
    const fmtDate = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : '')
    const fmtBool = (v: any) => (v ? 'Oui' : 'Non')
    const enematPaye = (r: any) => r.statut_enemat === 'paye_enemat'

    // Colonnes communes
    const commonColumns: { header: string; get: (r: any) => any }[] = [
      { header: 'Raison sociale', get: r => r.raison_sociale ?? '' },
      { header: 'Ref. Retina', get: r => r.reference_retina ?? '' },
      { header: 'Date depot ENEMAT', get: r => fmtDate(r.date_depot_enemat) },
      { header: 'Depot', get: depotName },
      { header: 'Adresse', get: r => r.adresse_societe_ligne1 ?? '' },
      { header: 'Code postal', get: r => r.adresse_societe_cp ?? '' },
      { header: 'Ville', get: r => r.adresse_societe_ville ?? '' },
      { header: 'Telephone', get: r => r.telephone ?? '' },
      { header: 'Email', get: r => r.email ?? '' },
      { header: 'Commercial', get: commercialName },
      { header: 'Livreur', get: livreurName },
      { header: 'Controle valide', get: (r: any) => (cqOkSet.has(r.id) ? 'Oui' : 'Non') },
      { header: 'Lot', get: r => r.numero_lot_enemat ?? '' },
      { header: 'N° facture', get: r => r.numero_facture_enemat ?? '' },
    ]

    let columns = commonColumns
    let sheetName = 'Paiements'
    let filenameSuffix = 'export'

    if (body.export_mode === 'commercial') {
      columns = [
        ...commonColumns,
        { header: 'Velos valides', get: r => r.velo_valide ?? 0 },
        { header: 'APF commercial envoye', get: r => fmtBool(r.commercial_apf_envoye) },
        { header: 'APF commercial envoye le', get: r => fmtDate(r.commercial_apf_envoye_le) },
        { header: 'Paye', get: r => fmtBool(r.commercial_paye) },
        { header: 'Paye le', get: r => fmtDate(r.commercial_paye_le) },
      ]
      sheetName = 'Commerciaux'
      filenameSuffix = 'commerciaux'
    } else if (body.export_mode === 'livreur') {
      columns = [
        ...commonColumns,
        { header: 'Velos valides', get: r => r.velo_valide ?? 0 },
        { header: 'APF livreur envoye', get: r => fmtBool(r.livreur_apf_envoye) },
        { header: 'APF livreur envoye le', get: r => fmtDate(r.livreur_apf_envoye_le) },
        { header: 'Paye', get: r => fmtBool(r.livreur_paye) },
        { header: 'Paye le', get: r => fmtDate(r.livreur_paye_le) },
      ]
      sheetName = 'Livreurs'
      filenameSuffix = 'livreurs'
    } else {
      // depot
      columns = [
        ...commonColumns,
        { header: 'ENEMAT paye', get: r => fmtBool(enematPaye(r)) },
        { header: 'ENEMAT paye le', get: r => fmtDate(r.date_paye_enemat) },
        { header: 'Velos valides', get: r => r.velo_valide ?? 0 },
      ]
      sheetName = 'Depots'
      filenameSuffix = 'depots'
    }

    // Mode commercial : on regroupe par commercial (tri alphabetique) — pas de sous-feuilles
    // mais tri prealable pour grouper visuellement les lignes.
    let sortedRows = rows
    if (body.export_mode === 'commercial') {
      sortedRows = [...rows].sort((a, b) => commercialName(a).localeCompare(commercialName(b)))
    } else if (body.export_mode === 'livreur') {
      sortedRows = [...rows].sort((a, b) => livreurName(a).localeCompare(livreurName(b)))
    } else if (body.export_mode === 'depot') {
      sortedRows = [...rows].sort((a, b) => depotName(a).localeCompare(depotName(b)))
    }

    const headers = columns.map(c => c.header)
    const sheetData = [
      headers,
      ...sortedRows.map(r => columns.map(c => c.get(r) ?? '')),
    ]

    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    ws['!cols'] = headers.map((h, i) => {
      const maxLen = Math.max(
        h.length,
        ...sheetData.slice(1).map(r => String(r[i] ?? '').length)
      )
      return { wch: Math.min(maxLen + 2, 40) }
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const today = new Date().toISOString().slice(0, 10)
    const filename = `paiements-${filenameSuffix}-${today}.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur POST /api/admin/paiements/export:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
