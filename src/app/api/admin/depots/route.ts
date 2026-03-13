import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

export async function GET() {
  try {
    const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
    if (isAuthError(authResult)) return authResult

    const adminClient = createAdminClient()
    let query = adminClient
      .from('depots')
      .select('id, nom, type, jours_ouverture, capacite_velos_jour, creneau_duree_minutes, actif')
      .eq('actif', true)
      .order('nom')

    // Agent/livreur : restreindre aux dépôts assignés
    if (['agent_secteur', 'livreur'].includes(authResult.role) && authResult.depot_ids?.length) {
      query = query.in('id', authResult.depot_ids)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ depots: data || [] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
