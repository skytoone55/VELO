import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * GET /api/admin/fnuci
 * Liste paginee des codes FNUCI avec jointure client
 * Query params: search, statut, page, pageSize
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
    if (isAuthError(auth)) return auth

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const statut = searchParams.get('statut')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(500, Math.max(10, parseInt(searchParams.get('pageSize') || '50')))
    const sortBy = searchParams.get('sortBy') || 'numero'
    const sortOrder = searchParams.get('sortOrder') || 'asc'

    const SORTABLE = ['numero', 'reference', 'statut', 'attribue_at', 'created_at']
    const safeSortBy = SORTABLE.includes(sortBy) ? sortBy : 'numero'

    const supabase = createAdminClient()

    let query = supabase
      .from('fnuci')
      .select(`
        id, numero, reference, statut, detenteur, client_id, livraison_id,
        attribue_at, distribue_at, created_at,
        client:clients(id, raison_sociale, reference_retina)
      `, { count: 'exact' })
      .order(safeSortBy, { ascending: sortOrder === 'asc' })

    if (search) {
      query = query.or(`reference.ilike.%${search.toUpperCase()}%,detenteur.ilike.%${search}%`)
    }

    if (statut && statut !== 'all') {
      query = query.eq('statut', statut)
    }

    const startIndex = (page - 1) * pageSize
    query = query.range(startIndex, startIndex + pageSize - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('Erreur FNUCI:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const totalFiltered = count || 0

    return NextResponse.json({
      fnuci: data || [],
      pagination: {
        page,
        pageSize,
        totalPages: Math.ceil(totalFiltered / pageSize),
        totalFiltered,
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
 * Changer le statut d'un FNUCI (bloquer / debloquer)
 * Body: { id, statut }
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin'])
    if (isAuthError(auth)) return auth

    const { id, statut } = await request.json()

    if (!id || !statut) {
      return NextResponse.json({ error: 'id et statut requis' }, { status: 400 })
    }

    const ALLOWED_STATUTS = ['disponible', 'distribue', 'bloque']
    if (!ALLOWED_STATUTS.includes(statut)) {
      return NextResponse.json({ error: `Statut invalide. Valeurs autorisees: ${ALLOWED_STATUTS.join(', ')}` }, { status: 400 })
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()

    // Si on debloque (→ disponible), on efface client_id et livraison_id
    const updateData: Record<string, unknown> = { statut, updated_at: now }
    if (statut === 'disponible') {
      updateData.client_id = null
      updateData.livraison_id = null
      updateData.attribue_at = null
    }

    const { error } = await supabase
      .from('fnuci')
      .update(updateData)
      .eq('id', id)

    if (error) {
      console.error('Erreur PATCH FNUCI:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log audit
    await supabase.from('audit_log').insert({
      user_id: auth.id,
      action: `fnuci_${statut}`,
      entity_type: 'fnuci',
      entity_id: id,
      details: { statut },
    }).then(() => {})

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur PATCH /api/admin/fnuci:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
