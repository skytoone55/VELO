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
