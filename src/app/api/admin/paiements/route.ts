import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * GET /api/admin/paiements
 * Liste des clients deposes ENEMAT (statut_enemat = 'depose_enemat') pour le module paiements.
 *
 * Query params :
 * - tenant (string) : filtre tenant (info, pas applique au filtre SQL direct — tenant vient de env)
 * - depot_id (uuid)
 * - paiement_livreur_id (uuid)
 * - commercial_code (string)
 * - enemat_paye ('true'|'false') : filtre derive de statut_enemat = 'paye_enemat' (lecture seule)
 * - commercial_paye ('true'|'false')
 * - livreur_paye ('true'|'false')
 * - search (string) : recherche raison_sociale OR reference_retina
 * - page (number, default 1)
 * - limit (number, default 50, max 200)
 *
 * Acces : super_admin uniquement (les paiements sont reserves a la direction).
 *
 * Note : `enemat_paye` est un champ VIRTUEL calcule a partir de `statut_enemat === 'paye_enemat'`.
 *        Il n'existe plus en colonne. Le statut ENEMAT est gere par le module ENEMAT.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin'])
    if (isAuthError(auth)) return auth

    const { searchParams } = new URL(request.url)
    // Nouveaux params pluriels (multi-select) — fallback sur les anciens singuliers pour retrocompat
    const parseCsv = (v: string | null): string[] =>
      v ? v.split(',').map(s => s.trim()).filter(Boolean) : []

    const depotIdsParam = parseCsv(searchParams.get('depot_ids'))
    const livreurIdsParam = parseCsv(searchParams.get('livreur_ids'))
    const commercialCodesParam = parseCsv(searchParams.get('commercial_codes'))

    const depotIdSingle = searchParams.get('depot_id')
    const livreurIdSingle = searchParams.get('paiement_livreur_id')
    const commercialCodeSingle = searchParams.get('commercial_code')

    const depotIds = depotIdsParam.length > 0
      ? depotIdsParam
      : (depotIdSingle ? [depotIdSingle] : [])
    const livreurIds = livreurIdsParam.length > 0
      ? livreurIdsParam
      : (livreurIdSingle ? [livreurIdSingle] : [])
    const commercialCodes = commercialCodesParam.length > 0
      ? commercialCodesParam
      : (commercialCodeSingle ? [commercialCodeSingle] : [])

    // Filtre ENEMAT : nouveau param `statut_enemat` (4 valeurs) prioritaire,
    // fallback sur l'ancien `enemat_paye` (true/false) pour retrocompat.
    const ENEMAT_VALEURS_PAIEMENTS = ['depose_enemat', 'apf_enemat', 'paye_enemat'] as const
    const statutEnematParam = searchParams.get('statut_enemat')
    const statutEnematFiltre = (ENEMAT_VALEURS_PAIEMENTS as readonly string[]).includes(statutEnematParam || '')
      ? statutEnematParam
      : null
    const enematPaye = searchParams.get('enemat_paye')
    const commercialPaye = searchParams.get('commercial_paye')
    const livreurPaye = searchParams.get('livreur_paye')
    const commercialApfEnvoye = searchParams.get('commercial_apf_envoye')
    const livreurApfEnvoye = searchParams.get('livreur_apf_envoye')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = (page - 1) * limit

    const supabase = createAdminClient()

    let query = supabase
      .from('clients')
      .select(
        `id, raison_sociale, reference_retina, telephone, email,
         adresse_societe_ligne1, adresse_societe_cp, adresse_societe_ville, departement,
         commercial_assigne, commercial_code, monday_board_id,
         depot_retrait_id, depot_logistique_id, paiement_livreur_id,
         statut_enemat, date_depot_enemat, date_apf_enemat, date_paye_enemat,
         commercial_apf_envoye, commercial_apf_envoye_le,
         commercial_paye, commercial_paye_le,
         livreur_apf_envoye, livreur_apf_envoye_le,
         livreur_paye, livreur_paye_le,
         paiement_notes, velo_valide,
         depot:depot_logistique_id (id, nom),
         commercial:commercial_code (code, nom, parent_code),
         livreur:paiement_livreur_id (id, nom, prenom, email)`,
        { count: 'exact' }
      )
      .in('statut_enemat', ['depose_enemat', 'apf_enemat', 'paye_enemat'])
      .order('date_depot_enemat', { ascending: false })
      .range(offset, offset + limit - 1)

    if (depotIds.length === 1) {
      query = query.eq('depot_logistique_id', depotIds[0])
    } else if (depotIds.length > 1) {
      query = query.in('depot_logistique_id', depotIds)
    }
    if (livreurIds.length === 1) {
      query = query.eq('paiement_livreur_id', livreurIds[0])
    } else if (livreurIds.length > 1) {
      query = query.in('paiement_livreur_id', livreurIds)
    }
    if (commercialCodes.length === 1) {
      query = query.eq('commercial_code', commercialCodes[0])
    } else if (commercialCodes.length > 1) {
      query = query.in('commercial_code', commercialCodes)
    }
    // Filtre ENEMAT : `statut_enemat` (nouveau, prioritaire) ou `enemat_paye` (legacy)
    if (statutEnematFiltre) {
      query = query.eq('statut_enemat', statutEnematFiltre)
    } else if (enematPaye === 'true') {
      query = query.eq('statut_enemat', 'paye_enemat')
    } else if (enematPaye === 'false') {
      query = query.neq('statut_enemat', 'paye_enemat')
    }

    if (commercialPaye === 'true') query = query.eq('commercial_paye', true)
    else if (commercialPaye === 'false') query = query.eq('commercial_paye', false)

    if (livreurPaye === 'true') query = query.eq('livreur_paye', true)
    else if (livreurPaye === 'false') query = query.eq('livreur_paye', false)

    if (commercialApfEnvoye === 'true') query = query.eq('commercial_apf_envoye', true)
    else if (commercialApfEnvoye === 'false') query = query.eq('commercial_apf_envoye', false)

    if (livreurApfEnvoye === 'true') query = query.eq('livreur_apf_envoye', true)
    else if (livreurApfEnvoye === 'false') query = query.eq('livreur_apf_envoye', false)

    if (search) {
      const safe = search.replace(/[%,]/g, ' ').trim()
      if (safe) {
        query = query.or(
          `raison_sociale.ilike.%${safe}%,reference_retina.ilike.%${safe}%`
        )
      }
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Erreur GET /api/admin/paiements:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Injecter le champ virtuel `enemat_paye` (lecture seule)
    const clients = (data || []).map((c: any) => ({
      ...c,
      enemat_paye: c.statut_enemat === 'paye_enemat',
      enemat_paye_le: c.statut_enemat === 'paye_enemat' ? (c.date_paye_enemat ?? null) : null,
    }))

    // Deuxieme requete : somme des velos valides sur TOUS les clients filtres (pas seulement la page)
    let sumQuery = supabase
      .from('clients')
      .select('velo_valide')
      .in('statut_enemat', ['depose_enemat', 'apf_enemat', 'paye_enemat'])

    if (depotIds.length === 1) sumQuery = sumQuery.eq('depot_logistique_id', depotIds[0])
    else if (depotIds.length > 1) sumQuery = sumQuery.in('depot_logistique_id', depotIds)
    if (livreurIds.length === 1) sumQuery = sumQuery.eq('paiement_livreur_id', livreurIds[0])
    else if (livreurIds.length > 1) sumQuery = sumQuery.in('paiement_livreur_id', livreurIds)
    if (commercialCodes.length === 1) sumQuery = sumQuery.eq('commercial_code', commercialCodes[0])
    else if (commercialCodes.length > 1) sumQuery = sumQuery.in('commercial_code', commercialCodes)
    if (statutEnematFiltre) {
      sumQuery = sumQuery.eq('statut_enemat', statutEnematFiltre)
    } else if (enematPaye === 'true') {
      sumQuery = sumQuery.eq('statut_enemat', 'paye_enemat')
    } else if (enematPaye === 'false') {
      sumQuery = sumQuery.neq('statut_enemat', 'paye_enemat')
    }
    if (commercialPaye === 'true') sumQuery = sumQuery.eq('commercial_paye', true)
    else if (commercialPaye === 'false') sumQuery = sumQuery.eq('commercial_paye', false)
    if (livreurPaye === 'true') sumQuery = sumQuery.eq('livreur_paye', true)
    else if (livreurPaye === 'false') sumQuery = sumQuery.eq('livreur_paye', false)
    if (commercialApfEnvoye === 'true') sumQuery = sumQuery.eq('commercial_apf_envoye', true)
    else if (commercialApfEnvoye === 'false') sumQuery = sumQuery.eq('commercial_apf_envoye', false)
    if (livreurApfEnvoye === 'true') sumQuery = sumQuery.eq('livreur_apf_envoye', true)
    else if (livreurApfEnvoye === 'false') sumQuery = sumQuery.eq('livreur_apf_envoye', false)
    if (search) {
      const safe = search.replace(/[%,]/g, ' ').trim()
      if (safe) {
        sumQuery = sumQuery.or(
          `raison_sociale.ilike.%${safe}%,reference_retina.ilike.%${safe}%`
        )
      }
    }

    const { data: sumData } = await sumQuery
    const totalVelosValides = (sumData || []).reduce(
      (acc: number, row: any) => acc + (row.velo_valide ?? 0),
      0
    )

    return NextResponse.json({
      clients,
      total: count ?? 0,
      totalVelosValides,
      page,
      limit,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur GET /api/admin/paiements:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
