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
    const limit = parseInt(searchParams.get('limit') || '50')

    const supabase = createAdminClient()

    let query = supabase
      .from('fnuci')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 200))

    if (search) {
      query = query.ilike('reference', `${search.toUpperCase()}%`)
    }

    if (statut) {
      query = query.eq('statut', statut)
    }

    if (detenteur) {
      query = query.eq('detenteur', detenteur)
    }

    const { data, error } = await query

    if (error) {
      console.error('Erreur FNUCI:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ fnuci: data || [] })
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
      return NextResponse.json({ error: 'Code FNUCI non trouvé' }, { status: 404 })
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
        { error: `Transition ${current.statut} → ${statut} non autorisée` },
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
