import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(authResult)) return authResult

    const supabase = await createClient()
    const departement = request.nextUrl.searchParams.get('departement')
    const role = request.nextUrl.searchParams.get('role')

    let query = supabase
      .from('users_profile')
      .select('id, nom, prenom, email, role, departement, depot_ids')
      .in('role', role ? [role] : ['agent_secteur', 'livreur', 'admin', 'super_admin'])
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
