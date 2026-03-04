import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePagination } from '@/lib/constants'

/**
 * API pour lire les clients depuis SUPABASE (cache local)
 *
 * Architecture:
 * - Monday = Source de vérité (SSOT)
 * - Supabase = Cache local synchronisé via webhook
 * - Cette API = Lecture rapide depuis le cache
 *
 * La synchronisation Monday → Supabase se fait via:
 * 1. Webhook /api/webhooks/monday (temps réel)
 * 2. Sync manuelle /api/sync/monday (batch)
 *
 * GET /api/clients - Liste les clients (paginé)
 * GET /api/clients?page=1&pageSize=20 - Pagination
 * GET /api/clients?search=xxx - Recherche
 * GET /api/clients?statut=xxx - Filtre par statut commercial
 * GET /api/clients?departement=xxx - Filtre par département
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.toLowerCase()

    // Paramètres de pagination avec validation
    const { page, pageSize } = validatePagination(
      searchParams.get('page') || '1',
      searchParams.get('pageSize') || '20'
    )

    // Filtres
    const statutFilter = searchParams.get('statut')
    const departementFilter = searchParams.get('departement')
    const nafFilter = searchParams.get('naf')

    const adminClient = createAdminClient()

    // Construire la requête de base
    let query = adminClient
      .from('clients')
      .select('*', { count: 'exact' })
      .not('monday_sync_status', 'eq', 'deleted') // Exclure les supprimés

    // Appliquer les filtres

    // Filtre recherche texte (ilike pour case-insensitive)
    if (search) {
      query = query.or(
        `raison_sociale.ilike.%${search}%,` +
        `siret.ilike.%${search}%,` +
        `email.ilike.%${search}%,` +
        `reference_dossier.ilike.%${search}%,` +
        `telephone.ilike.%${search}%`
      )
    }

    // Filtre par statut commercial
    if (statutFilter && statutFilter !== 'all') {
      query = query.eq('statut_commercial', statutFilter)
    }

    // Filtre par département
    if (departementFilter && departementFilter !== 'all') {
      query = query.eq('departement', departementFilter)
    }

    // Filtre par statut NAF (ENEMAT)
    if (nafFilter && nafFilter !== 'all') {
      if (nafFilter === 'valide') {
        query = query.eq('code_enemat_valide', true)
      } else if (nafFilter === 'bloque') {
        query = query.eq('code_enemat_bloque', true)
      } else if (nafFilter === 'en_attente') {
        query = query.neq('code_enemat_valide', true).neq('code_enemat_bloque', true)
      }
    }

    // Compter le total avant pagination
    const { count: totalFiltered } = await query

    // Appliquer la pagination
    const startIndex = (page - 1) * pageSize
    query = query
      .order('updated_at', { ascending: false })
      .range(startIndex, startIndex + pageSize - 1)

    const { data: clients, error } = await query

    if (error) {
      throw error
    }

    // Compter le total de clients (sans filtres)
    const { count: totalClients } = await adminClient
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .not('monday_sync_status', 'eq', 'deleted')

    const totalPages = Math.ceil((totalFiltered || 0) / pageSize)

    return NextResponse.json({
      clients: clients || [],
      pagination: {
        page,
        pageSize,
        totalPages,
        totalFiltered: totalFiltered || 0,
        totalClients: totalClients || 0,
        startIndex: startIndex + 1,
        endIndex: Math.min(startIndex + pageSize, totalFiltered || 0),
      },
      source: 'supabase',
    })

  } catch (error) {
    console.error('Erreur récupération clients Supabase:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur de connexion à Supabase' },
      { status: 500 }
    )
  }
}
