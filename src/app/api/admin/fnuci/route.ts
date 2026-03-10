import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * GET /api/admin/fnuci
 * Recherche et liste des codes FNUCI
 * Query params: search, statut, detenteur, limit
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
    if (isAuthError(auth)) return auth

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const statut = searchParams.get('statut')
    const detenteur = searchParams.get('detenteur')

    const sortByParam = searchParams.get('sortBy') || 'numero'
    const sortOrderParam = searchParams.get('sortOrder') || 'asc'
    const SORTABLE_COLS = ['numero', 'reference', 'statut', 'attribue_at', 'created_at']
    const safeSortBy = SORTABLE_COLS.includes(sortByParam) ? sortByParam : 'numero'
    const ascending = sortOrderParam === 'asc'

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get('pageSize') || '50')))

    const supabase = createAdminClient()
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('fnuci')
      .select('*, client:clients(id, raison_sociale, reference_retina)', { count: 'exact' })
      .order(safeSortBy, { ascending })
      .range(from, to)

    if (search) {
      query = query.ilike('reference', `${search.toUpperCase()}%`)
    }

    if (statut) {
      query = query.eq('statut', statut)
    }

    if (detenteur) {
      query = query.eq('detenteur', detenteur)
    }

    const { data, count, error } = await query

    if (error) {
      console.error('Erreur FNUCI:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      fnuci: data || [],
      pagination: {
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
        totalFiltered: count || 0,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur GET /api/admin/fnuci:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/fnuci
 * Change le statut d'un code FNUCI (block/unblock/unassign)
 * Body: { id: string, statut: 'disponible' | 'bloque' }
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin'])
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const { id, statut } = body as { id: string; statut: string }

    if (!id || !['disponible', 'bloque'].includes(statut)) {
      return NextResponse.json(
        { error: 'id et statut (disponible|bloque) requis' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Fetch current record
    const { data: current, error: fetchErr } = await supabase
      .from('fnuci')
      .select('id, statut, client_id')
      .eq('id', id)
      .single()

    if (fetchErr || !current) {
      return NextResponse.json({ error: 'Code FNUCI non trouv\u00e9' }, { status: 404 })
    }

    // Validate transition
    const allowed: Record<string, string[]> = {
      disponible: ['bloque'],
      distribue: ['bloque'],
      attribue: ['disponible'],
      bloque: ['disponible'],
    }
    if (!allowed[current.statut]?.includes(statut)) {
      return NextResponse.json(
        { error: `Transition ${current.statut} \u2192 ${statut} non autoris\u00e9e` },
        { status: 400 }
      )
    }

    // Build update
    const updateData: Record<string, unknown> = { statut }
    if (current.statut === 'attribue' && statut === 'disponible') {
      updateData.client_id = null
      updateData.livraison_id = null
      updateData.attribue_at = null
    }

    const { error: updateErr } = await supabase
      .from('fnuci')
      .update(updateData)
      .eq('id', id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur PATCH /api/admin/fnuci:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
