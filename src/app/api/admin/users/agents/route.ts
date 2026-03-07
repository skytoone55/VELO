import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/admin/users/agents
 * Liste les agents secteur (pour le select lors de la création d'un livreur)
 * Filtre optionnel: ?departement=974
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(authResult)) return authResult

    const supabase = await createClient()
    const departement = request.nextUrl.searchParams.get('departement')

    let query = supabase
      .from('users_profile')
      .select('id, nom, prenom, email, departement, depot_ids')
      .eq('role', 'agent_secteur')
      .eq('actif', true)
      .order('nom', { ascending: true })

    if (departement) {
      query = query.eq('departement', departement)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ agents: data || [] })
  } catch (error) {
    console.error('Error listing agents:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
